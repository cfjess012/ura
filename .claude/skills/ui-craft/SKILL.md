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
