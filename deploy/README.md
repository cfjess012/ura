# Deploying the Front Door AI Risk Advisor to AWS

Written to be run in **AWS CloudShell** in the sandbox account, top to bottom.
Roughly **25 minutes**, most of it waiting for RDS.

Every step says what it should print. If a step prints something else, stop
there — the next step will not fix it, and the failure modes that actually
happen are named at the bottom.

> **Why not App Runner.** App Runner closed to new customers on 30 April 2026.
> AWS's named successor is **ECS Express Mode**, which is what this uses: one
> command gives a Fargate service, an Application Load Balancer, TLS, auto
> scaling and a public URL.

---

## What you end up with

| Piece | Service | Why it is there |
|---|---|---|
| The app | ECS Express Mode (Fargate) | One command; gives an HTTPS URL, load balancer, autoscaling and CloudWatch logs |
| The image | Amazon ECR | Where the container lives |
| The data | RDS PostgreSQL 16 | Every invariant this product relies on is a Postgres constraint (SPEC G-53) |
| The plumbing | CloudFormation | ECR, RDS, security group and the two IAM roles Express Mode requires |

Not deployed yet: the agent service. Its seams are in the codebase and the
Phase 2 section below says what changes when it arrives.

---

## Before you start

```bash
aws sts get-caller-identity        # confirm you are in the sandbox account
aws configure get region           # if empty: export AWS_REGION=us-east-1
```

You need a **default VPC with public subnets** — Express Mode puts its load
balancer there:

```bash
aws ec2 describe-vpcs --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].{VpcId:VpcId,Cidr:CidrBlock}' --output table
```

Expected: a VpcId and a CIDR, usually `172.31.0.0/16`. **Write both down.**
If it returns `None`, create one with `aws ec2 create-default-vpc`.

---

## Step 1 · Get the code into CloudShell

```bash
git clone <your-repo-url> ura && cd ura
```

There is no git remote on this repository yet. If you have not pushed it
anywhere, use CloudShell's **Actions → Upload file** with a zip of the repo:

```bash
# on your laptop, from the repo root
git archive --format=zip -o ~/ura.zip HEAD
# then in CloudShell, after uploading
unzip -q ~/ura.zip -d ura && cd ura
```

---

## Step 2 · Stand up the registry, the database and the roles

Pick a database password first — 12+ characters, no `/ @ "` or spaces.

```bash
export AWS_REGION=$(aws configure get region)
export DB_PASSWORD='<choose one>'
export MY_IP=$(curl -s https://checkip.amazonaws.com)/32
export VPC_ID=<the VpcId from above>
export VPC_CIDR=<the CIDR from above>

aws cloudformation deploy \
  --template-file deploy/infra.yaml \
  --stack-name ura \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
      DbPassword="$DB_PASSWORD" \
      AdminCidr="$MY_IP" \
      VpcId="$VPC_ID" \
      VpcCidr="$VPC_CIDR"
```

Expected: `Successfully created/updated stack - ura`. **Takes about 10 minutes**
— RDS is the slow part.

Then collect what it made:

```bash
eval $(aws cloudformation describe-stacks --stack-name ura \
  --query 'Stacks[0].Outputs[?OutputKey==`RegistryUri`||OutputKey==`DatabaseHost`||OutputKey==`TaskExecutionRoleArn`||OutputKey==`ExpressInfrastructureRoleArn`].[OutputKey,OutputValue]' \
  --output text | awk '{print toupper($1)"="$2}' | sed 's/^/export /')

export DATABASE_URL="postgres://ura:${DB_PASSWORD}@${DATABASEHOST}:5432/ura"
echo "$REGISTRYURI"      # 123456789012.dkr.ecr.us-east-1.amazonaws.com/ura-web
```

---

## Step 3 · Create the schema and the demo data

Do this **before** the app runs, so the first request meets a database that
is already correct.

```bash
corepack enable && pnpm install --frozen-lockfile
pnpm db:migrate       # expected: each migration applied, in filename order
pnpm instrument:seed  # the questions, severity rubric and control objectives
pnpm demo:seed        # expected: "demo data ready: 4 assessments, ..."
```

If `pnpm db:migrate` hangs and then times out, the security group does not
have your address. Your CloudShell IP can change between sessions:

