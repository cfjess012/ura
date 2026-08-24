/**
 * S8 — who may attest what, and how closely it needs looking at.
 *
 * Two rules, and they are deliberately different in kind:
 *
 * - **Authority is a fact about the person** (FR-17): a Risk Assessor
 *   attests under their own profile, for the risk area they own. It is
 *   checked on the server, never inferred from a screen.
 * - **Review priority is a signal, never a gate.** It orders the queue and
 *   nothing else. Lifted in spirit from the prior platform's grounding
 *   rubric (G-8), whose own comment is the reason it is worth taking:
 *   *"Deliberately NOT a model self-report: LLM confidence estimates are
 *   uncalibrated, and a number the system cannot verify would be the one
 *   dishonest pixel in a product built on mechanical gates."* Every
 *   criterion below is a checkable fact about the record, computed at read
 *   time, costing no model call.
 *
 * Pure: no framework, no driver, no environment (§26.1).
 */
import map from "@/data/reference/control-domains.json";
import { CATEGORIES } from "./instrument";
import { OBJECTIVES } from "./tier3";
import type { Person } from "./people";

type DomainMap = {
  slug: string;
  version: string;
  families: { family: string; domain: string; because: string }[];
};

const MAP: DomainMap = (() => {
  const candidate = map as DomainMap;
  const domains = new Set(CATEGORIES.map((c) => c.key));
  const families = new Set(OBJECTIVES.map((o) => o.family));
  for (const entry of candidate.families) {
    if (!domains.has(entry.domain)) {
      throw new Error(`control-domains.json: "${entry.domain}" is not a risk area`);
    }
  }
  // A family nobody owns is an answer nobody may attest, which would stop
  // packaging with no way forward. Better to fail the build.
  for (const family of families) {
    if (!candidate.families.some((e) => e.family === family)) {
      throw new Error(`control-domains.json: no risk area owns the "${family}" control family`);
    }
  }
  return candidate;
})();

export const CONTROL_DOMAIN_VERSION = MAP.version;

const DOMAIN_OF = new Map(MAP.families.map((e) => [e.family, e.domain]));
const BECAUSE_OF = new Map(MAP.families.map((e) => [e.family, e.because]));

/** Which risk area is accountable for a control objective's answers. */
export function domainForObjective(objectiveId: string): string | null {
  const objective = OBJECTIVES.find((o) => o.id === objectiveId);
  if (!objective) return null;
  return DOMAIN_OF.get(objective.family) ?? null;
}

/** Why, in words a person can read on the screen that refuses them. */
export function whyThatDomain(objectiveId: string): string | null {
  const objective = OBJECTIVES.find((o) => o.id === objectiveId);
  if (!objective) return null;
  return BECAUSE_OF.get(objective.family) ?? null;
}

/**
 * May this person attest this answer? (FR-17, §19)
 *
 * A Risk Assessor attests under their own profile — the risk area they
 * own. The generalist (no risk area) covers everything, so a question can
 * never sit in a queue nobody reads. Administrators are exempt, as §2 says.
 * A requester never attests: that is the declaration, and it is a different
 * act by a different person (G-52).
 */
export function mayAttest(person: Person, objectiveId: string): boolean {
  if (person.role === "admin") return true;
  if (person.role !== "assessor") return false;
  if (person.riskDomain === null) return true;
  return person.riskDomain === domainForObjective(objectiveId);
}

/** What to tell someone the server just refused, in their own terms. */
export function attestationRefusal(person: Person, objectiveId: string): string | null {
  if (mayAttest(person, objectiveId)) return null;
  if (person.role === "requester") {
    return "Attesting is the reviewer's act. You declared these answers accurate at submission — that is your part of it.";
  }
  const domain = domainForObjective(objectiveId);
  const area = CATEGORIES.find((c) => c.key === domain)?.name ?? "another risk area";
  const because = whyThatDomain(objectiveId);
  return `This one is ${area}'s to attest${because ? ` — ${because}` : ""}.`;
}
