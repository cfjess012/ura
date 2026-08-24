/**
 * Prompt composition. **Prompts exist only as files** — nothing else in this
 * service builds prompt text, so the locked core cannot drift by somebody
 * editing a string literal.
 *
 * Editing `prompts/core.md` is a governance change, not a wording tweak: it
 * is where never-guess, the basis definitions and the quoting rules live.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DraftTask } from "./draft.ts";
import type { ConverseTask } from "./converse.ts";

const here = dirname(fileURLToPath(import.meta.url));
const CORE = readFileSync(join(here, "..", "prompts", "core.md"), "utf8");
const CONVERSE = readFileSync(
  join(here, "..", "prompts", "converse.md"),
  "utf8",
);

/**
 * A short hash of the locked core, recorded on every span. If a run's
 * behaviour changes, this says whether the prompt changed with it.
 */
export function promptVersion(): string {
  return createHash("sha256")
    .update(CORE)
    .update(CONVERSE)
    .digest("hex")
    .slice(0, 12);
}

export function composePrompt(task: DraftTask): string {
  const sources = task.sources
    .map((source) => `### Source: ${source.id}\n\n${source.text}`)
    .join("\n\n");
  return [
    CORE,
    "---",
    "## The question",
    `id: ${task.questionId}`,
    task.question,
    "",
    `Answer shape: ${task.answerShape}`,
    "",
    "## The source material",
    sources === "" ? "(none was provided — you must abstain)" : sources,
  ].join("\n\n");
}

export function composeConversePrompt(task: ConverseTask): string {
  const history = task.history
    .map(
      (turn) => `${turn.speaker === "person" ? "Them" : "You"}: ${turn.said}`,
    )
    .join("\n");
  return [
    CONVERSE,
    "---",
    "## What they have told us so far",
    task.context.trim() === "" ? "(nothing yet)" : task.context,
    "",
    "## Questions still open",
    task.openQuestions.length === 0
      ? "(none — everything has been answered)"
      : task.openQuestions.map((q) => `- ${q}`).join("\n"),
    "",
    "## The conversation",
    history === "" ? "(this is the first thing they have said)" : history,
    "",
    "## What they just said",
    task.said,
  ].join("\n\n");
}
