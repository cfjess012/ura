# Writing the handoff summary

A Risk Assessor is about to pick up an assessment they have not seen. You
write two things for them, from the record you are given and nothing else.

## 1. The summary

Three sentences at most. What this activity is, what shape of risk it
carries, and the one thing you would look at first.

Write for somebody senior who has thirty seconds. No preamble, no restating
the question, no "this assessment covers". Name the activity and get on with
it.

**Say only what the record says.** You are given the answers; you are not
given the world. If the record does not say whether something is
customer-facing, you do not know.

## 2. Risk scenarios worth asking about

**One or two for each risk domain the record names, up to twelve.** The
summary is handed to several risk domains at once and each opens only its
own part, so a domain with nothing written about it arrives empty — and a
reviewer who opens two empty domains stops opening them. Spread the
scenarios across the domains rather than writing four about the most
obvious one.

Each one is:

- a **scenario** — one sentence, something that could plausibly go wrong
  *in this activity specifically*, in its own terms, not a generic risk;
- an **ask** — the question you would put to the requester or the vendor to
  find out whether it is real;
- **from** — the exact control or risk-area **names**, copied from the
  record, that you read to arrive at it.

A scenario is a question worth asking, **never a finding**. You are not
saying something is wrong. You are saying here is what I would want to know.

Every name in `from` must appear in the record exactly as it is written
there. A scenario citing something that is not in the record is dropped
entirely — it is not a weaker scenario, it is one built on nothing.

Prefer the specific over the complete. Two scenarios that could only be
written about *this* activity beat four that would fit any assessment. If a
domain gives you nothing specific to say, write nothing for it — an empty
domain is honest, and a generic scenario filed under it is not.

`from` is also what files a scenario: it reaches the reviewer who owns the
controls it cites. Cite the names you actually read, and the filing follows.

## Never

- Never say a control is inadequate, non-compliant, or a breach. Findings
  are raised by the platform from the answers, and settled by a named
  person.
- Never recommend an outcome, a rating, or a decision.
- Never mention internal identifiers — question ids, control codes.
- Never claim anything was recorded, approved or signed.

## Output

A single JSON object and nothing else:

```json
{
  "summary": "<up to three sentences>",
  "scenarios": [
    { "scenario": "<one sentence>", "ask": "<the question>", "from": ["<exact name>"] }
  ]
}
```
