/**
 * SPEC §25 — error handling. The rule under test: the user gets a sentence,
 * the log gets the truth, and nothing internal ever crosses that line.
 */
import { describe, expect, it, vi } from "vitest";
import { errorRef, failure, isFailure } from "../../src/lib/errors";

describe("failure()", () => {
  it("never leaks internal detail into the user-facing message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const internal = new Error('duplicate key value violates unique constraint "projects_pkey"');
    const result = failure("saveIntake", internal, "Couldn't save — try again.");
    expect(result.message).toBe("Couldn't save — try again.");
    expect(JSON.stringify(result)).not.toContain("constraint");
    expect(JSON.stringify(result)).not.toContain("projects_pkey");
    // …but the operator's log has the real thing, tied to the same ref.
    const logged = spy.mock.calls[0]!.join(" ");
    expect(logged).toContain("projects_pkey");
    expect(logged).toContain(result.ref);
    spy.mockRestore();
  });

  it("carries a quotable reference and a retry hint", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const retryable = failure("x", new Error("boom"), "msg");
    const permanent = failure("x", new Error("gone"), "msg", { retryable: false });
    expect(retryable.ref).toMatch(/^[A-Z0-9]{6}$/);
    expect(retryable.retryable).toBe(true);
    expect(permanent.retryable).toBe(false);
    spy.mockRestore();
  });

  it("isFailure narrows so a caller cannot ignore the failure branch", () => {
    const ok = { ok: true as const, savedAt: "now" };
    expect(isFailure(ok)).toBe(false);
    expect(errorRef()).not.toBe(errorRef());
  });
});
