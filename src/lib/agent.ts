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
import { isTrouble } from "./assistant-trouble";
import { config } from "./config";
import {
  AGENT_CONTRACT_VERSION,
  parseAgentEvent,
  type AgentEvent,
  type AgentRequest,
  type AssessmentContext,
  type Trouble,
} from "./agent-contract";

export type IntakeConflict = {
  one: string;
  two: string;
  why: string;
  /** A correction the person can apply, already checked against the form. */
  fix: { field: string; label: string; value: string } | null;
};

export type IntakeSummary = { narrative: string[] };

export type IntakeDescription =
  | {
      description: string;
      placeholders: string[];
      from: string;
      fields: Array<{
        field: string;
        label: string;
        value: string;
        quote: string;
      }>;
    }
  | { why: "refused" | Trouble };

export type IntakeRewrite =
  | { rewrite: string; placeholders: string[]; kept: string }
  | { why: "refused" | Trouble };

export type IntakeScoring = {
  scores: Array<{ id: string; score: 1 | 2 | 3 | 4; note?: string }>;
  conflicts: IntakeConflict[];
  summary: IntakeSummary | null;
  /**
   * Why nothing was scored, when nothing was. Absent on a real read.
   *
   * `describeIntake` and `rewriteIntake` have always named their trouble;
   * this one returned an empty scoring for all of them, so a stopped agent
   * and a rejected API key reached the screen as the same sentence. What a
   * person does next differs — one is worth retrying and one needs somebody
   * to fix a key — and that difference is the whole reason the vocabulary
   * exists (`assistant-trouble.ts`).
   */
  why?: Trouble;
};

/**
 * How long to wait for a score before giving up on it.
 *
 * The check reads a whole intake and runs 12–25 seconds, so this is
 * deliberately far past typical. It exists for the case with no floor at
 * all: a fetch with no signal waits as long as the tab stays open, and the
 * button sits on "Reading it…" forever. The check is advisory and never
 * blocks the way forward, so a bounded wait costs nothing.
 */
const SCORE_TIMEOUT_MS = 90_000;

/**
 * Which trouble a failed HTTP answer represents.
 *
 * The agent names its own where it can — it is the only side that knows
 * whether Claude rejected the key or the rate limiter did — and this is the
 * fallback for the answers that carry no name. The mapping is the one a
 * person's next action turns on: waiting helps for 429 and 5xx, and never
 * for 401.
 */
