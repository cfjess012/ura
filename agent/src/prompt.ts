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
import type { ReportTask } from "./report.ts";
import type { ScoreTask } from "./score-intake.ts";
import type { RewriteTask } from "./rewrite-intake.ts";

const here = dirname(fileURLToPath(import.meta.url));
const CORE = readFileSync(join(here, "..", "prompts", "core.md"), "utf8");
const CONVERSE = readFileSync(
  join(here, "..", "prompts", "converse.md"),
  "utf8",
);
const REPORT = readFileSync(join(here, "..", "prompts", "report.md"), "utf8");
const SCORE = readFileSync(
  join(here, "..", "prompts", "score-intake.md"),
  "utf8",
);
const REWRITE = readFileSync(
  join(here, "..", "prompts", "rewrite-intake.md"),
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
    .update(REPORT)
    .update(SCORE)
    .update(REWRITE)
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

  // What they are looking at goes FIRST, before the record. Asked "what
  // does this mean?" with only the assessment for context, the reply is
  // about the assessment in general — which is not an answer to the
  // question they asked.
  const looking = task.assessment.looking;
  const onScreen = looking
    ? [
        "## What they are looking at right now",
        `They are on ${looking.screen}.`,
        looking.questions.length > 0
          ? `The questions in front of them are:\n${looking.questions.map((q) => `- ${q}`).join("\n")}`
          : "There are no questions on this screen.",
        "**If they say “this”, “here” or “where do I start”, they mean this screen.** Answer about what is in front of them before anything else.",
      ].join("\n\n")
    : "";

  return [
    CONVERSE,
    "---",
    onScreen,
    "## What they have told us so far",
    task.context.trim() === "" ? "(nothing yet)" : task.context,
    "",
    "## Questions still open elsewhere in the assessment",
    task.openQuestions.length === 0
      ? "(none — everything has been answered)"
      : task.openQuestions.map((q) => `- ${q}`).join("\n"),
    "",
    "## The conversation",
    history === "" ? "(this is the first thing they have said)" : history,
    "",
    "## What they just said",
    task.said,
  ]
    .filter((part) => part !== "")
    .join("\n\n");
}

export function composeReportPrompt(task: ReportTask): string {
  return [
    REPORT,
    "---",
    "## The activity",
    task.assessment.activity,
    "",
    "## The record",
    task.record,
  ].join("\n\n");
}

export function composeScorePrompt(task: ScoreTask): string {
  const dimensions = task.dimensions
    .map(
      (d) =>
        `### ${d.id} — ${d.label}\n\n0: ${d.anchors["0"]}\n1: ${d.anchors["1"]}\n2: ${d.anchors["2"]}`,
    )
    .join("\n\n");
  return [
    SCORE,
    "---",
    "## The dimensions",
    dimensions,
    "",
    "## The description",
    task.description,
  ].join("\n\n");
}

export function composeRewritePrompt(task: RewriteTask): string {
  const shortfalls = task.shortfalls
    .map(
      (s) => `- **${s.label}** — ${s.ask}\n  Full marks would be: ${s.anchor}`,
    )
    .join("\n");
  return [
    REWRITE,
    "---",
    `## The field: ${task.label}`,
    "",
    "## What they wrote",
    task.original,
    "",
    "## What it fell short on",
    shortfalls === ""
      ? "(nothing specific — tighten it without adding)"
      : shortfalls,
  ].join("\n\n");
}
