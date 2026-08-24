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
  };
}

function localTransport(baseUrl: string): AgentTransport {
  return {
    kind: "local",
    available: true,
    async *run(request) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl.replace(/\/$/, "")}/run`, {
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
