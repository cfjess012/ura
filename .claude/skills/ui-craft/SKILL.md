---
name: ui-craft
description: Build or review a screen to the demo-ready standard — tokens, designed states, hierarchy, motion, accessibility, content. Use when creating any new surface, restyling one, or before claiming a slice's interface is finished.
---

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
internal identifiers. See the `ux-audit` skill for the behavioural laws.

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

Every row is a link to the thing itself, per `alert-destination`.

## Who you are, in the app bar (owner-specified, 2026-08-22)

The signed-in person is **a name in bold and a role pill**, not a dropdown.
Switching is a deliberate act through the front door. A select in the chrome
invites a mis-click into somebody else's identity, and reads slower than two
words.
