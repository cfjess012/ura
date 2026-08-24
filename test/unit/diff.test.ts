/** Word-level diff (G-63). Pure, so it can be exercised exhaustively. */
import { describe, expect, it } from "vitest";
import { diffWords, isUnchanged } from "@/lib/diff";

const render = (ops: ReturnType<typeof diffWords>) =>
  ops.map((op) =>
    op.type === "same"
      ? op.text
      : `${op.type === "added" ? "+" : "-"}${op.text}`,
  );

describe("what changed between two sentences", () => {
  it("reports nothing when nothing changed", () => {
    const ops = diffWords("MFA is enforced", "MFA is enforced");
    expect(isUnchanged(ops)).toBe(true);
    expect(render(ops)).toEqual(["MFA", "is", "enforced"]);
  });

  it("marks a replaced word on both sides, so the reader sees the swap", () => {
    expect(render(diffWords("MFA is enforced", "MFA is planned"))).toEqual([
      "MFA",
      "is",
      "-enforced",
      "+planned",
    ]);
  });

  it("marks an insertion without disturbing what stayed", () => {
    expect(
      render(diffWords("access is reviewed", "access is reviewed quarterly")),
    ).toEqual(["access", "is", "reviewed", "+quarterly"]);
  });

  it("marks a deletion", () => {
    expect(render(diffWords("reviewed every quarter", "reviewed"))).toEqual([
      "reviewed",
      "-every",
      "-quarter",
    ]);
  });

  it("handles a complete rewrite", () => {
    const ops = diffWords(
      "no process exists",
      "documented and tested annually",
    );
    expect(isUnchanged(ops)).toBe(false);
    expect(ops.filter((o) => o.type === "removed")).toHaveLength(3);
    expect(ops.filter((o) => o.type === "added")).toHaveLength(4);
  });

  it("survives empty text on either side", () => {
    expect(render(diffWords("", "now answered"))).toEqual([
      "+now",
      "+answered",
    ]);
    expect(render(diffWords("was answered", ""))).toEqual([
      "-was",
      "-answered",
    ]);
    expect(isUnchanged(diffWords("", ""))).toBe(true);
  });

  it("treats runs of whitespace as one break, the way a reader does", () => {
    expect(
      isUnchanged(diffWords("MFA   is\nenforced", "MFA is enforced")),
    ).toBe(true);
  });
});
