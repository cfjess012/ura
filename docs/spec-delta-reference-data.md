# SPEC delta — reference data, unlisted answers, and provenance that survives

**Proposal. Nothing here is in SPEC yet and no code exists.** Approve, amend,
or reject; on approval this becomes edits to §17, §20 and the §13 governance
log, and only then does anything get built.

Source: owner function feedback 2026-08-21 (`uat/owner/feedback-2026-08-21.md`).

---

## Part 1 — The three decisions

These are decisions rather than work, which is why they go in the governance
log. Each has a recommendation; each names what I would be giving up.

### A. What reference data *is*

**The question.** A picker needs a list. Is that list part of the instrument —
versioned, immutable once activated — or is it operational data that changes
whenever someone updates it?

It matters because of renames. If a requester chose "Novara Health" and the
vendor list is later corrected to "Novara Health Systems", an operational list
silently rewrites what a past answer said. That is the same problem
`module_versions` was invented to solve for questions, arriving one layer down.

**Recommendation: versioned data, and the answer records both the id and the
label it displayed.**

- Reference lists live beside the instrument as versioned JSON, activated the
  same way, immutable once activated. A changed list is a new version.
- An answer stores three things: the entry **id**, the **label as it appeared
  on screen when the person chose it**, and the **list version**.
- The label is stored redundantly on purpose. Six months later a reviewer must
  be able to read what the person actually saw, not what the list says today.

**What this costs:** every list edit is a version bump and a reseed, including
trivial ones. That friction is the point — it is the same friction the
instrument already has, for the same reason.

**The alternative I rejected:** an ordinary table anyone can edit. Cheaper, and
it makes historical answers unreadable the first time anyone tidies the list.

**One exception, deliberate.** The **people directory** is not a reference
list — `people` already exists as an operational table because the persona
switcher needs it, and a real deployment replaces it with an IdP lookup rather
than a versioned file. Owner fields therefore store the person id plus the
name as displayed, and the same rename-safety comes from storing the label.

### B. What an "Other" answer looks like in the data

**The question.** Today an answer is a value from a known set, and
`pathSubmissionProblems` and `severitySubmissionProblems` **refuse** anything
else. That guard is real and has caught things. "Other: Peter's team" does not
fit it.

**Recommendation: an unlisted answer is a different shape, not a different
string.**

- A selection is either a known option id (`"TPR_LA"`) or an explicit unlisted
  value (`{"unlisted": "Peter's team"}`).
- The validators keep refusing unknown ids exactly as they do now. They accept
  the unlisted shape **only** where the question declares it allowed.
- A question that allows unlisted answers says so in the instrument, so
  "can this be answered off-list?" is authored, not incidental.

**Why not just store the typed text as a value:** because then nothing can
tell a real option from a typed one — not the validator, not the reviewer, not
the export. Every count of "how many chose X" would quietly include text
somebody typed once.

### C. Who may add to a list

**The question.** Item 5 asks for "if a company isn't listed, add a new one."
That is a request path writing shared reference data.

**Recommendation: propose, then ratify — the same pattern the instrument's
relationships already use.**

- The person is **never blocked**: their assessment records the unlisted value
  immediately, under decision B.
- It does **not** enter the shared list until an admin ratifies it. Until then
  it is one assessment's answer, not everyone's option.
- Ratification is recorded with who and when, and produces a new list version.

**Why:** without it, one person's typo becomes an option everyone else sees and
picks, and the platform industrialises an error. §22.4 already forbids exactly
this for precedent; the same reasoning applies to the option list itself.

**Deferred, and registered rather than built:** the owner's "tag @Peter to ask
whether this vendor is in Coupa" is a Phase-2 agentic feature (§22.1), not part
of this work.

### D. The one that is *not* a new decision — #10

The owner asked for the Tier-2 data-classification question to **default** to
the intake answer. **G-39a settled that a derived value is offered, never
pre-answered**, and I am recommending we keep it, because a pre-selected answer
nobody looked at is still recorded as that person's answer and attested as if
they decided it.

What is genuinely broken is narrower and is fixed by FR-33 below: the note
never names *which* prior question the value came from, and it **disappears
the moment they answer** — so after one click there is nothing on screen or in
the record saying the platform worked it out. Fixing that gives the owner what
they want without reopening G-39a.

If the owner still wants a true default after seeing it, that is a governance
change and gets recorded as one.

---

## Part 2 — Requirements to add to §20

Seven rows. Line budget after these: 597 → 604 of 620.

