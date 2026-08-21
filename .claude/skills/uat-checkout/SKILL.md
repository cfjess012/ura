---
name: uat-checkout
description: Produce a numbered hands-on test script the owner can run to verify a slice or release, with exact steps and objective pass lines. Use when a slice is ready for owner review or when asked how to test what was built.
---

Implements SPEC §10 (UAT) and supports §21.

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
