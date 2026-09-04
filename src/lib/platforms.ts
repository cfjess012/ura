/**
 * The platforms an activity can sit on, each with an accountable owner
 * (G-83).
 *
 * Two kinds live here and the difference decides what happens downstream. A
 * platform with entries in `provides` is a **common control provider**: what
 * it provides is inherited by everything that uses it, so an activity behind
 * enterprise identity is not asked six identity questions it cannot answer.
 * A platform with none is an **assessed service**: it provides nothing, and
 * its assessment says what may be put on it. Most carry some of both.
 *
 * `allowedData` is the sharper half either way. What an activity wants to
 * place somewhere, set against what the platform is cleared for, is a
 * mismatch this product can find on its own rather than waiting for a person
 * to notice.
 *
 * Every platform carries an attestation with an expiry, and that is the rule
 * that keeps inheritance honest. Inheritance is how control failures get
 * laundered: past its date, an inherited answer is a claim with no evidence
 * behind it, so `stale()` says so and the answers stop counting.
 *
 * Pure: no framework, no driver, no environment.
 */
import doc from "@/data/reference/platforms.json";
import vendors from "@/data/reference/vendors.json";
import { isProvidable, provisionOf } from "./control-provision";
import { ALL_FIELDS } from "./intake";
import { CONTROLS, controlName } from "./severity";

export type Platform = {
  id: string;
  name: string;
  /** The vendor behind it, where there is one. Null for anything we run ourselves. */
  vendor: string | null;
  purpose: string;
  /** Accountable for the attestation and for spotting new features. */
  owner: { name: string; title: string };
  allowedData: {
    classifications: string[];
    dataElements: string[];
    /** Anything else that constrains use — region, retention, exclusions. */
    conditions: string[];
  };
  /** Controls this platform provides for everything that uses it. */
  provides: string[];
  attestation: { lastAttested: string; expires: string; cadence: string };
};

