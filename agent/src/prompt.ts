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
import type { DescribeTask } from "./describe-intake.ts";

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
const DESCRIBE = readFileSync(
  join(here, "..", "prompts", "describe-intake.md"),
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
    .update(DESCRIBE)
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

  // The standard their writing is measured against, where it applies.
  // Without it the assistant called a one-line description a solid start
  // and the check then graded it Thin — two of our own voices disagreeing
  // in front of the person, from a rubric neither had shown them.
  const graded = task.assessment.graded ?? [];
  const rubric =
    graded.length === 0
      ? ""
      : [
          "## What their description is graded against",
          "This intake is scored on these, and full marks on each looks like this:",
          graded.map((g) => `- **${g.criterion}** — ${g.fullMarks}`).join("\n"),
          "Judge what they have written against it before you call it good. Naming the one thing that would move it up is worth more than encouragement.",
        ].join("\n\n");

  // What our own standards say about the words they used. Verbatim, with
  // the reference and version, because a citation is only worth something
  // if the words are the policy's own (§22.5).
  const clauses = task.assessment.authority ?? [];
  const authority =
    clauses.length === 0
      ? ""
      : [
          "## What our own policies say",
          "**These were found because of the words they just used, and one of them probably answers their question.** They are clauses from this organisation's own standards. Quote word for word or not at all, and always name the reference and version.",
          clauses
            .map(
              (c) =>
                `### ${c.heading}\n> ${c.text}\n— ${c.policy}, ${c.clauseId}, version ${c.version}`,
            )
            .join("\n\n"),
          '**A policy says what a term means and what is required. It never says anything about THEIR project.** Give them the definition and then ASK whether it fits — do not tell them that it does. "Your two partners would fall under that" is a conclusion about their activity dressed in our standard\'s authority; "does that describe your partners?" is the same help without the overreach, and they are the only one who can answer it.',
          "Do not treat a question as off-topic when a clause above answers it. Somebody asking how to get a tool, or what a word means, is asking something our standards cover — answer from the clause first, then bring them back to the screen.",
        ].join("\n\n");

  const standing = task.assessment.standing
    ? `## Where this assessment stands\n\n${task.assessment.standing}`
    : "";

  return [
    CONVERSE,
    "---",
    onScreen,
    standing,
    authority,
    rubric,
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
    .map((d) =>
      // All four levels, because a grader shown only the bottom two
      // cannot place anything above them. This rendered "0: undefined"
      // and hid levels 3 and 4 for as long as the rubric has had four.
      [
        `### ${d.id} — ${d.label}`,
        "",
        `1: ${d.anchors["1"]}`,
        `2: ${d.anchors["2"]}`,
        `3: ${d.anchors["3"]}`,
        `4: ${d.anchors["4"]}`,
      ].join("\n"),
    )
    .join("\n\n");
  // The fields a correction may name, with the exact options each accepts.
  // Without these the prompt asks for a fix against a form it has not seen,
  // and the model correctly declines every time.
  const fields = (task.fields ?? [])
    .map(
      (f) =>
        `- \`${f.id}\` — ${f.label}\n  options: ${f.options.map((o) => `"${o}"`).join(", ")}`,
    )
    .join("\n");
  return [
    SCORE,
    "---",
    "## The dimensions",
    dimensions,
    "",
    "## The fields a correction may set",
    fields === "" ? "(none — do not propose any fix)" : fields,
    "",
    "## The description",
    task.description,
  ].join("\n\n");
}

export function composeRewritePrompt(task: RewriteTask): string {
  const shortfalls = task.shortfalls
    .map(
      (s, at) =>
        `${at + 1}. **${s.label}** — ${s.ask}\n   Full marks would be: ${s.anchor}`,
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

export function composeDescribePrompt(task: DescribeTask): string {
  return [
    DESCRIBE,
    "---",
    `## The field: ${task.label}`,
    "",
    "## What they have written so far",
    task.existing.trim() === ""
      ? "(nothing yet — this is a blank field)"
      : task.existing,
    "",
    "## The fields a proposal may set",
    (task.fields ?? []).length === 0
      ? "(none — propose no fields)"
      : (task.fields ?? [])
          .map(
            (f) =>
              `- \`${f.id}\` — ${f.label}\n  options: ${f.options.map((o) => `"${o}"`).join(", ")}`,
          )
          .join("\n"),
    "",
    `## The document they gave us: ${task.documentName}`,
    task.document,
  ].join("\n\n");
}
