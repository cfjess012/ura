/**
 * The shape of a reply.
 *
 * The reason this is a parser and not a markdown library: the renderer that
 * draws a model's words must not be able to produce anything but text. No
 * HTML, no links, no attributes — parse to a typed shape, render that with
 * React elements, and an injection has nowhere to land.
 */
import { describe, expect, it } from "vitest";
import { blocksOf, spansOf } from "@/lib/reply-format";

describe("what a reply is made of", () => {
  it("reads the shape the assistant is asked to write", () => {
    const blocks = blocksOf(
      [
        "### What this is asking",
        "",
        "Is any outside organisation involved?",
        "",
        "- Do you buy it from a vendor?",
        "- Is it hosted elsewhere?",
        "",
        "> Any organisation outside our own legal entity.",
      ].join("\n"),
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      "heading",
      "paragraph",
      "bullets",
      "quote",
    ]);
    const bullets = blocks[2];
    expect(bullets.kind === "bullets" && bullets.items).toHaveLength(2);
  });

  it("joins consecutive quote lines into one quotation", () => {
    // A wrapped clause is one thing said, not three.
    const blocks = blocksOf("> one\n> two\n> three");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("quote");
  });

  it("treats anything it does not recognise as a paragraph", () => {
    // Degrading to plain text is the safe direction: unexpected markup
    // shows up as words rather than vanishing.
    const blocks = blocksOf("| a | table |\n1. numbered\n<b>html</b>");
    expect(blocks.every((b) => b.kind === "paragraph")).toBe(true);
    const first = blocks[0];
    expect(first.kind === "paragraph" && first.spans[0]!.text).toContain("|");
  });

  it("never yields markup, only text and a strong flag", () => {
    const spans = spansOf("plain **bold** <script>alert(1)</script>");
    expect(spans.map((s) => s.strong)).toEqual([false, true, false]);
    // The tag is text. There is no path from here to an element.
    expect(spans[2]!.text).toContain("<script>");
  });

  it("leaves a stray asterisk alone", () => {
    expect(spansOf("2 ** 3 is not bold")).toEqual([
      { text: "2 ** 3 is not bold", strong: false },
    ]);
  });

  it("handles a reply with no markup at all", () => {
    const blocks = blocksOf("Just a sentence.");
    expect(blocks).toEqual([
      {
        kind: "paragraph",
        spans: [{ text: "Just a sentence.", strong: false }],
      },
    ]);
  });

  it("survives an empty reply", () => {
    expect(blocksOf("")).toEqual([]);
  });
});
