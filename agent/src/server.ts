/**
 * The agent service. One route, one job.
 *
 * `POST /run` takes an AgentRequest and streams NDJSON events back, one per
 * line, as each question is decided. The web app reaches this through
 * `src/lib/agent.ts` and nothing else (SPEC §6.1).
 *
 * `GET /healthz` answers without touching a model — the same separation the
 * web service learned: a health check that depends on the thing most likely
 * to be misconfigured reports "broken" when it means "not connected yet".
 */
import { createServer } from "node:http";
import {
  AGENT_CONTRACT_VERSION,
  type AgentEvent,
  type AssessmentContext,
} from "../../src/lib/agent-contract.ts";
import { converse, type ConverseTask } from "./converse.ts";
import { draftOne, type DraftTask } from "./draft.ts";
import { writeReport } from "./report.ts";
import { scoreIntake, type ScoreTask } from "./score-intake.ts";
import { rewriteIntake, type RewriteTask } from "./rewrite-intake.ts";
import { describeIntake, type DescribeTask } from "./describe-intake.ts";
import { modelId, providerDescription } from "./model.ts";
import { promptVersion } from "./prompt.ts";
import { startTelemetry } from "./telemetry.ts";

startTelemetry();

const PORT = Number(process.env.PORT ?? 8787);

/**
 * What the agent is willing to draft, and from what.
 *
 * Deliberately supplied by the caller rather than read from the database:
 * this service has no database and must not grow one. It knows how to judge
 * a quote against a source; it does not know what an assessment is.
 */
type RunBody = {
  task?: string;
  questionIds?: string[];
  questions?: DraftTask[];
};

function line(event: AgentEvent): string {
  return `${JSON.stringify(event)}\n`;
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "ura-agent",
        contract: AGENT_CONTRACT_VERSION,
        model: modelId(),
        provider: providerDescription(),
        prompt: promptVersion(),
      }),
    );
    return;
  }

  if (req.method === "POST" && req.url === "/describe-intake") {
    const body: Buffer[] = [];
    for await (const chunk of req) body.push(chunk as Buffer);
    let task: Partial<DescribeTask>;
    try {
      task = JSON.parse(Buffer.concat(body).toString("utf8"));
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "the request was not valid JSON" }));
      return;
    }
    const drafted = await describeIntake({
      label: task.label ?? "",
      existing: task.existing ?? "",
      document: task.document ?? "",
      documentName: task.documentName ?? "the document",
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(drafted));
    return;
  }

  if (req.method === "POST" && req.url === "/rewrite-intake") {
    const body: Buffer[] = [];
    for await (const chunk of req) body.push(chunk as Buffer);
    let task: RewriteTask;
    try {
      task = JSON.parse(Buffer.concat(body).toString("utf8"));
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "the request was not valid JSON" }));
      return;
    }
    const suggestion = await rewriteIntake({
      label: task.label ?? "",
      original: task.original ?? "",
      shortfalls: task.shortfalls ?? [],
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(suggestion));
    return;
  }

  if (req.method === "POST" && req.url === "/score-intake") {
    const body: Buffer[] = [];
    for await (const chunk of req) body.push(chunk as Buffer);
    let task: {
      description?: string;
      fields?: ScoreTask["fields"];
      dimensions?: ScoreTask["dimensions"];
    };
    try {
      task = JSON.parse(Buffer.concat(body).toString("utf8"));
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "the request was not valid JSON" }));
      return;
    }
    const scoring = await scoreIntake({
      description: task.description ?? "",
      // Without these a proposed correction has nothing to be checked
      // against, so every fix is dropped and the feature is silently absent.
      fields: task.fields ?? [],
      dimensions: task.dimensions ?? [],
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(scoring));
    return;
  }

  if (req.method === "POST" && req.url === "/report") {
    const body: Buffer[] = [];
    for await (const chunk of req) body.push(chunk as Buffer);
    let task: { assessment?: AssessmentContext; record?: string };
    try {
      task = JSON.parse(Buffer.concat(body).toString("utf8"));
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "the request was not valid JSON" }));
      return;
    }
    if (!task.assessment || typeof task.assessment.projectId !== "string") {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error:
            "no assessment record was supplied, so nothing written could be checked against it",
        }),
      );
      return;
    }
    const writing = await writeReport({
      assessment: task.assessment,
      record: task.record ?? "",
    });
    res.writeHead(200, { "content-type": "application/json" });
    // null is a real answer: the report is complete without a summary.
    res.end(JSON.stringify(writing));
    return;
  }

  if (req.method === "POST" && req.url === "/converse") {
    const said: Buffer[] = [];
    for await (const chunk of req) said.push(chunk as Buffer);
    let task: ConverseTask;
    try {
      task = JSON.parse(Buffer.concat(said).toString("utf8"));
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "the request was not valid JSON" }));
      return;
    }
    if (!task.assessment || typeof task.assessment.projectId !== "string") {
      // Refused rather than defaulted: without the record there is nothing
      // to check the reply against, and an unguarded reply is the one thing
      // this service must not produce.
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error:
            "no assessment record was supplied, so nothing said back could be checked against it",
        }),
      );
      return;
    }
    const reply = await converse({
      said: task.said ?? "",
      assessment: task.assessment,
      history: task.history ?? [],
      openQuestions: task.openQuestions ?? [],
      context: task.context ?? "",
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(reply));
    return;
  }

  if (req.method !== "POST" || req.url !== "/run") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);

  res.writeHead(200, {
    "content-type": "application/x-ndjson",
    "cache-control": "no-store",
  });

  let body: RunBody;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    res.write(
      line({
        type: "error",
        message: "The request was not valid JSON.",
        retryable: false,
      }),
    );
    res.end(line({ type: "done" }));
    return;
  }

  const questions = body.questions ?? [];
  // Same rule as the conversation: without the record there is nothing to
  // check what is said against, and an unchecked draft is the one thing
  // this service must not produce.
  const ungrounded = questions.find(
    (question) =>
      !question.assessment || typeof question.assessment.projectId !== "string",
  );
  if (ungrounded) {
    res.write(
      line({
        type: "error",
        message:
          "No assessment record was supplied, so nothing drafted could be checked against it.",
        retryable: false,
      }),
    );
    res.end(line({ type: "done" }));
    return;
  }
  if (questions.length === 0) {
    res.write(
      line({
        type: "error",
        message: "Nothing was asked for, so nothing was drafted.",
        retryable: false,
      }),
    );
    res.end(line({ type: "done" }));
    return;
  }

  const recorded: string[] = [];
  const notRecorded: string[] = [];
  for (const question of questions) {
    // Sequential on purpose: each question is one model call, and a person
    // watching wants them to land one at a time rather than all at once
    // after a long silence.
    const event = await draftOne(question);
    res.write(line(event));
    if (event.type === "draft" && event.answer.basis !== "not_stated") {
      recorded.push(question.questionId);
    } else {
      notRecorded.push(question.questionId);
    }
  }

  // A receipt naming exactly what happened, which is a §7 obligation and
  // the difference between a tool and a black box.
  res.write(
    line({
      type: "receipt",
      recorded,
      notRecorded,
      next:
        notRecorded.length === 0
          ? "Every question was drafted. Confirm each one — nothing is recorded until you do."
          : notRecorded.length === 1
            ? "1 question was left for you: the source did not answer it."
            : `${notRecorded.length} questions were left for you: the source did not answer them.`,
    }),
  );
  res.end(line({ type: "done" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `ura-agent listening on ${PORT} — model ${modelId()}, prompt ${promptVersion()}, contract ${AGENT_CONTRACT_VERSION}`,
  );
});
