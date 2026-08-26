/**
 * The register the chrome reads before it takes somebody off a screen.
 *
 * It exists because two ways out of the intake live outside the form that
 * owns the answers — the app bar's "Switch user", and the browser's own
 * close — and both used to discard everything typed since the last write
 * without a word.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { holdUnsaved, unsavedWork } from "@/lib/unsaved-work";

const work = (what: string) => ({
  what,
  save: async () => ({ ok: true }) as const,
});

describe("unsaved work", () => {
  beforeEach(() => holdUnsaved(null));

  it("reads as nothing at rest, so a quiet screen is never guarded", () => {
    expect(unsavedWork()).toBeNull();
  });

  it("hands back what would be lost, in the screen's own words", () => {
    holdUnsaved(work("the Description section"));
    expect(unsavedWork()?.what).toBe("the Description section");
  });

  it("lets go, so a saved screen stops asking", () => {
    holdUnsaved(work("the Ownership section"));
    holdUnsaved(null);
    expect(unsavedWork()).toBeNull();
  });

  it("holds one screen at a time — the newest wins", () => {
    // Screens replace each other; they do not stack. A register that
    // accumulated would keep warning about a section already left behind.
    holdUnsaved(work("the Description section"));
    holdUnsaved(work("the Categorization section"));
    expect(unsavedWork()?.what).toBe("the Categorization section");
  });

  it("runs where there is no window at all", () => {
    // Rendered on the server before it is ever held on the client. Reaching
    // for `window` unguarded here would fail the render, not the warning.
    expect(() => holdUnsaved(work("the Ownership section"))).not.toThrow();
  });
});
