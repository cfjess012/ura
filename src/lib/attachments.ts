/**
 * What may be attached to an assessment, and what it is called on screen
 * (FR-34). Pure: no framework, no driver, no environment (§26.1).
 *
 * Where the bytes are kept is not decided here and is not visible from
 * here. Postgres holds them for the pilot and S3 holds them after the
 * migration; only the store implementation changes.
 */

/** The largest single file. Big enough for a scanned PIA, small enough
 *  that a mis-drop does not become an incident. */
export const MAX_BYTES = 10 * 1024 * 1024;

/**
 * What a prior assessment actually arrives as. Deliberately short: an
 * assessment is not a file share, and every extra type is a parser
 * somebody has to trust.
 */
export const ACCEPTED: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "Word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.ms-excel": "Excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "text/plain": "Text",
  "image/png": "Image",
  "image/jpeg": "Image",
};

export type Attachment = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string | null;
  createdAt: Date;
  removedAt: Date | null;
};

/** What is wrong with a proposed upload, said the way a person would say it. */
export function uploadProblem(
  file: { name: string; type: string; size: number },
): string | null {
  if (file.size === 0) return `${file.name} is empty, so there was nothing to attach.`;
  if (file.size > MAX_BYTES)
    return `${file.name} is ${humanSize(file.size)}, and the limit is ${humanSize(MAX_BYTES)}.`;
  if (!ACCEPTED[file.type])
    return `${file.name} isn't a kind of file we can take. PDF, Word, Excel, text and images are fine.`;
  return null;
}

/** A size a person reads, not a byte count. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** What kind of file this is, in a word. */
export function kindOf(contentType: string): string {
  return ACCEPTED[contentType] ?? "File";
}

/** The ones still attached — a withdrawn file stays on the record. */
export function attached(all: Attachment[]): Attachment[] {
  return all.filter((a) => a.removedAt === null);
}
