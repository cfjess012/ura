/**
 * The **only** module that knows how the agent is reached (SPEC §6.1).
 *
 * Nothing else in this codebase may address the agent — not a page, not an
 * action, not another library module. That is asserted by a test, because a
 * seam maintained by convention stops being a seam the first time somebody
 * is in a hurry.
 *
 * Three transports, chosen by environment and never by a code branch
 * anywhere else:
 *
 * - `none` (the default) — there is no agent. Every call returns a refusal
 *   saying so. This is the honest state today: SPEC §7 requires that until a
 *   capability ships it stays unreachable from the product, and the demo
 *   never implies it runs.
 * - `local` — an agent service over HTTP, streaming NDJSON. This is what
 *   runs in development and what a second ECS service will be.
 * - `agentcore` — AgentCore Runtime. Not implemented; it throws by name so
 *   that switching to it before it exists fails loudly at the seam instead
 *   of quietly somewhere else.
 */
import { config } from "./config";
import {
  AGENT_CONTRACT_VERSION,
  parseAgentEvent,
  type AgentEvent,
  type AgentRequest,
  type AssessmentContext,
} from "./agent-contract";

export type AgentTransport = {
  /** Which transport this is, for receipts and diagnostics. */
  readonly kind: "none" | "local" | "agentcore";
  /** Whether the agent can actually be called right now. */
  readonly available: boolean;
  /**
   * Run one turn, streaming events as they arrive. Always completes with a
   * terminal event — `done` or `error` — so no caller can hang waiting for
   * one that never comes.
   */
  run(request: AgentRequest): AsyncIterable<AgentEvent>;
  /**
   * One conversational turn. Resolves to something sayable whatever
   * happens — a thought partner that throws is worse than one that says it
   * cannot help right now.
   */
  /**
   * The handoff summary and the scenarios worth asking about. Resolves to
   * null when there is nothing — the report is complete without it, so a
   * missing summary is an answer rather than a failure.
   */
  writeReport(input: {
    assessment: AssessmentContext;
    record: string;
  }): Promise<{
    summary: string;
    scenarios: Array<{ scenario: string; ask: string; from: string[] }>;
  } | null>;
  /**
   * Score a description against the rubric. An empty list means the model
   * could not be asked — and the caller lets the person through, because a
   * quality assistant that blocks is a gate (§22.1).
   */
  scoreIntake(input: {
    description: string;
    dimensions: Array<{
      id: string;
      label: string;
      anchors: Record<string, string>;
    }>;
  }): Promise<Array<{ id: string; score: 0 | 1 | 2 }>>;
  /**
   * Suggest a rewrite of one long-form field. Null means none to offer —
   * a real answer, not a failure to handle.
   */
  rewriteIntake(input: {
    label: string;
    original: string;
    shortfalls: Array<{ label: string; ask: string; anchor: string }>;
  }): Promise<{ rewrite: string; placeholders: string[]; kept: string } | null>;
  converse(input: {
    said: string;
    assessment: AssessmentContext;
    history: Array<{ speaker: "person" | "agent"; said: string }>;
  }): Promise<{
    reply: string;
    carriesEvidence: boolean;
    asking: string | null;
  }>;
};

/** The state of things today, said plainly rather than by failing. */
function notConfigured(): AgentTransport {
  return {
    kind: "none",
    available: false,
    async *run() {
      yield {
        type: "error",
        message:
          "No agent is connected, so nothing was drafted. Everything on these screens is worked out by rules, not by a model.",
        retryable: false,
      };
      yield { type: "done" };
    },
    async writeReport() {
      return null;
    },
    async scoreIntake() {
      return [];
    },
    async rewriteIntake() {
      return null;
    },
    async converse() {
      return {
        reply:
          "No agent is connected, so there is nobody here to talk to. Everything on these screens is worked out by rules rather than by a model, and it all works without me.",
        carriesEvidence: false,
        asking: null,
      };
    },
  };
}

