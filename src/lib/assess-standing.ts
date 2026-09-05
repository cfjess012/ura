/**
 * Where an assessment stands, and the one thing to do next (G-91).
 *
 * The screen this feeds was 1,067 words, 45 bullets and three scrolls at the
 * moment a person wants to finish. Every part of it was true and traceable —
 * which is why it grew — but it read as the system explaining its own
 * workings, and the question somebody actually arrives with is *am I done,
 * and what do I press?*
 *
 * So: four rows of status, and exactly one next action. The action is
 * whichever step is unfinished first, because a screen offering two equal
 * choices is a screen that has not decided (§24.2). Everything the old page
 * shouted is still available — it moves behind disclosure rather than
 * being deleted, because a reviewer and an auditor do want it.
 *
 * Pure: the caller fetches, this decides. Derived on every read (NFR-3).
 */
import type { AssessJourney } from "./assess-journey";
import { asksNothingFurther } from "./severity";

/** What a status row says about one step. The word, never the colour (§23). */
export type StandingState = "answered" | "part-way" | "none" | "nothing-to-do";

export type StandingRow = {
  /** What the step is called — the same words the rail uses. */
  label: string;
  /** The fact about it, in a person's terms. */
  detail: string;
  state: StandingState;
};

/** An area the system decided, and where that decision came from. */
export type Decided = {
  name: string;
  /** "your intake", "your answers", or the rule that settles it outright. */
  from: string;
  because: string;
};

export type Standing = {
  /** The sentence at the top, answering "am I done?". */
  headline: string;
  /** One line under it. Never a recap of the rows. */
  lede: string;
  rows: StandingRow[];
  /**
   * Areas nobody was asked about, and why.
   *
   * On the face of the screen rather than behind the disclosure with the
   * rest of the map: a person meeting an assessment that answered itself in
   * three places, with no visible reason, has been surprised by their own
   * record. §24.5 wants the reason where the effect is, and §24.6 wants it
   * plain that we did not make them repeat what they had already said.
   */
  decided: Decided[];
  /**
   * The single thing to do next, or null once nothing is left — at which
   * point handing it over stops being the alternative and becomes the act.
   */
  next: { label: string; href: string } | null;
};

/** What each state is called where a person can see it. */
export const STANDING_LABEL: Record<StandingState, string> = {
  answered: "Answered",
  "part-way": "Part way",
  none: "None yet",
  "nothing-to-do": "Nothing to do",
};

export function standingFor(input: {
  journey: AssessJourney;
  projectId: string;
}): Standing {
  const { journey, projectId } = input;
  const base = `/projects/${projectId}/assess`;

  const applies = journey.gates.filter((g) => g.answer === "Yes");
  const closed = journey.gates.filter((g) => g.answer === "No");
  // An area that opens twelve questions and one that opens none used to read
  // identically (G-50). Counted apart so no number implies work that is not
  // there.
  const quiet = applies.filter((g) => asksNothingFurther(g.category.key));

  const rows: StandingRow[] = [
    {
      label: "Risk areas",
      // The boundary belongs on the face of the page, not behind a closed
      // disclosure (G-50, §24.8): an area that opens twelve questions and one
      // that opens none read identically, and somebody who never expands the
      // detail would never learn the difference.
      detail:
        journey.gatesRemaining > 0
          ? `${journey.gatesRemaining} of ${journey.gates.length} still to answer`
          : `${applies.length} of ${journey.gates.length} apply${quiet.length > 0 ? `, ${quiet.length} recorded for a reviewer only` : " to this activity"}`,
      state: journey.gatesRemaining > 0 ? "part-way" : "answered",
    },
  ];

  rows.push(
    journey.parts.length === 0
      ? {
          label: "Which parts",
          detail: "None of the open areas asks a follow-up",
          state: "nothing-to-do",
        }
      : {
          label: "Which parts",
          detail:
            journey.partsRemaining > 0
              ? `${journey.parts.length - journey.partsRemaining} of ${journey.parts.length} narrowed down`
              : `${journey.parts.length} narrowed down`,
          state: journey.partsRemaining > 0 ? "part-way" : "answered",
        },
  );

  const severityTotal = journey.severity.reduce((sum, g) => sum + g.total, 0);
  const severityDone = severityTotal - journey.severityRemaining;
  rows.push(
    severityTotal === 0
      ? {
          label: "How severe",
          detail: "Nothing here needs rating",
          state: "nothing-to-do",
        }
      : {
          label: "How severe",
          // Named as questions, because the rail beside this counts AREAS.
          // Both said "answered" with no unit, so "5 answered" sat next to
          // "19 rated" on one screen and read as a contradiction.
          detail:
            journey.severityRemaining > 0
              ? `${severityDone} of ${severityTotal} questions rated`
              : `${say(severityTotal, "question")} rated across ${say(journey.severity.length, "area")}`,
          state: journey.severityRemaining > 0 ? "part-way" : "answered",
        },
  );

  const { required, total, answered } = journey.controls;
  rows.push(
    required === 0
      ? {
          label: "Controls",
          detail: "Your answers so far require none",
          state: "nothing-to-do",
        }
      : {
          label: "Controls",
          // Two different numbers, so both are named. The rest go to a
          // reviewer as they stand — a boundary, so it is stated (G-50).
          detail:
            total === 0
              ? `${say(required, "control")} required, all recorded for a reviewer`
              : answered === 0
                ? `${say(required, "control")} required, ${total} you can answer here`
                : `${answered} of ${total} answered, ${required} required in all`,
          state:
            total === 0
              ? "nothing-to-do"
              : answered === 0
                ? "none"
                : answered === total
                  ? "answered"
                  : "part-way",
        },
  );

  return {
    decided: decidedFor(journey),
    headline: headlineFor(journey),
    lede: ledeFor(journey, { applies: applies.length, closed: closed.length, quiet: quiet.length }),
    rows,
    next: nextFor(journey, base),
  };
}

