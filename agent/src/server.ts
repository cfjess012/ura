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
} from "../../src/lib/agent-contract.ts";
import { converse, type ConverseTask } from "./converse.ts";
import { draftOne, type DraftTask } from "./draft.ts";
import { modelId } from "./model.ts";
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
        prompt: promptVersion(),
      }),
    );
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
    const reply = await converse({
      said: task.said ?? "",
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
