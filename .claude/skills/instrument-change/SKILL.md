---
name: instrument-change
description: Change the assessment instrument — questions, options, conditions, rubrics, control objectives — through the governed path. Use whenever adding, editing, or removing anything a requester or reviewer is asked.
---

Implements SPEC §6.2, §8, and G-5 (no runtime authoring — seed-PR only).

## The rule

The instrument is **versioned data**, never code and never a runtime admin
screen. The database can therefore never fork away from the repository.

## The path

1. **Edit the data.** Today: `src/lib/intake.ts`. From S2: the instrument
   seed files. Question content never appears in a component.
2. **Update the pinned field-set test** in the same commit
   (`test/unit/intake.test.ts`). It exists because a rewrite once dropped a
   field silently — changing the instrument must be a deliberate act, and
   the diff is the proof.
3. **Check the experience laws still hold** — run the `ux-audit` skill.
   The mechanical ones are in `test/unit/experience.test.ts`: no
   "I'm not sure" answer may reveal another question; every conditional
   carries "Shown because…"; no acronym batteries or identifiers.
4. **Schema, if the shape changed.** New migration in `drizzle/` (append
   only — never edit an applied file), mirrored in `src/lib/schema.ts`.
   The PGlite integration test applies the real SQL, so drift fails.
5. **Run `full-gates`.**
6. **Record it.** A governance-log entry in SPEC §13 for anything that
   changes what is asked or how it routes, and a requirement row in §20 if
   it adds a capability.

## Watch for

- **Duplication with a later tier** — if Tier 1 or 2 already asks it,
  intake should not (and vice versa). Prefer pre-fill (FR-22) over asking
  twice.
- **Uncertainty** — any answer a requester may genuinely not know needs an
  "I'm not sure" option that routes to a human (FR-23), plus a reassurance
  note rather than a follow-up question.
- **Plain language** — the label is what a business user reads. Internal
  vocabulary stays internal.
