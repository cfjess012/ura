/**
 * Which external obligations each control helps satisfy (FR-52, FR-53; G-80).
 *
 * The crosswalk is the answer to the question an enterprise actually asks —
 * not "are your controls good" but "which of my obligations do they satisfy,
 * and what is left". It is only worth having if every reference in it is
 * real, so a mapping must name a control this instrument knows and a
 * requirement a loaded framework contains, and the import refuses one that
 * does not resolve at both ends.
 *
 * A mapping also says **which kind of reading it is**. Equivalent, partial
 * and supporting are different claims, and collapsing them into a tick would
 * flatter the crosswalk: partial is the honest majority case, and a coverage
 * report built on inflated equivalence tells a compliance team it is finished
 * when it is not.
 *
 * Coverage is computed here and never asserted, like every other count in
 * this product.
 *
 * Pure: no framework, no driver, no environment.
 */
import doc from "@/data/reference/control-crosswalk.json";
import { FRAMEWORKS, frameworkById, itemOf, type Framework } from "./frameworks";
import { CONTROLS, controlName } from "./severity";

/** How much of the requirement the control actually carries. */
export const RELATIONSHIPS = ["equivalent", "partial", "supports"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export type Mapping = {
  /** A control objective in this instrument's catalogue. */
  objective: string;
  /** A framework that is loaded. */
  framework: string;
  /** A requirement that framework contains. */
  ref: string;
  relationship: Relationship;
  /** The author's reading, in a sentence. */
  because: string;
};

type CrosswalkDoc = { slug: string; version: string; note: string; mappings: Mapping[] };

/** Everything wrong with a set of mappings, as sentences a person can act on. */
export function crosswalkProblems(mappings: Mapping[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const mapping of mappings) {
    const where = `${mapping.objective} → ${mapping.framework} ${mapping.ref}`;
    if (!CONTROLS[mapping.objective]) {
      problems.push(`${where}: "${mapping.objective}" is not a control this instrument knows`);
    }
    const framework = frameworkById(mapping.framework);
    if (!framework) {
      problems.push(`${where}: "${mapping.framework}" is not a loaded framework`);
    } else {
      const item = itemOf(mapping.framework, mapping.ref);
      if (!item) {
        problems.push(`${where}: ${framework.name} has no requirement "${mapping.ref}"`);
      } else if (item.withdrawn) {
        problems.push(
          `${where}: ${mapping.ref} was withdrawn by ${framework.publisher} — map to what replaced it`,
        );
      }
    }
    if (!RELATIONSHIPS.includes(mapping.relationship)) {
      problems.push(
        `${where}: "${String(mapping.relationship)}" is not one of ${RELATIONSHIPS.join(", ")}`,
      );
    }
    // A mapping with no reasoning is a claim nobody can check or challenge.
    if ((mapping.because ?? "").trim().length < 20) {
      problems.push(`${where}: needs a sentence saying why`);
    }
    const key = `${mapping.objective}|${mapping.framework}|${mapping.ref}`;
    if (seen.has(key)) problems.push(`${where}: mapped twice`);
    seen.add(key);
  }
  return problems;
}

const CROSSWALK: CrosswalkDoc = (() => {
  const candidate = doc as unknown as CrosswalkDoc;
  const problems = crosswalkProblems(candidate.mappings);
  if (problems.length > 0) {
    throw new Error(`The control crosswalk is invalid:\n- ${problems.join("\n- ")}`);
  }
  return candidate;
})();

export const CROSSWALK_VERSION = `${CROSSWALK.slug}@${CROSSWALK.version}`;

/** One obligation a control helps satisfy, ready to render. */
export type Obligation = {
  framework: string;
  frameworkName: string;
  edition: string;
  ref: string;
  heading: string;
  relationship: Relationship;
  because: string;
  /** The published wording, where the licence allows it to be shown. */
  quote: string | null;
};

/** What a control objective is required by, in the order the edition lists it. */
export function obligationsFor(objective: string): Obligation[] {
  return CROSSWALK.mappings
    .filter((m) => m.objective === objective)
    .map((m) => {
      const framework = frameworkById(m.framework)!;
      const item = itemOf(m.framework, m.ref)!;
      return {
        framework: m.framework,
        frameworkName: framework.name,
        edition: framework.edition,
        ref: m.ref,
        heading: item.heading,
        relationship: m.relationship,
        because: m.because,
        quote: framework.quotable ? (item.text ?? null) : null,
      };
    });
}

/** Every control that carries at least one obligation from this framework. */
export function controlsUnder(frameworkId: string): string[] {
  return [
    ...new Set(
      CROSSWALK.mappings.filter((m) => m.framework === frameworkId).map((m) => m.objective),
    ),
  ].sort();
}

export type FrameworkCoverage = {
  framework: string;
  name: string;
  edition: string;
  /** Requirements at least one control is mapped to. */
  covered: Array<{ ref: string; heading: string; controls: string[] }>;
  /** Requirements no control addresses — the half that matters. */
  uncovered: Array<{ ref: string; heading: string }>;
};

/**
 * What a framework asks for, and how much of it this instrument reaches.
 *
 * Withdrawn requirements are left out of both halves: counting them as
 * uncovered would invent a gap the publisher has already closed.
 */
export function frameworkCoverage(frameworkId: string): FrameworkCoverage | null {
  const framework = frameworkById(frameworkId);
  if (!framework) return null;
  const byRef = new Map<string, string[]>();
  for (const m of CROSSWALK.mappings.filter((m) => m.framework === frameworkId)) {
    byRef.set(m.ref, [...(byRef.get(m.ref) ?? []), m.objective]);
  }
  const current = framework.items.filter((i) => !i.withdrawn);
  return {
    framework: framework.id,
    name: framework.name,
    edition: framework.edition,
    covered: current
      .filter((i) => byRef.has(i.ref))
      .map((i) => ({ ref: i.ref, heading: i.heading, controls: byRef.get(i.ref)!.sort() })),
    uncovered: current
      .filter((i) => !byRef.has(i.ref))
      .map((i) => ({ ref: i.ref, heading: i.heading })),
  };
}

/** Coverage for every loaded framework, worst-covered first. */
export function coverage(): FrameworkCoverage[] {
  return FRAMEWORKS.map((f) => frameworkCoverage(f.id)!).sort(
    (a, b) => a.covered.length - b.covered.length,
  );
}

/**
 * Controls this instrument requires that cite no external obligation at all.
 *
 * Not a defect on its own — an organisation's own standard may go beyond any
 * framework it is measured against — but it is the list a compliance team
 * needs, and a control that maps to nothing anywhere is worth a second look.
 */
export function controlsWithoutObligation(): Array<{ objective: string; name: string; family: string }> {
  const mapped = new Set(CROSSWALK.mappings.map((m) => m.objective));
  return Object.entries(CONTROLS)
    .filter(([id]) => !mapped.has(id))
    .map(([id, control]) => ({ objective: id, name: controlName(id), family: control.family }))
    .sort((a, b) => a.objective.localeCompare(b.objective));
}

/** Frameworks this product knows of but does not carry, and why (FR-54, §24.8). */
export const NOT_LOADED: ReadonlyArray<{ name: string; publisher: string; because: string }> = [
  {
    name: "ISO/IEC 27001 and ISO/IEC 27002",
    publisher: "ISO/IEC",
    because:
      "licensed — the text may not be redistributed, so an organisation loads the copy it holds",
  },
  {
    name: "ISO/IEC 42001",
    publisher: "ISO/IEC",
    because:
      "licensed — the text may not be redistributed, so an organisation loads the copy it holds",
  },
  {
    name: "SOC 2 Trust Services Criteria",
    publisher: "AICPA",
    because:
      "licensed — the criteria may not be redistributed, so an organisation loads the copy it holds",
  },
  {
    name: "NIST AI Risk Management Framework 1.0",
    publisher: "National Institute of Standards and Technology",
    because:
      "public, but its reference tool offers no export this transcriber can reach; it is loaded when one exists rather than typed from memory",
  },
];

/** The frameworks a person can be shown, loaded and not, for one honest list. */
export function frameworkRoster(): {
  loaded: Array<Pick<Framework, "id" | "name" | "edition" | "publisher">>;
  notLoaded: typeof NOT_LOADED;
} {
  return {
    loaded: FRAMEWORKS.map(({ id, name, edition, publisher }) => ({ id, name, edition, publisher })),
    notLoaded: NOT_LOADED,
  };
}
