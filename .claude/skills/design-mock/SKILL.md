---
name: design-mock
description: Answer design feedback with a quick mock of the screen, not prose. Use whenever the owner sends a screenshot, marks up a screen, or describes how something should look or behave.
---

Implements SPEC §23 (the demo-ready UI standard).

The owner asked for this on 2026-08-21: **"Usually when I prompt you with
design screenshots or images… I would like you to just mock it off to me
quick so I can iterate faster."**

A paragraph describing a layout is slower to read than the layout. Draw it.

## The rule

**First reply to design feedback is a picture, not an explanation.** A small
text or ASCII sketch of the screen as it would be, using the real words that
would appear on it.

Analysis comes after the picture, and only when it changes the decision.

## What a mock has

- **The real copy.** The exact words that will be on screen, not
  `[button label]`. Wording is most of the design, and it is the part the
  owner can correct fastest.
- **Enough structure to judge it.** Headings, groups, controls, the state
  that matters. Not every pixel.
- **The state being proposed**, not the empty one — filled in, mid-flow,
  the option already chosen.

## When there is a choice, show both

Side by side, so they can be compared without scrolling between them.

```
GROUPED CARDS                    A REAL DROPDOWN
REQUESTER                        ┌────────────────────┐
┌──────────────────────────┐     │ Priya Sharma     ▾ │
│ PS  Priya Sharma ✓ in use│     └────────────────────┘
└──────────────────────────┘          [ Continue ]  ← 2nd click
one click → in
```

Name the cost under each one in a single line. Not a paragraph — the mock
is doing the arguing.

## Then, and only then

- What it costs to build, if that would change the answer.
- What rule it collides with, if any (§24 and the governance log bind the
  design as much as the code).
- A recommendation. Not a menu.

## What this does not license

The mock is how a proposal is *presented*. It does not replace
`question-design` for a question's wording, `ui-craft` for building the
surface, or `ux-audit` for auditing it once built. Draw first, then follow
those.