function troubleFromStatus(status: number): Trouble {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate";
  if (status >= 500) return "overloaded";
  return "unavailable";
}

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
   * Score an intake against the rubric, and name what contradicts itself.
   * Empty scores mean the model could not be asked — and the caller lets
   * the person through, because a quality assistant that blocks is a gate
   * (§22.1). Conflicts carry both halves verbatim so a person is shown
   * their own words rather than a characterisation of them.
   */
  scoreIntake(input: {
    description: string;
    /** The pickable fields and their exact options, so a fix can be checked. */
    fields: Array<{ id: string; label: string; options: string[] }>;
    dimensions: Array<{
      id: string;
      label: string;
      anchors: Record<string, string>;
    }>;
  }): Promise<IntakeScoring>;
  /**
   * Suggest a rewrite of one long-form field, or say why there is none.
   *
   * "Refused" and "unavailable" are different things to be told: one says
   * their writing stands, the other says we could not look. Reporting a
   * failure as the former tells somebody their text is fine when nobody
   * read it.
   */
  /**
   * Draft the activity description from a document they gave us. The upload
   * channel could propose gate answers and nothing else, leaving somebody
   * to type the field the whole assessment routes on while the document sat
   * open in another window.
   */
  /**
   * Explain why a risk area is asking what it is asking. Empty means no
   * explanation — never load-bearing, and the deterministic reasons stay
   * on screen either way.
   */
  explain(input: {
    area: string;
    parts: Array<{ name: string; ticked: boolean }>;
    added: Array<{ name: string; because: string }>;
    assessment: AssessmentContext;
  }): Promise<string[]>;
  describeIntake(input: {
    label: string;
    existing: string;
    document: string;
    documentName: string;
    fields: Array<{ id: string; label: string; options: string[] }>;
  }): Promise<IntakeDescription>;
  rewriteIntake(input: {
    label: string;
    original: string;
    shortfalls: Array<{ label: string; ask: string; anchor: string }>;
  }): Promise<IntakeRewrite>;
  converse(input: {
    said: string;
    assessment: AssessmentContext;
    history: Array<{ speaker: "person" | "agent"; said: string }>;
  }): Promise<{
    reply: string;
    carriesEvidence: boolean;
    asking: string | null;
    /** They are asking to have the question in front of them answered. */
    wantsAnswers: boolean;
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
      return {
        scores: [],
        conflicts: [],
        summary: null,
        why: "unreachable" as const,
      };
    },
    async explain() {
      return [];
    },
    async describeIntake() {
      return { why: "unavailable" as const };
    },
    async rewriteIntake() {
      return { why: "unavailable" as const };
    },
    async converse() {
      return {
        reply:
          "No agent is connected, so there is nobody here to talk to. Everything on these screens is worked out by rules rather than by a model, and it all works without me.",
        carriesEvidence: false,
        asking: null,
        wantsAnswers: false,
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
      const nothing = { scores: [], conflicts: [], summary: null };
      try {
        const response = await fetch(`${url}/score-intake`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-agent-contract": AGENT_CONTRACT_VERSION,
          },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(SCORE_TIMEOUT_MS),
        });
        const body = (await response.json().catch(() => null)) as {
          scores?: unknown;
          conflicts?: unknown;
          summary?: unknown;
          why?: unknown;
        } | null;
        // The agent's own name for the trouble beats anything read off a
        // status code, whichever side of `ok` it arrives on.
        if (typeof body?.why === "string" && isTrouble(body.why)) {
          return { ...nothing, why: body.why };
        }
        if (!response.ok) {
          return { ...nothing, why: troubleFromStatus(response.status) };
        }
        const scores = Array.isArray(body?.scores) ? body.scores : [];
        // No scores is not a grade of nought. Something answered and said
        // nothing usable, which is what `unavailable` means — and saying so
        // is the difference between "try once more" and a silent shrug.
        if (scores.length === 0) return { ...nothing, why: "unavailable" };
        return {
          scores,
          conflicts: Array.isArray(body?.conflicts) ? body.conflicts : [],
          summary: (body?.summary as IntakeSummary | null) ?? null,
        };
      } catch (cause) {
        // Fails open, deliberately and visibly — but it now says which
        // failure it was. A timeout is the assistant running and being too
        // slow, which is worth another go; a refused connection is not.
        const timedOut = cause instanceof Error && cause.name === "TimeoutError";
        const why: Trouble = timedOut ? "overloaded" : "unreachable";
        console.error("[agent] score-intake", why, cause);
        return { ...nothing, why };
      }
    },
    async explain(input) {
      try {
        const response = await fetch(`${url}/insight`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-agent-contract": AGENT_CONTRACT_VERSION,
          },
          body: JSON.stringify(input),
        });
        if (!response.ok) return [];
        const body = (await response.json()) as { insight?: unknown };
        return Array.isArray(body.insight)
          ? body.insight.filter((p): p is string => typeof p === "string")
          : [];
      } catch (cause) {
        console.error("[agent] insight unreachable", cause);
        return [];
      }
    },
    async describeIntake(input) {
      try {
        const response = await fetch(`${url}/describe-intake`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-agent-contract": AGENT_CONTRACT_VERSION,
          },
          body: JSON.stringify(input),
        });
        if (!response.ok) return { why: "unreachable" as const };
        const body = await response.json();
        if (body && typeof body.description === "string") return body;
        // The agent names its own trouble; anything unrecognised is the
        // model having answered with nothing usable.
        return {
          why:
            isTrouble(body?.why) || body?.why === "refused"
              ? body.why
              : ("unavailable" as const),
        };
      } catch (cause) {
        console.error("[agent] describe unreachable", cause);
        return { why: "unreachable" as const };
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
        if (!response.ok) return { why: "unreachable" as const };
        const body = await response.json();
        if (body && typeof body.rewrite === "string") return body;
        return {
          why:
            isTrouble(body?.why) || body?.why === "refused"
              ? body.why
              : ("unavailable" as const),
        };
      } catch (cause) {
        console.error("[agent] rewrite unreachable", cause);
        return { why: "unreachable" as const };
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
            wantsAnswers: false,
            asking: null,
          };
        }
        const body = (await response.json()) as {
          reply?: unknown;
          carriesEvidence?: unknown;
          wantsAnswers?: unknown;
          asking?: unknown;
        };
        return {
          reply:
            typeof body.reply === "string" && body.reply.trim() !== ""
              ? body.reply
              : "I did not have anything useful to say to that.",
          carriesEvidence: body.carriesEvidence === true,
          wantsAnswers: body.wantsAnswers === true,
          asking: typeof body.asking === "string" ? body.asking : null,
        };
      } catch (cause) {
        console.error("[agent] converse unreachable", cause);
        return {
          reply:
            "I could not reach the assistant just then, so I have nothing useful to add. Everything you have written is saved and the questions work as normal.",
          carriesEvidence: false,
          wantsAnswers: false,
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
    async explain(): Promise<never> {
      throw new Error(
        "AGENT_TRANSPORT=agentcore, but the AgentCore Runtime adapter is not implemented. It belongs in this file and nowhere else (SPEC §6.1).",
      );
    },
    async describeIntake(): Promise<never> {
      throw new Error(
        "AGENT_TRANSPORT=agentcore, but the AgentCore Runtime adapter is not implemented. It belongs in this file and nowhere else (SPEC §6.1).",
      );
    },
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
