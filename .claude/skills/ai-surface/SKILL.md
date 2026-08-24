---
name: ai-surface
description: Put an AI capability on screen without making it feel like a machine gate — where it lives, how it waits, what it must say about itself, and the friction traps this product has already hit. Use when building or changing any surface where a model's output reaches a person.
---

Implements SPEC §7, §22.1, §23 and §24. `agent-capability` covers the gates
behind the seam; this is the half a person sees.

**The mission is reducing friction.** Every rule here is downstream of that.
An AI feature that makes somebody wait, or read a caveat, or wonder what
just happened, has spent more of their attention than it saved.

## Where it lives

- **The assistant is a corner dialogue**, the shape people already know from
  every support chat. Fixed, so it travels across every screen of one
  assessment — the question somebody wants to ask is rarely about the screen
  they happen to be on. Closed on arrival, always: a window that opens
  itself over somebody's work is the thing everyone hates about these.
- **A proposal sits above the question, never inside it.** The answer
  controls stay the person's own act.
- **A generated document is set like a document**: one measured column,
  derived fact visibly separated from model prose, and a print stylesheet,
  because somebody will print it.

## Never make a person wait for a model

This is the friction trap this product hit first and hardest. A page that
calls a model before it renders is a blank screen for as long as the model
takes.

**Render everything derived immediately; stream the model's part in.** Put
the model call inside a `<Suspense>` boundary with a fallback that says what
is coming. Measured on the handoff report: derived content at 0s, the
assistant's summary at 15s, and nothing to look at in between except the
thing they came for.

Two traps when you verify this:

- `page.goto(waitUntil: "domcontentloaded")` does **not** fire until a
  streamed response ends — it will tell you streaming is broken when it
  works. Use `waitUntil: "commit"`, or measure with
  `curl -w "%{time_starttransfer} %{time_total}"`.
- The first hit on a route in dev includes compilation. Measure the second.

## How it waits

- **Shimmer the shape of what is coming**, not a spinner. A spinner says
  "something is happening" and nothing about what.
- **Three dots for a reply in progress**, not the word "Thinking" — the
  shape people already read, and it does not claim to know how long.
- Give the animation a `prefers-reduced-motion` off-switch and give screen
  readers the sentence instead.
- Say what does **not** depend on the wait: "everything below is already
  complete" is the difference between waiting and being stuck.

## What it must say about itself

- **Mark the model's work as the model's work.** "Proposed by the assistant
  — not your answer yet", above the quote it came from.
- **State the promise where the choice is made**, not in a dialog after it:
  "It proposes; you accept. Nothing it reads becomes your answer on its own."
- **Never claim an act.** Not recorded, saved, submitted, signed, attested.
  Somebody who believes their assessment was submitted stops working on it.
- **Show the evidence, not a score.** A quote a person can check in one
  second beats a confidence number they cannot check at all.

## When there is no agent

The capability is **absent from the page**, not present and apologetic
(§7, §24.8). A widget explaining that it cannot help implies a capability
that does not run. Gate on `agentTransport().available` and render nothing.

Everything deterministic must keep working untouched. Verify by killing the
agent, not by reading the code.

## Before you call it done

- Walk it with the agent **connected** and with it **stopped**.
- Screenshot it. Two defects in this product's AI surfaces were invisible to
  the type checker and obvious in a picture: a diff whose panes stacked
  because a CSS rule silently missed, and a class name invented at the call
  site that was never defined anywhere.
- Check the second render, not the first.
