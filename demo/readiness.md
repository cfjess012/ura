---
artifact: demo-readiness
slices-covered: S1, S2, S2.5, S3, S4, S4.7, S4.8, S5, S6
reviewed-on: 2026-08-23
walked-with-owner: partially — S1, S2 and S2.5 walked by the owner; S3 and S4 not yet
---

# Demo readiness

What the room will actually see, whether it exists, and what happens if it
breaks live. **Build completeness and demo readiness are different things** —
a requirement can be met and still be unfit to show, and this file exists
because nothing was tracking the second one.

One row per beat. A beat with a blank cell is not a beat, it is a hope.

## The beats

| # | What the audience sees | Delivered by | Built | Walked by a person | If it breaks live |
|---|---|---|---|---|---|
| 1 | Intake closes whole risk areas before Tier 1 begins | S2 + instrument 2026-08-21.7 | yes | yes — owner | Say the number out loud instead: four intake answers decide four of eleven areas (measured 2026-08-22 across five profiles — see `test/unit/prefill-reach.test.ts`) |
| 2 | Areas pre-answered from intake, each showing its reason | S2 · FR-22 | yes | yes — owner | Fall back to the gate screen, which states the same reason |
| 3 | Governance applies to everyone, so it is never asked | instrument · G-36 | yes | no | Point at the rail entry "Applies · not asked" |
| 4 | One selection tailors the rest of the assessment | S3 · FR-4 | yes | no | Show the summary's "What we'll ask about" list instead |
| 5 | An answer in one domain lights a path in another | S3 engine · FR-5 | yes | no | Read the reason aloud from the Added-for-you note |
| 6 | Change your mind, everything re-derives, nothing stored | S3 · FR-9 | yes | no | Skip — this beat needs a live change to land at all |
| 11 | A band the platform works out for you, offered not imposed | S4 · FR-7 | yes | no | Point at the dashed suggestion and say nothing is pre-selected |
| 7 | Roles enforced server-side, not simulated | S2.5 · FR-25 | yes | yes — owner | Switch to the Risk Assessor and show the missing start form |
| 8 | A severity answer summons a control, with its reason | S4 | yes | no | Answer Provider Access High and read the control list aloud; if the screen fails, the reasons are in uat/S4.md |
| 12 | A stuck question is handed to a named office, a bell obligation pins until answered, resolve refused while empty | S4.7 · FR-36 | yes | yes — walked via 11-screenshot run 2026-08-22 | Show walk-8..11 screenshots; the thread survives in the record |
| 13 | An area that applies but asks nothing says so, and the summary counts work apart from scope | S4.8 · FR-35 | yes | yes — builder walk 2026-08-23 | Say the split out loud: four areas open detailed questions, five are recorded for a reviewer. It is the honest version of the same slide |
| 14 | A running ledger — active paths, severities, and the controls they require — recomputed as you answer, never stored | S5 · FR-10, FR-11 | yes | yes — builder walk 2026-08-23 | Answer Provider Access at High and read the six controls aloud; the derivation reasons are also on the summary if the panel fails |
| 15 | The only stage that asks about reality: does the control actually exist, and a No that cannot be given without saying what is missing | S6 · FR-12, FR-13 | yes | yes — builder walk 2026-08-23 | Beat 4 of `demo/three-minutes.md`. If the screen fails, say the sentence: a gap named here is a finding a reviewer can act on |
| 9 | "24 of 29 fields already answered" → ServiceNow record | S3.5 | **no** | no | Not demoable yet — describe it from §27 instead |
| 10 | Every agent enumerated: what it does, what it can see | S2 · FR-24 | yes | partially | Open `docs/agent-map.html` directly if the app is down |

## Risks that are not features

| Risk | Why it matters | Mitigation |
|---|---|---|
| The demo runs on a laptop dev server | A sleep, a crash or a hot-reload ends the demo | Decide before demo day whether to deploy or to rehearse on the laptop with sleep disabled |
| The assessment list opens on ~127 test projects | First impression is junk data named `BLAST 1787331625892` | `pnpm db:reset --yes` then seed curated demo data — held until demo-data day by owner decision |
| No curated scenario exists | Typing a scenario live is slow and error-prone | Build the demo profile as its own slice before the demo |
| Beats 4, 5 and 6 have never been used by a person | Every defect that mattered this session was found by the owner using the product | Owner walks S3 end to end before demo day and reports what feels wrong |

## What we will not claim

- The agentic layer is **designed and registered, not built** (§22.1, 29 entries). Show the transparency page; do not imply anything runs.
- FR-5's condition renderer does not exist. Explanations are authored, not generated.
- Resilience is not gated anywhere in the instrument (audit C-7, open).
- **Tier 3 asks about 15 of the 51 control objectives** (S6). The other 36 have no question text in the reference instrument, so they are recorded for a reviewer and the screen says so. Do not imply the control questions are complete.
- **FR-21 is half built**: a note travels with its answer; a free note attachable anywhere does not exist (uat/S6.md).
- **Depth exists in four of the eleven risk areas** (G-50). Third party, AI, data and security carry every path, severity question and control objective. The other seven record that the area is in scope for a reviewer and ask nothing further. The product now says this itself on every quiet area (S4.8), so the honest answer is on screen rather than in the presenter's memory.
