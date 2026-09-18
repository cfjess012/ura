/**
 * Who can answer each control (G-83).
 *
 * NIST's model, in this product's words. A **common** control is provided
 * centrally and inherited by everything that uses the provider: nobody's
 * project decides whether multi-factor authentication is enforced. A
 * **system-specific** control is about this activity and only the people
 * doing it can answer. A **hybrid** control is both — the platform provides
 * part of it and the activity provides the rest.
 *
 * This is not a taxonomy for its own sake. It is the answer to a measured
 * problem: of the fifteen control questions a requester faces today, ten are
 * common controls about the enterprise estate that they have no way to
 * answer. One assessment in the queue was submitted with thirteen questions
 * unanswered by someone who reached exactly those and stopped.
 *
 * Pure: no framework, no driver, no environment.
 */
import doc from "@/data/reference/control-provision.json";
import { CONTROLS, controlName } from "./severity";

/** Who can answer a control, in NIST's three kinds. */
export const PROVISIONS = ["common", "hybrid", "system-specific"] as const;
export type Provision = (typeof PROVISIONS)[number];

export type ControlProvision = {
  objective: string;
  provision: Provision;
  /** Why it is that kind — the owner's to ratify, so it has to be readable. */
  because: string;
};

type ProvisionDoc = { slug: string; version: string; note: string; controls: ControlProvision[] };

/** Everything wrong with a classification, as sentences. */
export function provisionProblems(controls: ControlProvision[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const control of controls) {
    const where = control.objective || "a control with no id";
    if (!CONTROLS[control.objective]) {
      problems.push(`${where}: not a control this instrument knows`);
    }
    if (seen.has(control.objective)) problems.push(`${where}: classified twice`);
    seen.add(control.objective);
    if (!PROVISIONS.includes(control.provision)) {
      problems.push(`${where}: "${String(control.provision)}" is not one of ${PROVISIONS.join(", ")}`);
    }
    // The reason is what the owner ratifies, so it cannot be a shrug.
    if ((control.because ?? "").trim().length < 20) {
      problems.push(`${where}: needs a sentence saying why it is that kind`);
    }
  }
  // A control nobody classified is a control that would silently keep being
  // asked of the wrong person — the exact failure this file exists to end.
  for (const objective of Object.keys(CONTROLS)) {
    if (!seen.has(objective)) {
      problems.push(`${objective} (${controlName(objective)}): nobody has said who can answer it`);
    }
  }
  return problems;
}

const PROVISION: ProvisionDoc = (() => {
  const candidate = doc as unknown as ProvisionDoc;
  const problems = provisionProblems(candidate.controls);
  if (problems.length > 0) {
    throw new Error(`The control classification is invalid:\n- ${problems.join("\n- ")}`);
  }
  return candidate;
})();

export const PROVISION_VERSION = `${PROVISION.slug}@${PROVISION.version}`;

const BY_OBJECTIVE = new Map(PROVISION.controls.map((c) => [c.objective, c]));

/** Who can answer this control, or null if it is not one we know. */
export function provisionOf(objective: string): ControlProvision | null {
  return BY_OBJECTIVE.get(objective) ?? null;
}

/** Can a platform provide this control at all? Only common and hybrid ones. */
export function isProvidable(objective: string): boolean {
  const provision = BY_OBJECTIVE.get(objective)?.provision;
  return provision === "common" || provision === "hybrid";
}

/** Every control of one kind, in catalogue order. */
export function controlsWhere(provision: Provision): ControlProvision[] {
  return PROVISION.controls.filter((c) => c.provision === provision);
}

/** How the catalogue splits — the number that makes the case. */
export function provisionTally(): Record<Provision, number> {
  const tally = { common: 0, hybrid: 0, "system-specific": 0 } as Record<Provision, number>;
  for (const control of PROVISION.controls) tally[control.provision] += 1;
  return tally;
}
