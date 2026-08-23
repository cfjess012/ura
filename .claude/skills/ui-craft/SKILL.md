---
name: ui-craft
description: Build, audit, and wire every surface to the demo-ready standard — tokens, designed states, accessibility, the §24 behavioural laws, and destinations that land a person ON the thing. Use when creating or changing any file under src/app, and before claiming any surface finished.
---

Implements SPEC §23 (the surface standard) and §24 (the behavioural laws).
One skill, three passes over the same surface: **build it** (§23), **walk it
as a person** (§24), and **wire what points at it** (destinations). The
rules below each appear exactly once; nothing restates them elsewhere.

# Pass 1 — build (SPEC §23)

Implements SPEC §23.

## Tokens, never raw values

Every colour, radius, shadow, and easing is a custom property in
`src/app/globals.css`. Components reference tokens. A raw hex in a
component is a defect, not a shortcut.

Palette in use: `--navy` (chrome, headings) · `--accent` lime, **only on
navy, sparingly** · `--primary` blue for actions · `--surface-1..3` tints ·
neutrals · `--success/--warning/--error` for state · `--radius`,
`--shadow-card`, `--ease`.

## The states checklist

Build all of these before calling a surface done:

| State | What it must do |
|---|---|
| Empty | Say what goes here and how to start — never a blank panel |
| Loading / pending | Visible immediately; the control disables and relabels |
| Success | Explicit confirmation in a `role="status"` region |
| Failure | See the `error-handling` skill — cause, safety, next step |
| Disabled | Looks unavailable *and* explains why nearby |
| Overflow | Long content scrolls in its own container, never the page |

## Accessibility, by construction

- Every control has an accessible name. **A checkbox group is named with
  `aria-labelledby` pointing at a label element's id — not `<label for>`,
  which needs a single control to point at.** (This exact bug shipped once:
  the group had no accessible name at all, and the E2E couldn't find it.)
- Keyboard: full operation, visible `:focus-visible`, focus never stranded
  after a dialog closes.
- State is never colour alone — pair it with a word or an icon.
- Motion is explanatory (reveals, transitions) and honours
  `prefers-reduced-motion`.

## Content design is design

Plain language; labels that say what happens ("Save intake", then "All
changes stored"); help text where a business user would hesitate; no
internal identifiers. The behavioural laws are the audit section below.

## Evidence

Screenshot every new surface and look at it — most defects in this project
were caught by reading a screenshot, not the code. Two real examples: a
"still needed" list that swamped the footer, and a primary button whose
label wrapped to two lines.

```js
// scratch script; delete after use
await page.screenshot({ path: "/tmp/surface.png", fullPage: true });
```

## The notification menu (owner-specified, 2026-08-22)

The shape the owner picked, taken from the prior platform. Reuse it for any
panel that mixes work-to-do with things-that-happened — a review queue
summary, a findings tray, an attestation prompt.

**A bell with a corner count.** 36px round button in the app bar. An 18px
badge pinned to its top-right with a negative offset so it overlaps the
glyph, `min-width` plus horizontal padding so two digits grow it into a
pill, and `tabular-nums` so the number does not jitter as it changes. Nine
or more reads "9+". The bell's `aria-label` carries the counts in words —
the badge is never the only way to know.

**A right-anchored panel**, 24rem wide, `max-width: 90vw`, 12px radius,
hairline border, lifted shadow. Closes on outside mousedown and on Escape.

**Two sections, and they are different substances.**

*NEEDS YOU* sits on top, on a warm band, in the warning colour. Each row is
a shield or alert glyph and a bold sentence naming the work. It ends with
the line that does the real work: **"These clear themselves when the work
is done — they can't be dismissed."** There is no clear control beside it,
because there is nothing to clear — the rows derive from state.

*NOTIFICATIONS* sits below on white, with **Clear all** as a plain blue link
in its header row. Each row is a pale round icon, then one sentence reading
**bold actor · plain verb · bold object**, with a relative timestamp beneath
in small grey. Unread rows carry a tint *and* the word "new" — never the
tint alone.

**Empty state names what will appear**, not merely that nothing has: *"Nothing
yet — replies on questions you handed over land here."*

Every row is a link to the thing itself — see the destination section below.

## Who you are, in the app bar (owner-specified, 2026-08-22)

The signed-in person is **a name in bold and a role pill**, not a dropdown.
Switching is a deliberate act through the front door. A select in the chrome
invites a mis-click into somebody else's identity, and reads slower than two
words.

# Pass 2 — walk it as a person (SPEC §24)

Implements SPEC §24. The laws are in the spec; the reasoning and the
procedure are here.

## How to audit

Walk the surface as the person it is for — not as the person who built it.
For each principle, name the screen and the exact wording at fault.

**24.1 Never re-ask what someone said they don't know.**
Look for any "I'm not sure" / "unknown" answer, then look at what appears
next. A question is a violation; a reassurance is correct. The reassurance
must say *who* will resolve it and that nothing is blocked meanwhile.
*Origin: the AI question revealed "What does the AI do?" to someone who
had just said they didn't know. That punishes honesty and teaches
guessing, and a guess is worse for an assessment than an admitted unknown.*
This one is machine-checkable — see `test/unit/experience.test.ts`.

**24.2 One decision per screen; pace the journey.**
A wall of fields lowers both completion and answer quality. Ask: could a
person finish this in one sitting without scrolling past their own answers?
*Origin: S1 shipped four intake sections as one long scroll.*

**24.3 A control responds to the action a person takes.** Choosing from a
list, toggling, or picking an option *is* the action. A control that needs a
second confirming press reads as broken — a person concludes the feature
does not work before they find the extra button. Confirmation is for the
irreversible, not the routine.

**24.4 Every wait has a state; every failure has a cause and next step.**
Force the failure — stop the database, go offline — and watch. Pending,
success, and failure are all designed states.
*Origin: an 8-second silent submit read as broken, and a save path with no
error state at all.*

**24.5 Reveal on evidence, and say why.** Content that appears without a
reason reads as a malfunction. Every conditional carries "Shown because…".

**24.6 Never make a person repeat themselves.** An answer given once is
reused everywhere it applies, shown with its source, still changeable.

**24.7 The system absorbs complexity.** No identifiers, acronym batteries,
or framework codes on screen. If a business user would need a glossary,
the question is wrong — not the user.
*Origin: intake asked for "ARA, BIR, PIA, DPIA, AVA" by name.*

**24.8 Show the whole journey honestly**, including stages not built yet —
as *upcoming*, never as broken or missing.

**24.9 Progress is measured in what's left for the person.** Never show a
total that includes work they cannot see or act on.
*Origin: a review queue that claimed "274 to attest" on a 39-question
assessment.*

## Output

A line per principle: met, or violated with the screen and wording. If a
violation is deliberate, say so and record it as a deferral — silence reads
as an oversight.

**24.10 Every question tells a person what to do when it doesn't apply to
them.** An optional field with no guidance leaves someone deciding whether
blank means "none" or "I forgot", and the reviewer inherits the ambiguity.
Say it: "leave blank if everything is in-house."

**24.11 Every question carries helper text that teaches**, not text that
restates the label. Only a self-evident label may go without.

# Pass 3 — anything that points at this surface (owner rule, 2026-08-22)

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
