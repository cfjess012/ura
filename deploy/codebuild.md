# Fallback: build the image on AWS instead of in CloudShell

Use this only if `docker build` in CloudShell fails with **`no space left on
device`**, or Docker is unavailable in your region. The result is the same
image in the same registry; the build just happens on AWS's disk.

## One-time setup

```bash
export ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export BUCKET=ura-build-$ACCOUNT
aws s3 mb s3://$BUCKET

aws iam create-role --role-name uraCodeBuildRole \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"codebuild.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name uraCodeBuildRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser
aws iam attach-role-policy --role-name uraCodeBuildRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
aws iam attach-role-policy --role-name uraCodeBuildRole \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess

aws codebuild create-project \
  --name ura-build \
  --source "{\"type\":\"S3\",\"location\":\"$BUCKET/source.zip\"}" \
  --artifacts '{"type":"NO_ARTIFACTS"}' \
  --environment "{\"type\":\"LINUX_CONTAINER\",\"image\":\"aws/codebuild/standard:7.0\",\"computeType\":\"BUILD_GENERAL1_SMALL\",\"privilegedMode\":true,\"environmentVariables\":[{\"name\":\"REGISTRY\",\"value\":\"$REGISTRYURI\"}]}" \
  --service-role arn:aws:iam::$ACCOUNT:role/uraCodeBuildRole
```

`privilegedMode` must be true — without it the build cannot run a Docker
daemon, and the failure message does not say so plainly.

## Every build

```bash
zip -qr /tmp/source.zip . -x '*.git*' 'node_modules/*' '.next*/*'
aws s3 cp /tmp/source.zip s3://$BUCKET/source.zip
aws codebuild start-build --project-name ura-build
```

Watch it:

```bash
aws codebuild batch-get-builds --ids <buildId from the previous output> \
  --query 'builds[0].{phase:currentPhase,status:buildStatus}'
```

Expected end state: `phase: COMPLETED`, `status: SUCCEEDED`. Then carry on
from **Step 5** of `deploy/README.md`.
