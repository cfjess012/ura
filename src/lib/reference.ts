/**
 * Reference lists — the names a picker offers (FR-29, NFR-22, G-46).
 *
 * Versioned data, exactly like the instrument, and for the same reason:
 * correcting an entry's wording must not rewrite what somebody already
 * answered. So an answer records three things — the entry id, the **label
 * as it appeared on screen**, and the list version — and the label is
 * stored redundantly on purpose, because a reviewer six months later has
 * to read what the person saw rather than what the list says now.
 *
 * Pure: no framework, no driver, no environment (§26.1).
 */
import businessUnits from "@/data/reference/business-units.json";
import vendors from "@/data/reference/vendors.json";

export type ReferenceEntry = { id: string; label: string };

export type ReferenceList = {
  slug: string;
  version: string;
  label: string;
  note: string;
  /** Whether a person may answer with something the list does not hold. */
  allowsUnlisted: boolean;
  entries: ReferenceEntry[];
};

/**
 * A value that is not on the list (FR-30, G-47).
 *
 * Its own shape, never a bare string, so the submission validators keep
 * refusing unknown ids exactly as they do today. Storing the typed text
 * where an option id belongs would disarm that guard silently: nothing
 * could then tell a real option from something somebody typed once —
 * not the validator, not a reviewer, not a count of who chose what.
 */
export type Unlisted = { unlisted: string };

/** One answer to a reference-backed question: an entry, or something else. */
export type ReferenceAnswer =
  { id: string; label: string; version: string } | Unlisted;

export function isUnlisted(value: unknown): value is Unlisted {
  return (
    typeof value === "object" &&
    value !== null &&
    "unlisted" in value &&
    typeof (value as Unlisted).unlisted === "string"
  );
}

function validate(list: ReferenceList): ReferenceList {
  const problems: string[] = [];
  if (!list.slug?.trim()) problems.push("a list has no slug");
  if (!list.version?.trim()) problems.push(`${list.slug}: no version`);
  // A list nobody can read the provenance of is a hardcoded array with extra
  // steps. The note says where the real one comes from.
  if (!list.note?.trim())
    problems.push(
      `${list.slug}: no note saying where the real list comes from`,
    );
  const seen = new Set<string>();
  for (const entry of list.entries ?? []) {
    if (!entry.id?.trim()) problems.push(`${list.slug}: an entry has no id`);
    if (!entry.label?.trim())
      problems.push(`${list.slug}: ${entry.id} has no label`);
    if (seen.has(entry.id))
      problems.push(`${list.slug}: duplicate entry ${entry.id}`);
    seen.add(entry.id);
  }
  if (list.entries?.length === 0) problems.push(`${list.slug}: offers nothing`);
  if (problems.length > 0)
    throw new Error(`Reference list is invalid:\n- ${problems.join("\n- ")}`);
  return list;
}

export const REFERENCE_LISTS: Record<string, ReferenceList> =
  Object.fromEntries(
    [businessUnits as ReferenceList, vendors as ReferenceList]
      .map(validate)
      .map((list) => [list.slug, list]),
  );

export const listBySlug = (slug: string): ReferenceList | undefined =>
  REFERENCE_LISTS[slug];

/** Entries in display order — alphabetical by what a person reads. */
export function entriesOf(slug: string): ReferenceEntry[] {
  return [...(listBySlug(slug)?.entries ?? [])].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

/**
 * What to show for a stored answer.
 *
 * The stored label wins over the current list. That is the whole point of
 * storing it: if the entry was renamed, the screen still shows what the
 * person chose, and the record does not quietly change its mind.
 */
export function labelOf(answer: ReferenceAnswer): string {
  return isUnlisted(answer) ? answer.unlisted : answer.label;
}

/** Turn a chosen entry id into the answer that gets stored (NFR-22). */
export function answerFor(
  slug: string,
  entryId: string,
): ReferenceAnswer | null {
  const list = listBySlug(slug);
  const entry = list?.entries.find((e) => e.id === entryId);
  if (!list || !entry) return null;
  return { id: entry.id, label: entry.label, version: list.version };
}

/** What is wrong with a submitted reference answer, if anything. */
export function referenceProblems(slug: string, value: unknown): string[] {
  const list = listBySlug(slug);
  if (!list) return [`${slug}: no such reference list`];
  if (isUnlisted(value)) {
    if (!list.allowsUnlisted)
      return [`${slug}: does not accept an off-list value`];
    return value.unlisted.trim().length > 0
      ? []
      : [`${slug}: an off-list value needs the name written out`];
  }
  if (typeof value !== "object" || value === null)
    return [`${slug}: not a reference answer`];
  const answer = value as { id?: unknown; label?: unknown; version?: unknown };
  if (typeof answer.id !== "string" || typeof answer.label !== "string")
    return [
      `${slug}: a reference answer carries both the entry and the label shown`,
    ];
  if (!list.entries.some((e) => e.id === answer.id))
    return [`${slug}: "${answer.id}" is not on this list`];
  // The version is not checked against the current one on purpose: an answer
  // given under an older list stays valid, and re-validating it against
  // today's list is exactly the silent rewrite NFR-22 exists to stop.
  if (typeof answer.version !== "string" || answer.version.trim() === "")
    return [
      `${slug}: a reference answer records the list version it was chosen from`,
    ];
  return [];
}
