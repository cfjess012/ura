/**
 * Where each platform stands, and what would break if it lapsed (G-83).
 *
 * The plan called this the blast radius and said to build it early rather
 * than late, for a reason that survives contact: quarterly attestation with
 * nobody able to see what depends on them is a calendar reminder, not a
 * control. An owner about to let an attestation run out needs to know that
 * two hundred assessments are leaning on it, and the risk team needs to know
 * which ones just became unsupported when it did.
 *
 * Pure: the caller fetches the assessments and their answers, this decides.
 * Nothing here is stored — dependence is a fact about the answers in force,
 * recomputed on every read, the same rule as everything else derived (NFR-3).
 */
import { platformsChosen } from "./inheritance";
import {
  clearedUpTo,
  platformById,
  platformRoster,
  stale,
  type Platform,
} from "./platforms";
import { controlName } from "./severity";

/** One assessment, reduced to the only two things this needs to know. */
export type Dependent = {
  id: string;
  name: string;
  /** Null while it is still a draft — a draft can still be leaning on it. */
  submittedAt: Date | null;
};

export type PlatformStanding = {
  id: string;
  name: string;
  vendor: string;
  purpose: string;
  ownerName: string;
  ownerTitle: string;
  attestedOn: string;
  expires: string;
  stale: boolean;
  /** Why it is stale, in a sentence, or empty when it is not. */
  because: string;
  /** How many controls it says it provides, before any assessment asks. */
  provides: number;
  /** Assessments whose answers say they run on it. */
  dependents: Dependent[];
};

type Answers = Record<string, { value: unknown }>;

/**
 * What each assessment says it runs on, indexed by platform.
 *
 * An unknown platform id is dropped rather than counted: the roster is the
 * only thing that says a platform exists, and a stored id that no longer
 * matches one is a record of a choice nobody can act on.
 */
export function dependentsByPlatform(
  assessments: Array<Dependent & { answers: Answers }>,
): Map<string, Dependent[]> {
  const known = new Set(platformRoster(new Date()).map((p) => p.id));
  const out = new Map<string, Dependent[]>();
  for (const assessment of assessments) {
    for (const id of platformsChosen(assessment.answers as never)) {
      if (!known.has(id)) continue;
      const list = out.get(id) ?? [];
      list.push({
        id: assessment.id,
        name: assessment.name,
        submittedAt: assessment.submittedAt,
      });
      out.set(id, list);
    }
  }
  return out;
}

/** Every platform, how fresh it is, and what is leaning on it. */
export function platformStandings(
  assessments: Array<Dependent & { answers: Answers }>,
  now: Date,
): PlatformStanding[] {
  const depends = dependentsByPlatform(assessments);
  return platformRoster(now).map((entry) => ({
    id: entry.id,
    name: entry.name,
    vendor: platformById(entry.id)?.vendor ?? "",
    purpose: entry.purpose,
    ownerName: entry.owner.name,
    ownerTitle: entry.owner.title,
    attestedOn: entry.attestedOn,
    expires: entry.expires,
    stale: entry.stale,
    because: entry.stale ? entry.because : "",
    provides: entry.provides,
    dependents: depends.get(entry.id) ?? [],
  }));
}

/**
 * The one number the list page exists to put in front of somebody: how many
 * assessments are leaning on assurance that has already run out.
 */
export function unsupported(standings: PlatformStanding[]): {
  platforms: number;
  assessments: number;
} {
  const lapsed = standings.filter((s) => s.stale);
  const affected = new Set<string>();
  for (const platform of lapsed) {
    for (const dependent of platform.dependents) affected.add(dependent.id);
  }
  return { platforms: lapsed.length, assessments: affected.size };
}

/** The controls one platform says it provides, named rather than coded. */
export function providedControls(
  platform: Platform,
  now: Date,
): Array<{ objective: string; name: string; counts: boolean }> {
  const age = stale(platform, now);
  return platform.provides.map((objective) => ({
    objective,
    name: controlName(objective),
    // Past its date, what it provided is a claim with no evidence behind it.
    counts: !age.stale,
  }));
}

/** What a platform's own record says it may hold, as sentences. */
export function clearance(platform: Platform): string[] {
  const lines: string[] = [];
  const { classifications, dataElements, conditions } = platform.allowedData;
  lines.push(
    classifications.length > 0
      ? `Cleared up to ${clearedUpTo(platform)}.`
      : "Not cleared for any classification of data.",
  );
  lines.push(
    dataElements.length > 0
      ? `May hold ${dataElements.join(", ").toLowerCase()}.`
      : "May hold no categorised data.",
  );
  for (const condition of conditions) lines.push(condition);
  return lines;
}

/** Sorted so what needs attention is what a person meets first. */
export function attentionFirst(standings: PlatformStanding[]): PlatformStanding[] {
  return [...standings].sort((a, b) => {
    if (a.stale !== b.stale) return a.stale ? -1 : 1;
    if (a.dependents.length !== b.dependents.length)
      return b.dependents.length - a.dependents.length;
    return a.name.localeCompare(b.name);
  });
}
