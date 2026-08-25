/**
 * What a person is looking at, derived from where they are.
 *
 * The assistant is mounted once per assessment, so it knows which
 * assessment somebody is on and nothing about which screen. Asked "what
 * does this mean?", it answered about the assessment in general — which is
 * the difference between a thought partner and a search box.
 *
 * The path is the only thing the client can honestly report about itself,
 * and everything else is derived here from the instrument. Nothing the
 * caller sends becomes a question: the path selects, the instrument
 * supplies the words.
 *
 * Pure: no framework, no driver, no environment (§26.1).
 */
import { CATEGORIES, type Category } from "./instrument";
import { INTAKE_SECTIONS, sectionKey } from "./intake";
import { OBJECTIVES } from "./tier3";
import { SEVERITY, severityGroupKey } from "./severity";

export type OnScreen = { screen: string; questions: string[] };

/** The section of a project path after `/projects/<id>/`. */
function tail(pathname: string): string[] {
  const at = pathname.indexOf("/projects/");
  if (at === -1) return [];
  return pathname
    .slice(at + "/projects/".length)
    .split("/")
    .slice(1)
    .filter(Boolean);
}

/**
 * What is on the screen at `pathname`, or null where nothing is being
 * asked. Returns the questions **verbatim** — the assistant must talk
 * about the question a person can see, in the words they can see.
 */
export function whatsOnScreen(pathname: string): OnScreen | null {
  const parts = tail(pathname);
  if (parts.length === 0) return null;

  if (parts[0] === "intake") {
    const section = INTAKE_SECTIONS.find(
      (s) => sectionKey(s.name) === parts[1],
    );
    if (!section) return null;
    return {
      screen: `the “${section.name}” part of describing the activity`,
      questions: section.fields.map((field) => field.label),
    };
  }

  if (parts[0] === "assess") {
    if (parts[1] === "paths") {
      return {
        screen: "choosing which parts of each risk area apply",
        questions: [],
      };
    }
    if (parts[1] === "severity") {
      const group = parts[2];
      // Grouped by CATEGORY, the same way the rail and the page group them.
      // This filtered on `path` instead — a different field entirely — so on
      // a severity screen it matched nothing and the assistant told somebody
      // it could not see the question in front of them and asked them to
      // paste it in.
      const here = (SEVERITY.questions ?? []).filter(
        (q) => !group || severityGroupKey(q.category) === group,
      );
      const named = here[0]?.category;
      return {
        screen: named
          ? `the severity questions for ${named}`
          : "the severity questions",
        // The bands too. "Pick the description that fits" is the whole
        // instruction on this screen, so the descriptions ARE the question —
        // without them the assistant can say what severity means in general
        // and nothing about the choice actually in front of them.
        questions: here.slice(0, 8).map((q) => {
          const bands = Object.entries(q.bands)
            .map(([band, anchor]) => `${band}: ${anchor}`)
            .join(" · ");
          return `${q.name} — ${q.text} (${bands})`;
        }),
      };
    }
    if (parts[1] === "objectives") {
      return {
        screen: "the control questions — whether each control already exists",
        questions: OBJECTIVES.map((o) => o.text).slice(0, 12),
      };
    }
    if (parts[1] === "complete") {
      return {
        screen: "the summary of where the assessment stands",
        questions: [],
      };
    }
    const category = CATEGORIES.find((c) => c.key === parts[1]);
    if (category) {
      return {
        screen: `the ${category.name} risk area`,
        questions: [category.text],
      };
    }
  }

  if (parts[0] === "submit") {
    return {
      screen: "the screen where they declare their answers accurate",
      questions: [],
    };
  }
  if (parts[0] === "review") {
    return { screen: "the reviewer's queue", questions: [] };
  }
  if (parts[0] === "report") {
    return { screen: "the handoff summary", questions: [] };
  }
  return null;
}

/**
 * The gate questions a person can actually answer on this screen.
 *
 * `whatsOnScreen` returns question TEXT, because that is what a model
 * should say back to somebody. This returns the instrument's own
 * categories, because a proposal has to be written against an id — and it
 * reuses the same path parser, so there is one statement of which screen is
 * which.
 *
 * **The screen is a ceiling, not a target.** It says what may be proposed
 * here; whether a question is still open is the record's business, and the
 * caller intersects the two.
 *
 * Empty everywhere a proposal could not be shown or accepted, which is
 * everywhere except an askable risk area. Paths, severity and objectives
 * are answered in shapes `ProposedAnswer` cannot render — and worse,
 * `acceptDraft` looks the question up in `gateStates`, so a draft written
 * for one of them would be permanently un-acceptable: a card with a button
 * that always refuses.
 */
export function gatesAnswerableAt(pathname: string): Category[] {
  const parts = tail(pathname);
  if (parts[0] !== "assess" || parts.length < 2) return [];
  const category = CATEGORIES.find((c) => c.key === parts[1]);
  if (!category) return [];
  // Nobody is asked an always-applies gate, so there is no question on
  // screen for a proposal to sit under.
  if (category.alwaysApplies) return [];
  return [category];
}
