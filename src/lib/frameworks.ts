/**
 * External control frameworks — grounded, licensed correctly, and dated
 * (FR-52, NFR-24; G-80).
 *
 * A framework here is never written from memory. Each file is transcribed
 * from its publisher's own machine-readable source by
 * `scripts/fetch-framework.mjs`, and carries where it came from, which
 * edition it is, and when a person last checked it. A crosswalk built on
 * remembered clause numbers would be confident, plausible and wrong, and
 * invisible to every test in this repository — which is exactly the defect
 * this product exists to prevent in other people's work.
 *
 * Two rules are enforced here rather than left to authorial care:
 *
 * 1. **Licensed text is never redistributed.** NIST, GDPR and the EU AI Act
 *    are public and may be quoted. ISO and the SOC 2 criteria are licensed:
 *    a framework marked `quotable: false` may carry references and headings
 *    but no text, and an item with text on such a framework fails the
 *    build. Those frameworks are loaded by the organisation that holds the
 *    licence (FR-54) rather than shipped here.
 * 2. **Staleness is a red build, not a discovery.** Every framework states
 *    a review window; past it, `stale()` says so and a test fails, naming
 *    the command that re-transcribes it. A crosswalk that was right in 2026
 *    is quietly wrong in 2028 unless something asks.
 *
 * Pure: no framework, no driver, no environment.
 */
import csf from "@/data/reference/frameworks/nist-csf-2.0.json";
import gdpr from "@/data/reference/frameworks/gdpr-2016-679.json";
import aiAct from "@/data/reference/frameworks/eu-ai-act-2024-1689.json";

/** One requirement a control can be mapped to. */
export type FrameworkItem = {
  /** The identifier as printed in the published document. */
  ref: string;
  /** The grouping the publisher puts it under — a category, chapter or article. */
  heading: string;
  /** The published wording, verbatim. Absent on a licensed framework. */
  text?: string;
  /** Superseded by the publisher; still listed so an old mapping can be told it is out of date. */
  withdrawn?: boolean;
};