| ID | Requirement | Traces to | Slice |
|---|---|---|---|
| FR-29 | A field whose answer is a name held in a real system — a person, a business unit, a vendor — is answered by choosing from a reference list, not typed free-hand | §5, A | S4.5 |
| FR-30 | Every reference-backed field accepts a value that is not on the list; the person is never blocked, and the unlisted value is stored distinguishably from a listed one | §7, B | S4.5 |
| FR-31 | A multi-select that can be incomplete offers an explicit "Something else" option that reveals a required free-text field; the text is stored as its own value, never as an option id | §24.10, B | S4.5 |
| FR-32 | A value a person supplies off-list is recorded against their assessment immediately and enters the shared list only when an admin ratifies it, with actor and timestamp | §5.7, C | S4.5 |
| FR-33 | A value the platform worked out names the question it came from, and keeps saying so after the person accepts it — provenance survives the click | §24.5, G-39a, D | S4.5 |
| NFR-22 | Reference lists are versioned data, immutable once activated; every answer pins the list version and stores the label as displayed when it was chosen | §5.6, A | S4.5 onward |
| FR-34 | Prior assessments, ARA and PIA documents can be attached to an assessment, stored outside the application filesystem, and carry the same classification the assessment asks about | §26.2, §3.4 | S7 (own slice) |

**Not new requirements, deliberately:**

- **Item 9** (subcontractor reliance derives from AI + third party) is
  instrument *content* under the existing FR-4 and G-39a. It ships as a new
  instrument version, not a new rule.
- **Item 11** (sign-in as a highlighted dropdown, roles grouped) is UI under
  the existing FR-25 and the §23 standard.
- **Items 1–8's rewordings** are question changes under Build Rule 13; each
  passes the `question-design` probe before it reaches a screen.

## Part 3 — Slices to add to §17

| Slice | Builds | Owns | Done when |
|---|---|---|---|
| **S4.5** Reference data & unlisted answers | Versioned reference lists (business units, vendors) + people-backed owner fields; pickers on the six fields the owner named; "Something else" with free text; unlisted values recorded and ratifiable; provenance that survives acceptance; item 9's derived fourth-party path; item 11's sign-in picker | FR-29, FR-30, FR-31, FR-32, FR-33 · NFR-22 | Choosing a vendor from the list and typing one that is not on it both work; the typed one appears in no other assessment until ratified; renaming a list entry does not change what a past answer says; accepting a worked-out value leaves its source question on screen |
| **S7** Attachments | Upload for prior assessments and supporting documents, stored outside the app filesystem, classified, retained under a stated policy | FR-34 | A document uploads, is retrievable, carries a classification, and the retention rule is written down before the first byte is stored |

**Ordering note.** S4.5 sits after S4 and before S5 because it changes what
intake and Tier-1 answers *are*, and S5's ledger reads all of them. Doing it
after S5 means touching the ledger twice.

---

## Part 4 — What I would build, in plain terms

1. **Two new seeded files** — `src/data/reference/business-units.json` and
   `vendors.json` — versioned and activated by the existing
   `pnpm instrument:seed`, validated by the existing validator, which already
   rejects references that resolve to nothing.
2. **One new field type** in the intake definition (`pick` / `pick-many`,
   naming its list), so a picker is authored in data rather than built in a
   component. **No list of names in any `.tsx` file** — that is the specific
   laziness this whole document exists to prevent.
3. **One change to the answer shape**, per decision B, plus the validator
   change that accepts the unlisted form only where declared.
4. **A ratification path** for proposed entries, admin-only, reusing the
   role check that already exists.
5. **Provenance rendering** — the derived note names its source question and
   persists after the answer.
6. **A new instrument version** carrying item 9's derived path and the
   rewordings.

Each with tests before it is called done, the §23/§24 audit, the agentic
opportunity registered, a UAT record, and independent verification.

## Part 5 — What this delta does not answer

- **Retention.** FR-34 needs a policy for how long an uploaded document lives,
  and §3.4 is only provisionally settled ("synthetic pilot data only"). That
  is why attachments are their own slice and not part of S4.5.
- **How the vendor list gets seeded.** Synthetic for the demo, per the owner.
  The real one is an API call to the sourcing system, which is a Phase-2
  connector, not this work.
- **Whether ratification needs a queue UI.** The recommendation gives admins
  the *authority*; whether they need a screen to exercise it is an S4.5 scoping
  question I would rather answer with the owner once the rest is visible.
