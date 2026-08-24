---
name: agent-capability
description: Build, wire and guard a capability in the agent service — the seams it goes behind, the four gates every output passes, the assessment record it must be grounded in, and the eval that decides whether it ships. Use when adding, changing or reviewing anything the agent does.
---

Implements SPEC §6.1 (the seams), §7 (the agentic contract), §22 (the
opportunity register) and G-42, G-63, G-64.

Read `agentic-design` first if you are deciding **whether** a capability
should exist. This skill is for building one that already should.

## The shape, every time

A capability is a function in `agent/src/`, a prompt **file** in
`agent/prompts/`, a gate, and a test that feeds the gate fabricated model
replies. In that order. The prompt is never a string literal — prompts exist
only as files, so the locked core cannot drift by somebody editing code.

```
agent/prompts/<name>.md    the instructions, versioned by hash
agent/src/<name>.ts        the call, and the gate that judges the reply
agent/test/<name>.test.ts  fabricated replies, including the wrong ones
```

`promptVersion()` hashes the prompt files and appears on every span and on
`/healthz`. When behaviour changes, that number says whether the prompt
changed with it.

## The four gates every output passes

Ordered by what they catch. A failure at any of them produces an **error**,
never a lower-confidence answer — there is no such thing here.

**1 · Never-guess** (`violatesNeverGuess`, shared contract)
`not_stated` means value, quote and source are all null. `stated` and
`inferred` both require a quote. An inference with nothing to point at is a
guess. Abstention is a **correct outcome** and is scored as one.

**2 · Verbatim** (`quoteAppearsVerbatim`, shared contract)
The quote must appear in the source it cites, whitespace-normalised. Watch
for the **stitched quote** — two real fragments spliced into a sentence that
never existed. It is the failure that most resembles a right answer.

**There is one matcher and there must only ever be one.** The gate, the eval
scorer and the panel that highlights the passage all call it. A second means
a quote can pass the gate and fail to highlight — provenance appearing
broken at the exact moment somebody checks it.

**3 · Provenance is real**
The cited source must be one that was actually supplied. Inventing the
provenance is worse than inventing the answer, because it survives review.

**4 · Contextual** (`contextualGuardrail`, shared contract)
Everything a person reads — a conversational reply, and a draft's `because`
— is checked against the assessment record:

- **No internal identifier reaches a person.** Question ids, control codes,
  person ids. This is the likeliest failure of all: the model is handed ids
  in its own instructions and repeating one feels helpful. A requester told
  "t3.t3_iam_02 is unanswered" has been handed our problem instead of an
  answer.
- **No answer is attributed to somebody who did not give it** (G-42). The
  failure is specific: a model recapping "you said the data is Confidential"
  when they said no such thing, which a busy person reads as confirmation
  and stops checking.

## The assessment record is required, not optional

Every capability takes an `AssessmentContext`: the activity in the person's
own words, what is on record as label-and-value, and what is still open.

Two reasons it is required rather than defaulted:

1. **The output is checked against it.** An agent that cannot be told what
   is on record cannot be caught claiming something that is not.
2. **It is already in human words.** Hand an agent internal identifiers and
   it will eventually say one out loud.

The service **refuses a request without one** rather than proceeding
unguarded. An unguarded reply is the single thing it must not produce.

## Conversation is held to a different standard, deliberately

The drafting gate demands verbatim evidence. The conversational gate cannot,
or a thought partner is impossible.

**The reply is context; it is never evidence.** World knowledge may inform
the conversation — "most tools like this touch personal data, does yours?" —
and should, because that is what makes it a partner rather than an
autocomplete. Nothing it says becomes an answer: the evidence flag only
decides whether a **drafting pass** runs, and that pass reads the person's
own words and abstains if they do not support one.

What the conversational gate does check is the one thing that would harm
somebody: **a claim that work was recorded, saved, submitted or signed.**
Someone who believes their assessment is submitted stops working on it.
Include contractions in that check — "That's been signed off" walked through
a pattern that only knew "has been".

## Never, in any capability

- Attest, declare, accept or resolve. Those are acts a named person
  performs, and the authority for them is derived server-side from the
  question — never from a request.
- Advance the interview on silence.
- Act as an orchestrator of the governed pipeline. **AgentCore is substrate,
  never the decider.**
- Ship reachable from the product UI before it works. Until then the
  transport stays `none`, which refuses in plain words, and the demo never
  implies otherwise (§24.8).

## Testing it

**Fabricated replies, not real ones.** A model behaving well proves nothing
about what happens when it does not. Every gate test hands it the shapes a
model produces when it is confidently wrong.

Then run it against a real model for free:

```sh
pnpm agent:ollama    # Ollama ≥0.19 serves /v1/messages in the Anthropic shape
pnpm agent:test
```

Two things that will bite you, both found this way: a reasoning model returns
`thinking` blocks before its text, so `content[0]` is its private
deliberation and not its answer; and that thinking consumes the token budget,
so `max_tokens` must be generous or the reply is empty.

**A local model measures the harness and never the quality bar.** No quality
conclusion and no baseline may come from an Ollama run.

## The eval decides whether it ships

Ground truth per question, and the rules that matter:

- A `not_stated` ground truth passes **only** on abstention.
- Include a trap where silence must **not** become "not applicable".
- **A false "not applicable" fails its whole module**, not just itself. An
  accepted false N/A is a waived control question — the worst thing this
  system can produce. A merely wrong answer fails only itself.
