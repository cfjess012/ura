"use client";

/**
 * Text with its gaps painted.
 *
 * One component, because the same bracketed question has to look the same
 * everywhere it appears — in a suggested rewrite, in a description drawn
 * from a document, and in the field it finally lands in. Somebody who saw
 * five yellow patches in a suggestion should find five yellow patches to
 * fill, and two components drifting apart is how that stops being true.
 */
import * as React from "react";
import { bracketSpans } from "@/lib/pending-rewrite";

export function Marked({ text }: { text: string }) {
  const spans = bracketSpans(text);
  if (spans.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [n, span] of spans.entries()) {
    if (span.from > at) parts.push(text.slice(at, span.from));
    parts.push(
      <mark className="gap-shown" key={n}>
        {text.slice(span.from, span.to)}
      </mark>,
    );
    at = span.to;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}
