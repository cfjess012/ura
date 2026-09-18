# Description fixtures

Ten project descriptions, thinnest to richest, for testing the intake
coherence check (FR-43) and the document-assisted drafting path
(FR-40, FR-46).

Paste one into **Project Description** on the intake screen, or hand one to
the assistant as a document. They are plain `.txt` on purpose: that is what
both paths actually receive.

**Only the floor is asserted** — `test/unit/description-fixtures.test.ts`
proves 01 and 02 fall below it and the other eight pass it. The bands below
were **measured once**, on 2026-08-27, against `claude-sonnet-5` through the
agent's `/score-intake`. They are a record of what happened, not a contract:
a model is not deterministic and a rubric edit moves them. Re-measure with
`pnpm ai:check` rather than trusting this table.

| File | Exercises | Written to land |
|---|---|---|
| `01-floor-product-name.txt` | The floor's `minWords` (15). A product name and a pointer to a deck. | Below the floor — *"too thin to work from"*, no model call |
| `02-floor-not-prose.txt` | The floor's `minDistinctRatio` (0.4). Long enough to pass the word count, repetitive enough to fail as prose. | Below the floor — *"does not read as a description yet"*, and for a **different** reason than 01 |
| `03-not-yet-usable.txt` | Fluent corporate prose that says nothing routable. Clears the floor easily — the floor is a noise filter, not a content check. | Not yet usable (5–8) |
| `04-thin.txt` | A real activity, named, with no data, no audience, no vendor. The ordinary case. | Thin (9–12) |
| `05-workable-gaps.txt` | Clear purpose and a real audience; data flow and sensitivity absent. Should ask about the two routing-critical criteria first. | Workable (13–16) |
| `06-contradictory.txt` | **Internal consistency.** Opens "internal-only, no customer data, light-touch", then describes claimant names, an offshore partner with equal access, a vendor support login, and a document-reading model. Every claim is plausible alone. | High clarity, low consistency — the one thing a person cannot check for themselves |
| `07-robust-ai-thirdparty.txt` | The full-depth case: vendor AI, Special Category data, a US transfer for support access, and a fourth party (Bedrock) the customer does not contract with. Lights the most paths. | Robust (17–20) |
| `08-robust-no-ai-closes-areas.txt` | Equally detailed, but no AI, no vendor, no personal data, internal build. Proves intake **closes** areas rather than opening them — detail and risk are not the same axis. | Robust (17–20), few areas open |
| `09-robust-employment-ai.txt` | In-house AI proposing rosters. Workforce management is **EU AI Act Annex III 4(b) high-risk**, with Art. 26 deployer duties in force since 2 August 2026 (see `docs/ai-question-grounding.md`). Deliberately admits no works-council consultation and no appeal route, so `T3-AI-12` has something to bite on. **Also carries an unplanned contradiction** — see below. | **Workable (16/20), measured.** Consistency scored 1 of 4 |
| `10-vendor-document-for-drafting.txt` | Not a self-description — a **vendor security overview**, for the drafting path. Answers some questions in quotable sentences (residency, no-training, TLS 1.3/AES-256, SSO, 13-month log retention, SOC 2 + ISO 27001) and is **silent on others** (breach notification terms, sub-processor identities, pen-test cadence, BCP/DR, insurance). | Proposals on what it states; **abstention** on what it does not |

## Why 10 is the important one

Every other file tests scoring. `10` tests the never-guess rule: the point is
not that the assistant drafts well from it, but that it **abstains** on the
questions the document does not address, and that each proposal it does make
carries a verbatim quote that survives `quoteAppearsVerbatim`. A run where
everything gets an answer is a failing run.

`06` and `10` are a matched pair: one asks whether the platform notices a
person contradicting themselves, the other asks whether it notices a document
staying quiet.

## What `09` taught, at its first contact with a model

It was written to score Robust and scored **Workable, 16 of 20**, because the
grader raised a contradiction its author had not planted on purpose:

> "No vendor is involved and nothing is bought in." — against —
> "built by our own Digital team on a model we access through AWS Bedrock"

Both halves are verbatim in the file. The rubric is right and the fixture was
wrong: a paragraph claiming no vendor, two paragraphs above one naming a cloud
model provider, is exactly the kind of thing `06` exists to catch — and it
turned up by accident in the file next door.

**Left in deliberately.** An accidental contradiction that a person would
genuinely write is worth more as a fixture than a clean one, and rewording it
would delete evidence that the check works on prose nobody was trying to trip
it with. The band above records what it does, not what was hoped for.
