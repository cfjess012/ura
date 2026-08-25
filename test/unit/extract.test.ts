/**
 * FR-40 · turning a file into text.
 *
 * The rule that matters is not "reads a PDF" — it is that **an unreadable
 * file never arrives as empty text**. Empty source makes the drafting
 * engine abstain on every question, and the product would report that as
 * the document having said nothing, which is a lie about their paperwork.
 */
import { describe, expect, it } from "vitest";
import { extractText } from "@/lib/extract";

const bytes = (text: string) => new TextEncoder().encode(text).buffer;

describe("reading a file", () => {
  it("reads plain text and markdown", async () => {
    const read = await extractText(
      "notes.md",
      "text/markdown",
      bytes("# Hi\nthere"),
    );
    expect(read).toEqual({ ok: true, text: "# Hi\nthere" });
  });

  it("refuses an empty file rather than returning empty text", async () => {
    const read = await extractText("empty.txt", "text/plain", bytes("   "));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.why).toContain("empty");
  });

  it("names the old Word format and says what to do", async () => {
    const read = await extractText("old.doc", "", bytes("anything"));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.why).toMatch(/\.docx or PDF/);
  });

  it("never throws, whatever it is handed", async () => {
    // A .pdf extension over bytes that are not a PDF.
    const read = await extractText(
      "broken.pdf",
      "application/pdf",
      bytes("not a pdf"),
    );
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.why.length).toBeGreaterThan(0);
  });

  it("puts the file's name in every failure, so it is actionable", async () => {
    for (const [name, type, body] of [
      ["empty.txt", "text/plain", "  "],
      ["old.doc", "", "x"],
      ["broken.pdf", "application/pdf", "x"],
    ] as const) {
      const read = await extractText(name, type, bytes(body));
      expect(read.ok).toBe(false);
      if (!read.ok) expect(read.why).toContain(name);
    }
  });
});
