/**
 * The handoff summary, split by the risk domain that owns each part.
 *
 * A submitted assessment goes to several risk domains at once, and each of
 * them cares about a different slice of it — Security about the security
 * controls, Privacy about the privacy ones. Handing every reviewer the
 * whole report and asking them to find their own part is how the
 * questionnaire sprawl this product exists to replace began.
 *
 * The split is deterministic. `control-domains.json` already says which
 * risk area owns which control family, and that map is versioned data a
 * human ratifies (NFR-20) — so a tab is never a model's opinion about who
 * should look at something. What the model contributes is the reading:
 * scenarios worth asking about, which land in a tab because of the answers
 * they cite, not because a model was asked to file them.
 *
 * Pure: no framework, no driver, no environment (§26.1).
 */
import { domainForObjective } from "./attestation";
import { CATEGORIES } from "./instrument";
import { SEVERITY_QUESTIONS } from "./severity";
import type {
  ProposedScenario,
  Report,
  ReportControl,
  ReportFinding,
} from "./report";

export type DomainSlice = {
  key: string;
  name: string;
  /** Why this domain is in the assessment at all, in the person's words. */
  because: string;
  /** The scoping question that put it in scope, and what was answered. */
  question: string;
  answer: string;
  controls: ReportControl[];
  findings: ReportFinding[];
  severities: Array<{ name: string; band: string }>;
  scenarios: ProposedScenario[];
  /** Findings that cite a policy clause — the ones that read first. */
  breaches: number;
};

const NAME_OF = new Map(CATEGORIES.map((c) => [c.key, c.name]));

/**
 * Which risk area owns a severity question, from the instrument's own path
 * map — the category whose path question offers that path.
 *
 * Derived, never a table kept alongside. A hand-written mapping would be a
 * second opinion about the instrument's structure, and it would be wrong
 * the first time a path moved. `severityDomain` was always meant to be
 * answered by the instrument; nothing was passing it, so every follow-up
 * question in the report was filed nowhere.
 */
const AREA_OF_PATH = new Map<string, string>();
for (const category of CATEGORIES) {
  for (const option of category.pathQuestion?.options ?? []) {
    AREA_OF_PATH.set(option.id, category.key);
  }
}

const AREA_OF_SEVERITY = new Map<string, string>();
for (const question of SEVERITY_QUESTIONS) {
  const area = question.path ? AREA_OF_PATH.get(question.path) : undefined;
  if (area && !AREA_OF_SEVERITY.has(question.name)) {
    AREA_OF_SEVERITY.set(question.name, area);
  }
}

/**
 * The area a severity question belongs to, by the name the report carries.
 * Null for the three that apply to every assessment — those belong to no
 * single area, and filing them under one would be a guess.
 */
export function severityAreaOf(name: string): string | null {
  return AREA_OF_SEVERITY.get(name) ?? null;
}

/**
 * Which domain a scenario belongs to, from what it says it read.
 *
 * A scenario cites controls and areas by name (§4.4, enforced by
 * `groundedScenarios`), so the names it cites decide the tab. One that
 * spans two domains appears in both: a reviewer seeing half of a
 * cross-domain question is worse than two people seeing the same one.
 */
function domainsCited(
  scenario: ProposedScenario,
  controlDomain: Map<string, string>,
  areaKey: Map<string, string>,
): string[] {
  const hit = new Set<string>();
  for (const cited of scenario.from) {
    const name = cited.trim().toLowerCase();
    const viaControl = controlDomain.get(name);
    if (viaControl) hit.add(viaControl);
    const viaArea = areaKey.get(name);
    if (viaArea) hit.add(viaArea);
  }
  return [...hit];
}

/**
 * One slice per risk domain that actually has something in it.
 *
 * A domain with no controls, no findings and no severity is not shown: an
 * empty tab is a promise of content that is not there, and a reviewer who
 * opens three of them stops opening them.
 */
export function domainSlices(
  report: Report,
  scenarios: ProposedScenario[],
  severityDomain: (name: string) => string | null = () => null,
): DomainSlice[] {
  const controlDomain = new Map<string, string>();
  for (const control of report.controls) {
    const domain = domainForObjective(control.objective);
    if (domain) controlDomain.set(control.name.toLowerCase(), domain);
  }
  const areaKey = new Map<string, string>();
  for (const area of report.areasThatApply) {
    areaKey.set(area.name.toLowerCase(), area.key);
  }

  const slices = new Map<string, DomainSlice>();
  const open = (key: string): DomainSlice => {
    const existing = slices.get(key);
    if (existing) return existing;
    const area = report.areasThatApply.find((a) => a.key === key);
    const made: DomainSlice = {
      key,
      name: NAME_OF.get(key) ?? key,
      because: area?.because ?? "it owns controls this activity requires",
      // A domain can hold a control without its own gate having been asked
      // — the control map, not the gate, is what put it here.
      question: area?.question ?? "",
      answer: area?.answer ?? "",
      controls: [],
      findings: [],
      severities: [],
      scenarios: [],
      breaches: 0,
    };
    slices.set(key, made);
    return made;
  };

  for (const control of report.controls) {
    const domain = domainForObjective(control.objective);
    if (domain) open(domain).controls.push(control);
  }
  for (const finding of report.findings) {
    const domain = domainForObjective(finding.objective);
    if (!domain) continue;
    const slice = open(domain);
    slice.findings.push(finding);
    if (finding.kind === "non-compliance") slice.breaches += 1;
  }
  for (const severity of report.severities) {
    const domain = severityDomain(severity.name);
    if (domain) open(domain).severities.push(severity);
  }
  for (const scenario of scenarios) {
    for (const domain of domainsCited(scenario, controlDomain, areaKey)) {
      open(domain).scenarios.push(scenario);
    }
  }

  // Ordered by what a reviewer should open first: a cited clause outranks a
  // finding, which outranks a control still to read.
  return [...slices.values()].sort(
    (a, b) =>
      b.breaches - a.breaches ||
      b.findings.length - a.findings.length ||
      b.controls.length - a.controls.length ||
      a.name.localeCompare(b.name),
  );
}

/** Scenarios that cite nothing any domain owns — shown once, at the top. */
export function unfiledScenarios(
  report: Report,
  scenarios: ProposedScenario[],
): ProposedScenario[] {
  const filed = new Set(
    domainSlices(report, scenarios).flatMap((slice) =>
      slice.scenarios.map((s) => s.scenario),
    ),
  );
  return scenarios.filter((s) => !filed.has(s.scenario));
}
