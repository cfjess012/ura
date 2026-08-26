---
artifact: three-minute-run-sheet
for: leadership demo
walked: 2026-08-23 (every click below driven against the seeded demo data)
---

# The three-minute demo

Three minutes is about **five moves**. Anything more and the room watches
clicking instead of listening. Each beat below proves one of the three
problem statements — say the problem, then show the answer to it.

**Before you start — do this, not just the browser bit:**

```sh
pnpm demo:reset      # rebuilds the database and the four curated assessments
pnpm demo:prod       # production build, then serve it
```

`demo:reset` is not optional. Any walk-through leaves answers behind, and a
severity question already answered makes Beat 3 look like a dead button —
the click does nothing because the answer is already there. Answers are
insert-only by design, so a rebuild is the only way back.

Then: sign out to the front door, `Novara scheduling assistant` un-opened,
one browser tab.

---

## The frame (say this first, 15 seconds)

> "Risk data lives in a dozen places, business users give up halfway, and
> analysts get whatever people happened to type. Three problems. Watch."

---

## Beat 1 · One front door — 20 seconds

**Problem: fragmented ecosystem.**

Front door → **Isabelle Withers** → the list.

> "One place. Every risk area works from the same answers."

Don't linger. The list is context, not the point.

---

## Beat 2 · The answers already did work — 45 seconds

**Problems: high friction, and inconsistent intake.**

Click **Novara scheduling assistant**. It opens straight on where the
assessment stands.

Point at the rail — say the words on the screen:

> "Four areas answered before she was asked anything. **Yes · from intake.**
> And this one — **Yes · from your answers** — one risk area answered
> another."

Then the line under the heading:

> **"4 of the 9 areas that apply open detailed questions. The other 5 are
> recorded for a reviewer and ask nothing further. 2 are closed — you won't
> be asked about them again."**

> "It closes what doesn't apply, and it tells you where it stops. That is
> the difference between a form and an instrument."

**The one to read aloud** — scroll to _What we'll ask about_:

> **"Subcontractor Reliance (Fourth Parties) — added because you told us
> this uses AI and involves a company outside ours, so the model provider
> behind it is a fourth party."**

> "Nobody asked that. Two answers in two different areas produced a third."

---

## Beat 3 · One answer, six obligations — 45 seconds

**Problem: inconsistent analyst intake.**

From the summary, click **Answer the severity questions →**, then
**Third-Party** in the left rail. Answer **Level of Provider Access** =
_"Privileged / admin access to production…"_

Six controls appear under **What these answers require** — live, no reload.

> "One answer. Six control obligations, each naming the answer that pulled
> it in. Two assessors reading the same situation land in the same place —
> that's what makes the portfolio number mean anything."

---

## Beat 4 · Does it actually exist? — 40 seconds

**Problem: inconsistent analyst intake, continued.**

Scroll up and click **Answer the control questions →**.

Answer one **No**. The note field appears and demands an explanation.

> "This is the only stage that asks about reality rather than about the
> project. A 'No' here is a finding a reviewer can act on — and it cannot
> be given without saying what's missing."

Point at **Recorded for a reviewer** below:

> "And where the pilot has no questions yet, it says so rather than going
> quiet."

---

## Beat 5 · When someone is stuck — 30 seconds

**Problems: friction, and fragmentation.**

Browser back to the severity questions. On any question click
**"I don't know — leave this to us"**, tag **Third-Party & Supply Chain**,
then **Hand it over**.

> "She's not blocked and she doesn't email anyone."

Switch to **Samuel Okonkwo**. The bell shows it, on the warm band:

> **"These clear themselves when the work is done — they can't be
> dismissed."**

> "It isn't a message. It's derived from the state of the question. Answer
> the question and it disappears — nothing to mark read, nothing to go
> stale."

---

## Close (15 seconds)

> "Ninety hours of scattered assessment, in one guided session, with every
> answer attributed and every requirement carrying its reason."

---

## If you are asked

**"Where's the AI?"**

> "Everything you just saw is deterministic — rules, not reasoning, which is
> why it's explainable. The agentic layer is the next epic: it drafts these
> answers from documents with verbatim citations, and a person still
> confirms every one. It runs on Bedrock; nothing about it is connected
> today and we don't pretend otherwise."

**"What happens after the assessment?"**

> "The submitter declares the record accurate, and a Risk Assessor signs
> every control answer under their own risk area — the platform refuses a
> signature from the wrong area, and refuses one on an assessment that can
> still change. A No becomes a finding, and a finding closes one of exactly
> four ways: the answer was wrong, it doesn't apply, someone is fixing it by
> a date, or the risk is accepted by a second person until a date it comes
> back on its own. The export package is the one stage still to build, and
> the stepper marks it as upcoming."

If they want to see it: **Sable claims triage** is already with a reviewer.
Sign in as **Diego Marquez** and it opens on his queue.

**"How much of the instrument is covered?"**

> "Eleven risk areas, all asked. Detailed questions in four of them, and
> control questions for 15 of the 51 objectives — the product says so on
> screen wherever it stops. The rest is content authoring, not engineering."

---

## What not to do

- **Don't open Quarterly close checklist or Partner data exchange.** They're
  seeded for other purposes; one has an open hand-off mid-thread.
- **Don't answer more than one severity question.** The list grows and the
  point is made by the first one.
- **Don't run from `pnpm dev`** _on macOS or Linux_. The Next.js badge sits
  in the corner of every screen. `pnpm demo:prod` is the demo's mode and is
  verified.

  **On Windows `demo:prod` cannot run at all** — it is four POSIX-only
  constructs (`VAR=value`, `cp -r`, `/dev/null`, `;`) and pnpm hands scripts
  to cmd.exe, which dies on the first token. Either demo from `pnpm dev` and
  accept the badge, or run the equivalent by hand:

  ```powershell
  $env:NEXT_DIST_DIR = ".next-prod"
  pnpm exec next build
  Copy-Item -Recurse -Force .next-prod\static .next-prod\standalone\.next-prod\
  $env:PORT = "3100"; node .next-prod\standalone\server.js
  ```

- **Don't skip `pnpm demo:reset`.** It is the difference between Beat 3
  landing and Beat 3 looking broken.
- **Don't promise a date for the agentic layer.** The Bedrock access request
  is still open.
