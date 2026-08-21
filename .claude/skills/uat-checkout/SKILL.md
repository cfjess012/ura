---
name: uat-checkout
description: Produce a numbered hands-on test script the owner can run to verify a slice or release, with exact steps and objective pass lines. Use when a slice is ready for owner review or when asked how to test what was built.
---

Implements SPEC §10 (UAT) and supports §21.

## Two outputs, not one

1. **`uat/<slice>.md`** — the durable record, committed with the slice.
   Generate the skeleton with `pnpm uat:new S3`, then fill every row with
   what was actually done and actually observed. Six criteria are enforced
   by `test/unit/uat.test.ts`: coverage of every owned requirement, no
   orphan rows, substantive evidence, no blank results, follow-up on every
   failure, and a spec version that matches. **"Works" is not evidence.**
   The "Not verified" section is mandatory and must be honest — naming the
   gaps in your own coverage is the difference between a record and a
   claim.
2. **The owner's script** — the numbered checks below, delivered in the
   slice review so a person can run the same journey by hand.

## Shape

Numbered checks (T1, T2, …), grouped by persona or track, each with:

- **A title** naming the behaviour, not the code.
- **Numbered steps** a person can follow without knowing the internals.
- **A pass line** that is objectively true or false, quoting the exact
  strings expected on screen.
- **A speed tag** where a step involves a slow dependency, so a wait is not
  mistaken for a hang.

Include a **"known-open, not bugs"** section listing deliberate deferrals —
otherwise the owner files them as defects.

## Rules

- Test behaviour, not implementation. "The save status reads *All changes
  stored*", not "setSavedAt is called".
- Cover the negative paths: an unanswered required field, an "I'm not sure"
  answer, a forced failure (offline), a reopened page.
- Every check must be runnable from a clean start — say what to create
  first.
- Tell the owner up front that "T# failed" plus a screenshot is a complete
  bug report.

## Example

> **T7 · Submit is never silent** · Fast
> 1. Complete intake, click **Save intake**.
> **Pass:** a status region shows "Saving…" immediately, then "All changes
> stored". The old behaviour — a dialog closing followed by silent seconds —
> must not happen.
