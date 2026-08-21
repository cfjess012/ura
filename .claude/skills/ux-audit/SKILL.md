---
name: ux-audit
description: Walk a surface as a person and audit it against the experience principles before calling it done. Use when finishing any screen, reviewing a flow, or deciding how a question should behave when someone answers "I don't know".
---

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

---

This numbering must match SPEC §24 exactly. It drifted once — the skill sat
two revisions behind the law it audits, and a verifier told to trust it
audited against the wrong list (N7). `test/unit/docs.test.ts` now checks it.
