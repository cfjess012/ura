/**
 * Turning a file into text (FR-40).
 *
 * **The best channel in the product was gated behind .md and .txt, and
 * vendor paperwork is PDF or Word.** Somebody with a supplier's security
 * overview in a PDF had to open it, select all, and paste — which is the
 * kind of small friction that quietly means nobody uses the feature.
 *
 * One function, one place: a file becomes text, or a sentence saying why it
 * could not. **It never throws to the caller.** A document we cannot read
 * is a thing to explain, not a stack trace — and an unreadable file must
 * never arrive as empty source text, because the drafting engine would
 * abstain on every question and report that as the document saying nothing.
 *
 * Salvaged from the prior platform along with what it learned the hard way:
 * the page markers, the scanned-PDF case, and the bundler note now in
 * `next.config.ts`.
 */
export type Extracted = { ok: true; text: string } | { ok: false; why: string };

export async function extractText(
  name: string,
  type: string,
  bytes: ArrayBuffer,
): Promise<Extracted> {
  const lower = name.toLowerCase();
  try {
    if (lower.endsWith(".pdf") || type === "application/pdf") {
      // Loaded lazily: module evaluation is expensive and fragile, and is
      // only worth paying for when a file is actually being read.
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(bytes) });
      const parsed = await parser.getText();
      await parser.destroy();
      // pdf-parse injects "-- N of M" page markers. They are not the
      // document's words, so they must never become quotable source text —
      // a quote gate would pass a sentence nobody wrote.
      const text = parsed.text
        .replace(/^-- \d+ of \d+ ?$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (text === "") {
        return {
          ok: false,
          why: `“${name}” looks like a scan — there is no text in it I can read. Paste the part that matters, or attach a text-based export.`,
        };
      }
      return { ok: true, text };
    }

    if (
      lower.endsWith(".docx") ||
      type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const { default: mammoth } = await import("mammoth");
      const result = await mammoth.extractRawText({
        buffer: Buffer.from(bytes),
      });
      const text = result.value.trim();
      if (text === "") {
        return { ok: false, why: `“${name}” had no readable text in it.` };
      }
      return { ok: true, text };
    }

    if (lower.endsWith(".doc")) {
      return {
        ok: false,
        why: `“${name}” is the old Word format. Save it as .docx or PDF and try again.`,
      };
    }

    const text = new TextDecoder().decode(bytes).trim();
    if (text === "") return { ok: false, why: `“${name}” is empty.` };
    return { ok: true, text };
  } catch (cause) {
    console.error("[extractText]", cause);
    return {
      ok: false,
      why: `I couldn't read “${name}”. Paste the part that matters instead.`,
    };
  }
}