/**
 * Every area that got its answer without the person giving one.
 *
 * Three ways that happens, and each says so in its own words: read from the
 * identity record, worked out from another area's answer, or true of every
 * assessment there is.
 */
function decidedFor(journey: AssessJourney): Decided[] {
  const out: Decided[] = [];
  for (const gate of journey.gates) {
    if (!gate.because) continue;
    if (gate.settled) {
      out.push({ name: gate.category.name, from: "always applies", because: gate.because });
    } else if (gate.fromIntake) {
      out.push({
        name: gate.category.name,
        from: gate.origin === "answers" ? "from your answers" : "from your intake",
        because: gate.because,
      });
    }
  }
  return out;
}

/**
 * The first unfinished step, and nothing else.
 *
 * Order is the order a person meets them, so the button always points at the
 * nearest thing rather than the biggest.
 */
function nextFor(
  journey: AssessJourney,
  base: string,
): Standing["next"] {
  if (journey.gatesRemaining > 0) {
    const first = journey.walk.find((g) => g.answer === null);
    return {
      label: `Answer the ${say(journey.gatesRemaining, "risk area")} →`,
      href: first ? `${base}/${first.category.key}` : `${base}/complete`,
    };
  }
  if (journey.partsRemaining > 0) {
    return {
      label: `Narrow down the ${say(journey.partsRemaining, "remaining area")} →`,
      href: `${base}/paths`,
    };
  }
  if (journey.severityRemaining > 0) {
    const group = journey.severity.find((g) => g.done < g.total);
    return {
      label: `Answer the ${say(journey.severityRemaining, "severity question")} →`,
      href: group ? `${base}/severity/${group.key}` : `${base}/complete`,
    };
  }
  const owed = journey.controls.total - journey.controls.answered;
  if (owed > 0) {
    return {
      label: `Answer the ${say(owed, "control question")} →`,
      href: `${base}/objectives`,
    };
  }
  return null;
}

function headlineFor(journey: AssessJourney): string {
  if (journey.gatesRemaining > 0) return "Still working out what applies.";
  if (journey.partsRemaining > 0) return "Ready to narrow it down.";
  if (journey.severityRemaining > 0) return "Ready for the severity questions.";
  if (journey.controls.required === 0) return "Nothing further is required.";
  if (journey.controls.total === 0) return "Everything answerable is answered.";
  if (journey.controls.answered < journey.controls.total) {
    return "Ready for its control questions.";
  }
  return "Everything is answered.";
}

function ledeFor(
  journey: AssessJourney,
  counts: { applies: number; closed: number; quiet: number },
): string {
  if (journey.gatesRemaining > 0) {
    return "Each answer decides whether that area asks you anything at all — several are worked out from what you have already told us.";
  }
  const owed = journey.controls.total - journey.controls.answered;
  if (journey.partsRemaining > 0 || journey.severityRemaining > 0) {
    return `${counts.applies} of the ${counts.applies + counts.closed} risk areas apply here. What is left decides which controls this activity needs.`;
  }
  if (owed > 0) {
    return `Everything you have told us has been worked through. ${owed === journey.controls.total ? `${say(owed, "control question")} came out of it, and those are` : `${say(owed, "control question")} ${owed === 1 ? "is" : "are"} left, and ${owed === 1 ? "that is" : "those are"}`} the last thing anyone needs from you.`;
  }
  return "Nothing is outstanding. Handing it over is the next step, and a Risk Assessor takes it from there.";
}

/** "3 controls", "1 control" — the plural rule in one place. */
function say(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
