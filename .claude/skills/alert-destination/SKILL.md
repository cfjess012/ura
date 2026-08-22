---
name: alert-destination
description: Every alert, notification and attestation prompt lands the person ON the thing that needs addressing. Use whenever building anything that points a person at work elsewhere in the product.
---

Implements SPEC §24 (the experience principles) and §23.

The owner set this rule on 2026-08-22, after clicking a notification about a
question and arriving at the top of an intake form: **"The notification
should take you directly to where the inquiry needs addressed."**

An alert that names a thing and then drops you near it has handed the work
back. The person now has to find it, and finding it is the job the alert
was supposed to have done.

## The rule

**An alert carries a destination, and the destination is the thing itself.**

Not the project. Not the section. The question, the answer, the finding —
scrolled to, visible, and marked so the eye lands on it.

## What every alert needs

1. **A destination computed from what it points at**, never hardcoded at the
   call site. One function maps a subject to its screen and anchor, so a
   new alert type gets a destination by being a subject, not by someone
   remembering to add a link.
2. **An anchor in the URL** — `?focus=<id>`. The convention is one word and
   it is the same everywhere.
3. **A receiving surface that honours it**: scroll the thing into view, mark
   it, and put keyboard focus on it. Marking is never colour alone.
4. **An honest failure.** If the destination cannot be reached — an earlier
   step is incomplete, the record moved, permission is missing — the person
   is told where they landed and why, on arrival. A silent redirect to
   somewhere else is the defect this rule exists to prevent, and it is what
   shipped the first time.

## What this rules out

- Linking to a project root and hoping the person scrolls.
- A destination assembled inside a component, so two alert types drift.
- A guard that redirects and swallows the anchor, leaving the person on a
  screen that says nothing about why they are there.
- An anchor that survives navigation and re-marks the thing every time
  someone comes back to the page. Focus is a one-time act.

## The repeatable shape

The same three pieces every time, whatever raises the alert:

- **subject** — what it is about (a question id, an answer id, a finding id)
- **destination** — where that subject lives, derived from it
- **why** — the sentence the person reads on arrival, if the surface needs
  one to make sense of why they are here

Attestation prompts, findings, conflicts and review queues all take this
shape. If a new one cannot be expressed in it, that is a sign the subject
is not addressable yet — fix that rather than linking to the nearest page.
