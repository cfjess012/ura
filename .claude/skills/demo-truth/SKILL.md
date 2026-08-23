---
name: demo-truth
description: Find claims the build does not back before a person repeats them in a room. Use when finishing a slice review, before each UAT round, before demo day, and whenever a number or capability statement is written into a doc or a screen.
---

Implements SPEC §24 (honesty on screen), G-34, G-42 and G-50. The deal was struck 2026-08-23, after the
demo script instructed the presenter to say "five intake answers decided
six of eleven areas" — the real figure was four, and had been for days.

## The rule

**A claim the product makes must be computed by the product, or it isn't a
claim — it's a hope.** A sentence a person is instructed to say in front of
an audience is a claim the product makes.

## The pass

Walk every surface a person will see and every doc a presenter will hold
(`demo/readiness.md` first), and for each statement of fact ask:

1. **Is it a number?** Then something must compute it, and the doc must cite
   the test that asserts it (`prefill-reach.test.ts` is the pattern). The
   Stop gate checks the citation exists; only this pass checks it is the
   *right* test.
2. **Is it a capability?** Then walk it end to end, today, in the running
   app. "Built" in a table is not evidence — every defect that mattered in
   this project was found by a person using the product.
3. **Is it an attribution?** A sentence saying a person said or chose
   something must be conditioned on the record of them saying it (G-42) —
   never on the absence of a record.
4. **Is it a boundary?** A place where the product deliberately stops must
   say so on screen (G-50). Check the silence, not just the statements:
   what would a person reasonably infer that isn't true?

## Output

A list: the claim, where it appears, what backs it (test / walked / record)
or the correction. An empty list must name what was checked — an unwalked
surface is "not verified", never silently fine.