function localTransport(baseUrl: string): AgentTransport {
  const url = baseUrl.replace(/\/$/, "");
  return {
    kind: "local",
    available: true,
    async writeReport(input) {
      try {
        const response = await fetch(`${url}/report`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-agent-contract": AGENT_CONTRACT_VERSION,
          },
          body: JSON.stringify(input),
        });
        if (!response.ok) return null;
        const body = await response.json();
        return body && typeof body.summary === "string" ? body : null;
      } catch (cause) {
        console.error("[agent] report unreachable", cause);
        return null;
      }
    },
    async scoreIntake(input) {
      try {
        const response = await fetch(`${url}/score-intake`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-agent-contract": AGENT_CONTRACT_VERSION,
          },
          body: JSON.stringify(input),
        });
        if (!response.ok) return [];
        const body = (await response.json()) as { scores?: unknown };
        return Array.isArray(body.scores) ? body.scores : [];
      } catch (cause) {
        // Fails open, deliberately and visibly.
        console.error("[agent] score-intake unreachable", cause);
        return [];
      }
    },
    async rewriteIntake(input) {
      try {
        const response = await fetch(`${url}/rewrite-intake`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-agent-contract": AGENT_CONTRACT_VERSION,
          },
          body: JSON.stringify(input),
        });
        if (!response.ok) return null;
        const body = await response.json();
        return body && typeof body.rewrite === "string" ? body : null;
      } catch (cause) {
        console.error("[agent] rewrite unreachable", cause);
        return null;
      }
    },
    async converse(input) {
      // Never throws: the caller is a person mid-sentence, and an
      // exception here would take the screen down with it.
      try {
        const response = await fetch(`${url}/converse`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-agent-contract": AGENT_CONTRACT_VERSION,
          },
          body: JSON.stringify({
            said: input.said,
            assessment: input.assessment,
            history: input.history,
            openQuestions: input.assessment.openQuestions,
            context: input.assessment.activity,
          }),
        });
        if (!response.ok) {
          return {
            reply:
              "I could not reach the assistant just then, so I have nothing useful to add. Everything you have written is saved and the questions work as normal.",
            carriesEvidence: false,
            asking: null,
          };
        }
        const body = (await response.json()) as {
          reply?: unknown;
          carriesEvidence?: unknown;
          asking?: unknown;
        };
        return {
          reply:
            typeof body.reply === "string" && body.reply.trim() !== ""
              ? body.reply
              : "I did not have anything useful to say to that.",
          carriesEvidence: body.carriesEvidence === true,
          asking: typeof body.asking === "string" ? body.asking : null,
        };
      } catch (cause) {
        console.error("[agent] converse unreachable", cause);
        return {
          reply:
            "I could not reach the assistant just then, so I have nothing useful to add. Everything you have written is saved and the questions work as normal.",
          carriesEvidence: false,
          asking: null,
        };
      }
    },
    async *run(request) {
      let response: Response;
      try {
        response = await fetch(`${url}/run`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-agent-contract": AGENT_CONTRACT_VERSION,
          },
          body: JSON.stringify(request),
        });
      } catch (cause) {
        // The agent being down must never take the product down with it.
        console.error("[agent] unreachable", cause);
        yield {
          type: "error",
          message:
            "The drafting service could not be reached, so nothing was drafted. Everything else still works — you can answer the questions yourself.",
          retryable: true,
        };
        yield { type: "done" };
        return;
      }

      if (!response.ok || !response.body) {
        yield {
          type: "error",
          message: `The drafting service answered with ${response.status}, so nothing was drafted.`,
          retryable: response.status >= 500,
        };
        yield { type: "done" };
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawTerminal = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // NDJSON: complete lines only. A partial line is not an event yet.
        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
          if (line === "") continue;
          const event = parseAgentEvent(line);
          if (!event) continue; // unrecognised events are dropped, never passed on
          if (event.type === "done" || event.type === "error")
            sawTerminal = true;
          yield event;
        }
      }
      // A stream that stops mid-turn is a failure the caller must be told
      // about, not a turn that quietly ended.
      if (!sawTerminal) {
        yield {
          type: "error",
          message:
            "The drafting service stopped part-way through. Anything already proposed is still on screen; nothing was recorded.",
          retryable: true,
        };
        yield { type: "done" };
      }
    },
  };
}

function agentCoreTransport(): AgentTransport {
  return {
    kind: "agentcore",
    available: false,
    async rewriteIntake(): Promise<never> {
      throw new Error(
        "AGENT_TRANSPORT=agentcore, but the AgentCore Runtime adapter is not implemented. It belongs in this file and nowhere else (SPEC §6.1).",
      );
    },
    async scoreIntake(): Promise<never> {
      throw new Error(
        "AGENT_TRANSPORT=agentcore, but the AgentCore Runtime adapter is not implemented. It belongs in this file and nowhere else (SPEC §6.1).",
      );
    },
    async writeReport(): Promise<never> {
      throw new Error(
        "AGENT_TRANSPORT=agentcore, but the AgentCore Runtime adapter is not implemented. It belongs in this file and nowhere else (SPEC §6.1).",
      );
    },
    async converse(): Promise<never> {
      throw new Error(
        "AGENT_TRANSPORT=agentcore, but the AgentCore Runtime adapter is not implemented. It belongs in this file and nowhere else (SPEC §6.1).",
      );
    },
    async *run(): AsyncIterable<AgentEvent> {
      throw new Error(
        "AGENT_TRANSPORT=agentcore, but the AgentCore Runtime adapter is not implemented. It belongs in this file and nowhere else (SPEC §6.1).",
      );
    },
  };
}

/** The one way to get at the agent. */
export function agentTransport(): AgentTransport {
  switch (config.agentTransport) {
    case "local": {
      const url = config.agentUrl;
      return url ? localTransport(url) : notConfigured();
    }
    case "agentcore":
      return agentCoreTransport();
    default:
      return notConfigured();
  }
}
