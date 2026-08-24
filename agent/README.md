# The agent service

The only service that knows a model exists (SPEC §6.1). The web app reaches
it through `src/lib/agent.ts` and nothing else.

## Running it locally against Ollama

Free, and the right way to exercise the gates:

```sh
ollama serve            # 0.19+ serves /v1/messages in the Anthropic shape
pnpm agent:ollama       # the service on :8790, talking to qwen3:14b
```

Then point the web app at it:

```sh
AGENT_TRANSPORT=local AGENT_URL=http://localhost:8790 pnpm dev
```

**A local model measures the harness, never the quality bar.** Its job is to
prove the gates reject what they should. Never read a quality conclusion
from an Ollama run, and never update a baseline from one.

## Running it against Bedrock

```sh
AGENT_PROVIDER=bedrock AGENT_MODEL=<bedrock model id> pnpm agent:dev
```

Credentials and region resolve through the standard AWS chain, so on ECS the
task role is enough — no keys in the environment.

## What the gate refuses

The model proposes; `src/draft.ts` decides. A reply is refused, and becomes
an error rather than a lower-confidence answer, when:

- the quote does not appear **verbatim** in the source it cites — including
  a quote stitched from two real fragments that never appeared together,
  which is the failure that most resembles a right answer;
- it cites a source that was never supplied (inventing the provenance is
  worse than inventing the answer);
- it abstains while still carrying an answer, or infers with nothing to
  point at;
- it does not say why.

`pnpm agent:test` covers all of those with fabricated model replies, because
a model behaving well proves nothing about what happens when it does not.

## The prompt

`prompts/core.md` is the locked core, and prompts exist **only as files** —
nothing in this service builds prompt text from a string literal. Its hash
is on every span and on `/healthz`, so if behaviour changes you can tell
whether the prompt changed with it. Editing it is a governance change.
