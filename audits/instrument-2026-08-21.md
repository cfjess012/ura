---
audit: instrument-coherence
spec-version: 2026-08-21.3
instrument: tier1-gates@2026-08-21.2 + intake (src/lib/intake.ts)
run-on: 2026-08-21
run-by: Claude, following .claude/skills/instrument-coherence
---

# Instrument coherence audit — intake + Tier 1

Scope: 18 intake fields across 4 sections, 11 Tier-1 gates, 5 pre-fill rules.
Tier 2 and Tier 3 do not exist yet (S4, S6), so §3 rubric quality is not
assessed — there are no anchored severity questions to assess.

**Nothing in the instrument was changed.** Every item below is a proposal for
the owner; changing what is asked is a governance event (§8).

Headline: the instrument is structurally sound — every gate honours the
Tier-1 contract, every question is reachable, and no condition is
unsatisfiable. The problems are all in **discrimination**: what the
instrument does with the answers, and how much it can close.

---

## C-1 (structural) · Pre-fill can only open a risk area, never close one

All five pre-fill rules answer **Yes**. Not one closes a category, and the
validator has always allowed `"answer": "No"` — so this is a content gap, not
a missing capability.

Measured across six realistic profiles:

| Profile | Gates pre-answered |
|---|---|
| SaaS purchase (vendor named, Internal data, no AI) | 2 of 11 |
| In-house AI tool (no vendor, Confidential) | 2 of 11 |
| Vendor renewal | 2 of 11 |
| Proof of concept to production, AI, Restricted | 3 of 11 |
| **Process change: no tech, no vendor, no AI, Public data** | **0 of 11** |
| Unsure about AI | 1 of 11 |

The last-but-one row is the important one. The activity that should sail
through the instrument gets asked all eleven questions, because intake
learned five facts about it and used none of them. The product's promise —
*"the rest are closed, you won't be asked about them again"* — is currently
only ever delivered by the person answering gates one at a time.

**Fix (data only, no code):** add closing rules where intake holds positive
evidence of absence. `usesAi = "No"` closes AI today, in one line. That is
the whole change for one of the eleven.

**Caveat that matters:** closing from `vendorNames` being empty is *not*
available and must not be faked. The condition predicate is positive-evidence
only by design (§3.2.1) — an empty field satisfies nothing, and it should
stay that way. To close Third-Party from intake you need an explicit fact,
which means a question. See C-2.

## C-2 (structural) · Closing Third-Party needs a question intake doesn't ask

`vendorNames` is a free-text name list. Presence pre-fills Third-Party = Yes;
absence proves nothing. Two consequences:

- A person who types "none", "n/a" or "in-house" gets Third-Party opened on a
  false positive.
- A person with genuinely no third party cannot have it closed.

**Fix:** precede the name field with *"Does anything about this involve a
company outside ours?"* (Yes / No / I'm not sure), with the name field
conditional on Yes. Yes → open with the reason; No → **close**; not sure →
open and route to a reviewer, per §24.1.

**Deliberate note on G-20:** the owner removed the previous intake routing
question because it asked a business user to classify an activity against our
taxonomy. This is not that. It asks a fact about the world the requester
plainly knows, in their own words, and its answer is checkable. If that
distinction doesn't hold up on reading, the finding should be rejected.

## C-3 (answer-type) · `dataClassification` is a multi-select asking for one answer

The help says *"Choose the highest classification of any data involved."* The
control accepts several. Two people describing identical data produce
different records — one ticks Restricted, the other ticks Internal +
Confidential + Restricted — and any downstream severity that reads "the
classification" gets a different answer depending on who filled the form.

**Fix:** make it a single select of the four levels. It matches the help, it
makes the answer comparable across the portfolio, and it has a second payoff:
`equalsAny: ["Public"]` becomes expressible, which **closes Data Management &
Privacy** for a genuinely public-data activity. Today that close cannot be
written at all, because there is no way to say "Public and nothing else"
about a multi-select without a negation the engine deliberately lacks.

## C-4 (answer-type) · "None / Unknown" is two answers in one option, inside a multi-select

`dataElements` offers "None / Unknown" alongside four real elements, so a
person can tick it *and* "Customer personal information". Worse, it merges a
fact ("there is none") with the absence of one ("I don't know") — and those
must route differently: one is an answer, the other is a follow-up (§24.1).

**Fix:** split into "None" and "I'm not sure", make both exclusive of the
others in the control, and give "I'm not sure" the same reassurance treatment
the AI question already has.

## C-5 (duplication) · Security & Resilience is answered by Solution Architecture

Gate 7's own help says: *"If you're building, buying, or changing a system,
this is usually Yes as well."* The instrument is telling the person that
answering gate 2 has already answered gate 7. That is the definition of a
near-duplicate (§4) — and it is asked as though it were independent.

It is an implication, not an equivalence: a pure access change (new group
granted access to an unchanged system) is Security = Yes, Architecture = No.

