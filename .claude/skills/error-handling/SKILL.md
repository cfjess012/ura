---
name: error-handling
description: How to write and review any failure path — server actions, mutations, data access, background work. Use when adding an action or route, when touching a try/catch, or when auditing what a user sees when something breaks.
---

Implements SPEC §25 (standard) and §24.3 (the experience law behind it).

## The pattern

Expected failures are **values**, not exceptions — a forgotten `catch`
cannot swallow what was never thrown.

```ts
// src/lib/errors.ts provides: Result<T>, failure(), isFailure()
export async function saveThing(id: string, input: X): Promise<Result<{ savedAt: string }>> {
  try {
    const existed = await store().update(id, input);
    if (!existed) {
      return failure("saveThing", new Error(`no row ${id}`),
        "That record no longer exists. Copy your answers somewhere safe before leaving.",
        { retryable: false });        // never invite a retry that cannot work
    }
    return { ok: true as const, savedAt: new Date().toISOString() };
  } catch (error) {
    return failure("saveThing", error,
      "Couldn't save just now — your answers are still on screen, so nothing was lost. Try again in a moment.");
  }
}
```

Callers branch with `isFailure(result)`. The client also catches transport
failure separately (offline, deploy mid-request) — the action never ran, so
its message differs.

## Writing the message

Answer three questions in this order, in one sentence:
1. **What happened** — plainly, no system vocabulary.
2. **Is my work safe** — say it explicitly; this is the question people
   actually have.
3. **What do I do now** — a next action, or who is handling it.

Say what happened, never why you think it happened. "Check your connection"
blames the reader for a server that may simply be down, and sends them to fix
something that isn't broken. State the observable fact ("the server couldn't
be reached") and the next action ("try again in a moment").

Show the reference (`Reference AB12CD`) so a support conversation starts
with a fact. "Something went wrong" answers none of the three and is not
acceptable.

## Never

- Put a driver message, SQL, constraint name, or stack trace on a screen.
- Clear the person's input to reach a clean state.
- Offer "Try again" on a permanent failure.
- Leave a failure silent — it goes in a live region so assistive tech
  announces it.

## Test it

Every error path gets a test proving the message is safe, the reference is
present, and the input survives — see `test/unit/errors.test.ts`, which
asserts a Postgres constraint name can never reach a user-facing string.
An untested error path is an untested feature.
