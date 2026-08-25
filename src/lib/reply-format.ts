/**
 * The shape of a reply, parsed from the small amount of markup the
 * assistant is allowed to write.
 *
 * **Deliberately tiny, and deliberately not a markdown library.** The
 * assistant's replies are shown to a person as trusted product copy, so the
 * renderer that draws them must not be able to produce anything but text:
 * no HTML, no links, no images, no attributes. Parsing to a small typed
 * shape and rendering that with React elements means an injection has
 * nowhere to land — there is no path from a model's output to markup.
 *
 * Four blocks and one inline mark, matching what `converse.md` permits. A
 * line that is none of them is a paragraph, so anything unexpected degrades
 * to plain text rather than disappearing.
 *
 * Pure: no framework, no driver, no environment (§26.1).
 */
export type Span = { text: string; strong: boolean };

export type Block =
  | { kind: "heading"; spans: Span[] }
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "quote"; spans: Span[] }
  | { kind: "bullets"; items: Span[][] };

/** Split on **bold**, keeping everything else as it was written. */
export function spansOf(line: string): Span[] {
  const spans: Span[] = [];
  // Non-greedy, and requires content, so "** **" and a stray "**" stay text.
  for (const part of line.split(/(\*\*[^*]+?\*\*)/g)) {
    if (part === "") continue;
    const strong = part.startsWith("**") && part.endsWith("**");
    spans.push({ text: strong ? part.slice(2, -2) : part, strong });
  }
  return spans;
}

export function blocksOf(reply: string): Block[] {
  const blocks: Block[] = [];
  let bullets: Span[][] = [];
  const flush = () => {
    if (bullets.length > 0) {
      blocks.push({ kind: "bullets", items: bullets });
      bullets = [];
    }
  };

  for (const raw of reply.split("\n")) {
    const line = raw.trim();
    if (line === "") {
      flush();
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(spansOf(bullet[1]!));
      continue;
    }
    flush();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", spans: spansOf(heading[1]!) });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      // Consecutive quote lines are one quotation, not several.
      const last = blocks[blocks.length - 1];
      if (last?.kind === "quote") {
        last.spans.push({ text: " ", strong: false }, ...spansOf(quote[1]!));
      } else {
        blocks.push({ kind: "quote", spans: spansOf(quote[1]!) });
      }
      continue;
    }
    blocks.push({ kind: "paragraph", spans: spansOf(line) });
  }
  flush();
  return blocks;
}