**Fix:** pre-fill Security & Resilience = Yes from Solution Architecture =
Yes, with the reason and the ability to change it — the FR-22 pattern the
platform already uses. This is the product's own thesis applied to itself,
and it demos well: answering one gate visibly answers another.

## C-6 (duplication) · Cross-border is asked in two gates

"work or data crossing a border" is a trigger inside Legal & Regulatory
(gate 5), and Jurisdiction-Bound Execution (gate 11) is the same ground.
A person who crosses a border answers Yes twice for one fact.

**Fix:** decide which gate owns it. Recommendation: leave it in Jurisdiction,
which is the sharper, more observable question, and remove the clause from
Legal's list — Legal keeps the four other triggers.

## C-7 (coverage) · "Security & Resilience" gates security only; resilience is never asked

The category is named for two things and asks about one. Gate 7's text covers
technology components, integrations, connectivity and identity — all security
surface. Availability, recovery expectations, dependency on a single
provider, what happens when it goes down: none of it is gated anywhere in the
instrument.

**Fix (owner's call, two options):** either add resilience triggers to gate 7
("or depends on a service whose outage would stop the work"), or rename the
category to Security & Access and accept that resilience is out of scope for
the pilot — and say so, rather than implying coverage by a name.

## C-8 (discrimination) · Four gates look like they will be Yes almost every time

§7's test is whether a question discriminates. These four look like ceremony:

| Gate | Why it won't discriminate |
|---|---|
| Governance & Oversight | Every activity has an owner and someone watching it. It also asks in GRC vocabulary ("decision rights") that a business user cannot answer confidently — §24.7. |
| Ethics & Conduct | Its own help says *"Most activities that affect individuals answer Yes here, and that's routine."* |
| Security & Resilience | Its own help says it is *"usually Yes as well"* (see C-5). |
| People & Capacity | Every activity relies on people. It also asks a judgement of degree — *"in a way that could affect sustainable delivery"* — which is a severity question wearing a gate's clothes (§1). |

A gate that is Yes 95% of the time is a formality. That is allowed — but §7
says say so, or fix it. If five of eleven areas open regardless, Tier 1 stops
routing and the friction argument for the demo weakens considerably.

**Fix for People & Capacity specifically:** re-anchor on observable facts —
*"Does delivery depend on a small number of people, a licence or
certification, or coverage outside business hours?"* That is checkable; the
current wording is not.

**Fix for Governance:** re-anchor the same way — *"Will someone new be
accountable for this? Will there be a new approval step? Will someone need to
watch it after it launches?"*

## C-9 (§24.1) · "I'm not sure" about AI is asked again as a gate

Intake asks *"Does this use AI or machine learning?"* with a reassurance note
on "I'm not sure": **"We'll find out for you."** Then Tier 1 asks the same
question again, with no pre-fill and no acknowledgement, and expects an
answer. Measured: the unsure profile gets 1 of 11 gates pre-answered, and AI
is not one of them.

This is the one principle the platform states most emphatically (§24.1) being
broken by the platform.

**Fix:** pre-fill AI = Yes with the reason *"you weren't sure at intake, so
we're treating it as in scope until a reviewer confirms"* — conservative,
honest, changeable, and it keeps the promise the note already made.

## C-10 (mechanical, for tests not judgement) · Reachability has no validator

Every question is reachable, no condition is unsatisfiable, and there are no
cycles — I checked by hand. Nothing checks it automatically. §5 says these
belong in the validator, and the old platform had one (`validate:modules`).

With 11 gates and 6 conditionals it is holdable in a head. After S3 (paths)
and S4 (severity conditionals) it will not be, and the cheapest moment to
write the check is before the thing it checks gets complicated.

---

## What is genuinely well made

Recorded because an audit that only lists faults gives the owner no way to
tell which conventions to keep.

- **Consistent "material change" definition.** Gates 2 and 6 use the same
  construction — *"changes what the system does, who can reach it, or what
  data it holds"* / *"what people do, who approves what, or where work
  happens"* — turning a judgement word into observable facts, the same way,
  twice. That is the pattern the weaker gates should copy.
- **Every gate has teaching helper text** (§24.11), and several say what to do
  when the answer is uncomfortable ("answer Yes and a reviewer works out the
  rest").
- **No wording drift.** "Activity" is used throughout; no concept appears
  under two names.
- **No option-label collisions** — no label means one thing in one question
  and something else in another.
- **Pre-fill reasons are written for a person**, not derived from field names.

## Not assessed

- **§3 rubric quality** — no anchored severity questions exist until S4.
- **§6 policy traceability** — no policy library exists yet (§22.1).
- **Real answer distributions** — C-8 is a reading of the questions, not
  evidence. The honest way to settle it is to walk 5–8 real activities
  through Tier 1 and count what closes. That is worth doing before the
  leadership demo, because the demo's claim is closure.
