/**
 * Error handling (SPEC §25). Two rules do most of the work:
 *
 * 1. **Expected failures are values, not exceptions.** Server actions return
 *    a typed result the caller must handle, so a failure cannot be silently
 *    swallowed by a missing catch.
 * 2. **The user gets a sentence; the log gets the truth.** Internal detail —
 *    driver messages, SQL, stack traces — never reaches a screen. Each
 *    failure is logged with a short reference the person can quote, so a
 *    support conversation starts with a fact instead of a re-enactment.
 */

export type Failure = {
  ok: false;
  /** Plain sentence: what happened, whether their work is safe, what to do. */
  message: string;
  /** Short id printed to the user and written to the server log. */
  ref: string;
  /** Whether retrying the same action is worth attempting. */
  retryable: boolean;
};

export type Result<T> = ({ ok: true } & T) | Failure;

/** Short, unambiguous, easy to read aloud on a phone call. */
export function errorRef(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/**
 * Log the real error server-side; return the sanitised failure. `where` is a
 * stable label (e.g. "saveIntake") so logs can be grepped by operation.
 */
export function failure(
  where: string,
  error: unknown,
  message: string,
  options: { retryable?: boolean } = {},
): Failure {
  const ref = errorRef();
  const detail =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  // Server-side only: the console is the operator's, never the requester's.
  console.error(`[${where}] ref=${ref}`, detail);
  return { ok: false, message, ref, retryable: options.retryable ?? true };
}

/** True when a result is a failure — the type guard callers branch on. */
export function isFailure<T>(result: Result<T>): result is Failure {
  return result.ok === false;
}