export type Framework = {
  id: string;
  name: string;
  /** The edition or version, as the publisher names it. */
  edition: string;
  publisher: string;
  /** When the publisher issued this edition (ISO date). */
  published: string;
  /** May its text be reproduced? False for anything licensed. */
  quotable: boolean;
  /** The licence position in one sentence, for a reader who has to justify it. */
  licence: string;
  source: {
    title: string;
    url: string;
    format: string;
    /** When this transcription was taken. */
    retrieved: string;
  };
  /** When a person last confirmed this is still the current edition. */
  checkedOn: string;
  checkedBy: string;
  /** How long a check stands before the build asks again. */
  reviewWindowMonths: number;
  items: FrameworkItem[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Everything wrong with a framework file, as sentences. Returned rather
 * than thrown so the admin loader (FR-54) can show them all at once instead
 * of one per attempt.
 */
export function frameworkProblems(candidate: Framework): string[] {
  const problems: string[] = [];
  const where = candidate.id || "a framework with no id";
  const required: Array<[keyof Framework, string]> = [
    ["id", "an id"],
    ["name", "a name"],
    ["edition", "an edition"],
    ["publisher", "a publisher"],
    ["licence", "a licence position"],
    ["checkedBy", "who checked it"],
  ];
  for (const [key, what] of required) {
    if (!String(candidate[key] ?? "").trim()) problems.push(`${where}: has no ${what}`);
  }
  for (const key of ["published", "checkedOn"] as const) {
    if (!ISO_DATE.test(String(candidate[key] ?? ""))) {
      problems.push(`${where}: ${key} must be a date, got "${String(candidate[key])}"`);
    }
  }
  if (!candidate.source?.url?.startsWith("https://")) {
    problems.push(`${where}: needs the source URL it was transcribed from`);
  }
  if (!ISO_DATE.test(String(candidate.source?.retrieved ?? ""))) {
    problems.push(`${where}: needs the date its source was retrieved`);
  }
  if (
    !Number.isInteger(candidate.reviewWindowMonths) ||
    candidate.reviewWindowMonths < 1 ||
    candidate.reviewWindowMonths > 36
  ) {
    problems.push(
      `${where}: the review window must be a whole number of months between 1 and 36`,
    );
  }
  if (typeof candidate.quotable !== "boolean") {
    problems.push(`${where}: must say whether its text may be reproduced`);
  }
  if (!Array.isArray(candidate.items) || candidate.items.length === 0) {
    problems.push(`${where}: has no requirements`);
    return problems;
  }

  const seen = new Set<string>();
  for (const item of candidate.items) {
    if (!item.ref?.trim()) {
      problems.push(`${where}: an item has no reference`);
      continue;
    }
    if (seen.has(item.ref)) problems.push(`${where}: "${item.ref}" appears twice`);
    seen.add(item.ref);
    if (!item.heading?.trim()) problems.push(`${where} ${item.ref}: has no heading`);
    // The licensing rule, and it is the whole reason this validator exists.
    if (candidate.quotable === false && item.text !== undefined) {
      problems.push(
        `${where} ${item.ref}: carries text, but ${candidate.name} is licensed — reference and heading only`,
      );
    }
    // A quotable framework whose text is missing cannot be checked against,
    // so a mapping to it could never be verified.
    if (candidate.quotable === true && !item.withdrawn && !item.text?.trim()) {
      problems.push(`${where} ${item.ref}: has no text, and this framework is quotable`);
    }
  }
  return problems;
}

/** Whether a framework is past its review window, and why in words. */
export function stale(
  framework: Pick<Framework, "id" | "name" | "edition" | "checkedOn" | "reviewWindowMonths">,
  now: Date,
): { stale: boolean; because: string } {
  const checked = new Date(`${framework.checkedOn}T00:00:00Z`);
  const due = new Date(checked);
  due.setUTCMonth(due.getUTCMonth() + framework.reviewWindowMonths);
  if (now < due) {
    return {
      stale: false,
      because: `${framework.name} ${framework.edition} was checked on ${framework.checkedOn}`,
    };
  }
  return {
    stale: true,
    because: `${framework.name} ${framework.edition} was last checked on ${framework.checkedOn} and was due for re-checking on ${due.toISOString().slice(0, 10)}`,
  };
}

/**
 * The frameworks shipped with the product — public ones only, each
 * transcribed from its publisher.
 *
 * Imported one by one rather than globbed, because the build has to see
 * them: a directory read at runtime would put reference content outside the
 * bundle and outside the validation below.
 */
const SHIPPED: Framework[] = [
  csf as Framework,
  gdpr as Framework,
  aiAct as Framework,
];

const validated = (() => {
  const problems = SHIPPED.flatMap(frameworkProblems);
  const ids = SHIPPED.map((f) => f.id);
  for (const id of ids) {
    if (ids.filter((other) => other === id).length > 1) {
      problems.push(`two frameworks share the id "${id}"`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`Framework content is invalid:\n- ${problems.join("\n- ")}`);
  }
  return SHIPPED;
})();

export const FRAMEWORKS: readonly Framework[] = validated;

/** A framework by its id, or null — never a guess. */
export function frameworkById(id: string): Framework | null {
  return FRAMEWORKS.find((f) => f.id === id) ?? null;
}

/** One requirement, by framework and reference. Null when either is unknown. */
export function itemOf(frameworkId: string, ref: string): FrameworkItem | null {
  return frameworkById(frameworkId)?.items.find((i) => i.ref === ref) ?? null;
}

/**
 * The published wording of a requirement, or null where it may not be
 * reproduced. Callers render the reference and heading in that case; they
 * never fall back to their own paraphrase, which would be the product
 * inventing the standard it claims to cite.
 *
 * Pure, and taking the framework rather than its id, so the licensing rule
 * can be proved on any candidate — including one an organisation loads
 * itself (FR-54), which never passes through the shipped registry.
 */
export function quoteIn(framework: Pick<Framework, "quotable" | "items">, ref: string): string | null {
  if (!framework.quotable) return null;
  return framework.items.find((i) => i.ref === ref)?.text ?? null;
}

/** The published wording of a shipped framework's requirement, or null. */
export function quoteOf(frameworkId: string, ref: string): string | null {
  const framework = frameworkById(frameworkId);
  return framework ? quoteIn(framework, ref) : null;
}

/** Frameworks a person can be told about: name, edition, and how fresh it is. */
export function frameworkStanding(now: Date): Array<{
  id: string;
  name: string;
  edition: string;
  publisher: string;
  quotable: boolean;
  items: number;
  current: number;
  checkedOn: string;
  stale: boolean;
  because: string;
}> {
  return FRAMEWORKS.map((f) => {
    const age = stale(f, now);
    return {
      id: f.id,
      name: f.name,
      edition: f.edition,
      publisher: f.publisher,
      quotable: f.quotable,
      items: f.items.length,
      current: f.items.filter((i) => !i.withdrawn).length,
      checkedOn: f.checkedOn,
      stale: age.stale,
      because: age.because,
    };
  });
}
