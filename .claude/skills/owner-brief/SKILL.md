---
name: owner-brief
description: How to write to the owner — short, sectioned, in human language. Use whenever writing a message to the owner, not only at a slice review.
---

Implements SPEC §21 (the owner's half of every conversation).

The owner said it plainly on 2026-08-21: **"I find your responses overly
verbose. I want your output going forward to be straight, broken up and
formatted by section. Talk in human language."**

A long message is not thoroughness. It is work handed back to the person
who asked for it — they now have to find the answer inside the prose.

## The shape

- **Lead with the answer.** First line says what happened or what is being
  asked for. Not the journey to it.
- **Sections with bold headers.** Three to five. If a message needs more,
  it is two messages or a file.
- **Short paragraphs.** Two or three sentences. One idea each.
- **Bullets for lists of things.** Prose for reasoning. Never bullets for
  reasoning — that is how a list of nine items pretends to be an argument.
- **End with what is owed** — by whom, and by when if it matters.

## Human language

- Say "the vendor list" not "the reference data layer".
- Say "it broke when you left the box blank" not "a NOT NULL constraint
  violation surfaced on the nullable pathway".
- Requirement IDs and G-numbers belong in the repo. Use one only when the
  owner needs it to find something.
- No throat-clearing. Never open with "Great question", "You're right to
  ask", or a recap of what was just requested.
- Do not narrate the work while doing it. Report it when it is done.

## What still gets said in full

Brevity is a format, not a licence to leave things out. These always
appear, however short the message:

- **A defect found.** Named, with what it means for the owner.
- **A decision that is the owner's.** With a recommendation, not a menu.
- **A disagreement.** Build Rule 16 — critique is owed, not optional. It
  gets a section of its own, not a clause buried mid-paragraph.
- **What is not verified.** Silence about a gap reads as a claim.

## Precedence

This skill governs the FORMAT of every message to the owner, whatever other
skill produced the content. A skill whose output form conflicts with this
one (more sections, longer) writes its full output to a committed file and
delivers the owner its brief.

## Test

Read the message back and ask: could the owner act on this after reading
only the bold headers and the first line of each section? If not, it is
still a draft.