type PlatformDoc = { slug: string; version: string; note: string; platforms: Platform[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const optionsOf = (fieldId: string): string[] => {
  const field = ALL_FIELDS.find((f) => f.id === fieldId) as { options?: string[] } | undefined;
  return field?.options ?? [];
};
const VENDOR_IDS = new Set(
  ((vendors as { entries?: Array<{ id: string }> }).entries ?? []).map((v) => v.id),
);

/** Everything wrong with a set of platforms, as sentences a person can act on. */
export function platformProblems(platforms: Platform[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const classifications = optionsOf("dataClassification");
  const elements = optionsOf("dataElements");

  for (const platform of platforms) {
    const where = platform.id || "a platform with no id";
    if (seen.has(platform.id)) problems.push(`${where}: appears twice`);
    seen.add(platform.id);
    for (const [key, what] of [
      ["name", "a name"],
      ["purpose", "a sentence saying what it is for"],
    ] as const) {
      if (!String(platform[key] ?? "").trim()) problems.push(`${where}: has no ${what}`);
    }
    // An owner is the whole point: a platform nobody is accountable for
    // cannot attest, and inheritance from it would rest on nobody.
    if (!platform.owner?.name?.trim() || !platform.owner?.title?.trim()) {
      problems.push(`${where}: needs an owner with a name and a role`);
    }
    if (platform.vendor !== null && !VENDOR_IDS.has(platform.vendor)) {
      problems.push(`${where}: "${platform.vendor}" is not a vendor we know`);
    }

    for (const value of platform.allowedData?.classifications ?? []) {
      if (!classifications.includes(value)) {
        problems.push(`${where}: "${value}" is not a data classification anyone can choose`);
      }
    }
    if ((platform.allowedData?.classifications ?? []).length === 0) {
      problems.push(`${where}: must say what data it is cleared for, even if the answer is nothing`);
    }
    for (const value of platform.allowedData?.dataElements ?? []) {
      if (!elements.includes(value)) {
        problems.push(`${where}: "${value}" is not a data type anyone can choose`);
      }
    }

    for (const objective of platform.provides ?? []) {
      if (!CONTROLS[objective]) {
        problems.push(`${where}: provides "${objective}", which is not a control we know`);
        continue;
      }
      // The rule that ties this file to the classification: a platform can
      // only provide what is centrally providable. Claiming to provide a
      // system-specific control would inherit an answer only the activity
      // could give, which is the failure inheritance is prone to.
      if (!isProvidable(objective)) {
        problems.push(
          `${where}: provides ${controlName(objective)}, which is ${provisionOf(objective)?.provision} — no platform can answer that for an activity`,
        );
      }
    }

    const { lastAttested, expires } = platform.attestation ?? {};
    for (const [key, value] of [["lastAttested", lastAttested], ["expires", expires]] as const) {
      if (!ISO_DATE.test(String(value ?? ""))) {
        problems.push(`${where}: ${key} must be a date, got "${String(value)}"`);
      }
    }
    if (ISO_DATE.test(String(lastAttested)) && ISO_DATE.test(String(expires)) && expires <= lastAttested) {
      problems.push(`${where}: expires on or before it was attested, so it is never in force`);
    }
  }
  return problems;
}

const PLATFORMS_DOC: PlatformDoc = (() => {
  const candidate = doc as unknown as PlatformDoc;
  const problems = platformProblems(candidate.platforms);
  if (problems.length > 0) {
    throw new Error(`Platform content is invalid:\n- ${problems.join("\n- ")}`);
  }
  return candidate;
})();

export const PLATFORMS: readonly Platform[] = PLATFORMS_DOC.platforms;
export const PLATFORMS_VERSION = `${PLATFORMS_DOC.slug}@${PLATFORMS_DOC.version}`;

/** A platform by its id, or null — never a guess. */
export function platformById(id: string): Platform | null {
  return PLATFORMS.find((p) => p.id === id) ?? null;
}

/**
 * Whether a platform's attestation still stands, and why in words.
 *
 * Past its date the inherited answers stop counting. That is deliberately
 * the same rule the product already applies to an expired risk acceptance,
 * which reopens its finding: assurance that outlives its evidence is not
 * assurance.
 */
export function stale(
  platform: Pick<Platform, "name" | "attestation">,
  now: Date,
): { stale: boolean; because: string } {
  const { lastAttested, expires } = platform.attestation;
  if (now < new Date(`${expires}T00:00:00Z`)) {
    return {
      stale: false,
      because: `${platform.name} was attested by its owner on ${lastAttested}, and stands until ${expires}`,
    };
  }
  return {
    stale: true,
    because: `${platform.name} was last attested on ${lastAttested} and its attestation lapsed on ${expires}, so what it provides no longer counts`,
  };
}

/** What a set of chosen platforms provides, and what each one is worth. */
export function providedBy(
  platformIds: string[],
  now: Date,
): Array<{ objective: string; name: string; platform: string; platformName: string; owner: string; attestedOn: string; stale: boolean }> {
  const out: Array<ReturnType<typeof providedBy>[number]> = [];
  const seen = new Set<string>();
  for (const id of platformIds) {
    const platform = platformById(id);
    if (!platform) continue;
    const age = stale(platform, now);
    for (const objective of platform.provides) {
      // The first platform that provides a control carries it; a second
      // saying the same adds nothing a person needs to read.
      if (seen.has(objective)) continue;
      seen.add(objective);
      out.push({
        objective,
        name: controlName(objective),
        platform: platform.id,
        platformName: platform.name,
        owner: platform.owner.name,
        attestedOn: platform.attestation.lastAttested,
        stale: age.stale,
      });
    }
  }
  return out;
}

/**
 * Where an activity wants to put data a platform is not cleared for.
 *
 * The cheapest strong control in the whole module: the platform already
 * states what it holds and the assessment already states what it involves,
 * so the mismatch is arithmetic rather than judgement.
 */
export function dataMismatches(
  platformIds: string[],
  wants: { classification: string; elements: string[] },
): Array<{ platform: string; platformName: string; because: string }> {
  const out: Array<{ platform: string; platformName: string; because: string }> = [];
  for (const id of platformIds) {
    const platform = platformById(id);
    if (!platform) continue;
    const allowed = platform.allowedData;
    if (wants.classification && !allowed.classifications.includes(wants.classification)) {
      out.push({
        platform: platform.id,
        platformName: platform.name,
        because: `${platform.name} is cleared for ${allowed.classifications.join(", ")}, and this activity involves ${wants.classification} data`,
      });
    }
    const unlisted = wants.elements.filter(
      (e) => e !== "None / Unknown" && !allowed.dataElements.includes(e),
    );
    if (unlisted.length > 0) {
      out.push({
        platform: platform.id,
        platformName: platform.name,
        because: `${platform.name} is not cleared to hold ${unlisted.join(" or ").toLowerCase()}`,
      });
    }
  }
  return out;
}

/** The platforms a person can choose from, with how fresh each one is. */
export function platformRoster(now: Date) {
  return PLATFORMS.map((platform) => {
    const age = stale(platform, now);
    return {
      id: platform.id,
      name: platform.name,
      purpose: platform.purpose,
      owner: platform.owner,
      provides: platform.provides.length,
      allowed: platform.allowedData,
      conditions: platform.allowedData.conditions,
      attestedOn: platform.attestation.lastAttested,
      expires: platform.attestation.expires,
      stale: age.stale,
      because: age.because,
    };
  });
}