```bash
aws cloudformation deploy --template-file deploy/infra.yaml --stack-name ura \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides DbPassword="$DB_PASSWORD" \
      AdminCidr="$(curl -s https://checkip.amazonaws.com)/32" \
      VpcId="$VPC_ID" VpcCidr="$VPC_CIDR"
```

---

## Step 4 · Build the image and push it

CloudShell has Docker. It also has limited disk, so build in `/tmp`:

```bash
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${REGISTRYURI%/*}"

DOCKER_BUILDKIT=1 docker build -t "$REGISTRYURI:latest" .
docker push "$REGISTRYURI:latest"
```

Expected: `latest: digest: sha256:… size: …`.

**If this fails with `no space left on device`**, use the CodeBuild fallback
in `deploy/codebuild.md` — same image, built on AWS's disk instead of yours.

---

## Step 5 · Create the service

```bash
aws ecs create-express-gateway-service \
  --service-name ura-web \
  --execution-role-arn "$TASKEXECUTIONROLEARN" \
  --infrastructure-role-arn "$EXPRESSINFRASTRUCTUREROLEARN" \
  --primary-container "{\"image\":\"${REGISTRYURI}:latest\",\"containerPort\":3000,\"environment\":[{\"name\":\"DATABASE_URL\",\"value\":\"${DATABASE_URL}\"},{\"name\":\"NODE_ENV\",\"value\":\"production\"}]}" \
  --health-check-path "/healthz" \
  --cpu 1 \
  --memory 2 \
  --scaling-target '{"minTaskCount":1,"maxTaskCount":4}' \
  --monitor-resources
```

Expected: resources provision for a few minutes, then `"statusCode": "ACTIVE"`
and a URL of the form `https://ura-web.ecs.<region>.on.aws`.

> **If it fails with an assume-role error, wait a minute and run it again.**
> IAM roles are eventually consistent and the stack has only just made them.
> This is expected, not a mistake.

> **`--health-check-path "/healthz"` matters.** That endpoint answers without
> touching Postgres. Pointed at `/`, a database that is merely unreachable
> makes the target fail its health check, the platform restarts the task, and
> the logs read like a broken application instead of a missing network rule.

---

## Step 6 · Check it, in this order

```bash
URL=https://ura-web.ecs.${AWS_REGION}.on.aws

curl -s $URL/healthz    # {"ok":true,"service":"ura-web"}       process is up
curl -s $URL/readyz     # {"ok":true,"database":"reachable",…}  Postgres is reachable
```

If `/healthz` answers and `/readyz` returns 503, the app is fine and the
database is not reachable **from the tasks** — almost always `VpcCidr` not
matching the VPC the tasks are in. Fix that parameter and redeploy the stack.

Then open the URL. You should land on the front door with four demo
assessments behind it, one of them already with a reviewer.

---

## Updating it

```bash
docker build -t "$REGISTRYURI:latest" . && docker push "$REGISTRYURI:latest"
aws ecs update-express-gateway-service --service-name ura-web \
  --primary-container "{\"image\":\"${REGISTRYURI}:latest\",\"containerPort\":3000,\"environment\":[{\"name\":\"DATABASE_URL\",\"value\":\"${DATABASE_URL}\"}]}" \
  --monitor-resources
```

Express Mode rolls it out as a canary and rolls back on 5XX alarms.

---

## Tearing it down

```bash
aws ecs delete-express-gateway-service --service-name ura-web --monitor-resources
aws cloudformation delete-stack --stack-name ura
```

The database is set to snapshot on delete, so the stack will leave one
behind deliberately. Delete it by hand when you are sure.

---

## What is deliberately not production

Say these out loud rather than being asked:

- **The persona switcher is not authentication.** There is no identity
  provider; a person picks who they are. It is a pilot device (SPEC §2) and
  the app must not be exposed beyond this sandbox.
- **`DATABASE_URL` is passed as a plain environment variable**, so it is
  visible to anyone who can describe the service. Acceptable for synthetic
  pilot data; for anything real, move it to Secrets Manager and create the
  service from your own task definition, which Express Mode supports.
- **The database is publicly reachable**, restricted to one address. That is
  a deliberate trade for being able to run migrations from CloudShell.
- **No custom domain and no WAF.**

## Phase 2 · what changes when the agent arrives

Nothing above is thrown away. The agent is a **second** container image and a
second Express Mode service; the web app reaches it through one module
(`src/lib/agent.ts`) and speaks to it over the wire contract, so pointing the
web app at it is an environment variable. See `deploy/architecture.md`.
