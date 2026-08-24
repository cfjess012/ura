/**
 * §6.1 · the agent seam. What matters here is the default: with no agent
 * connected the product must say so plainly and keep working, because SPEC
 * §7 forbids implying a capability that does not run.
 */
import { afterEach, describe, expect, it } from "vitest";
import { agentTransport } from "@/lib/agent";
import {
  AGENT_CONTRACT_VERSION,
  parseAgentEvent,
  violatesNeverGuess,
} from "@/lib/agent-contract";
import type { AgentEvent } from "@/lib/agent-contract";

const request = {
  task: "draft" as const,
  projectId: "p1",
  conversationId: "c1",
  questionIds: ["t3.t3_iam_02"],
};

async function collect(
  events: AsyncIterable<AgentEvent>,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

describe("with no agent connected — today's honest state", () => {
  it("is not available, and says so rather than pretending", async () => {
    delete process.env.AGENT_TRANSPORT;
    const transport = agentTransport();
    expect(transport.kind).toBe("none");
    expect(transport.available).toBe(false);

    const events = await collect(transport.run(request));
    expect(events.at(-1)).toEqual({ type: "done" });
    const error = events.find((e) => e.type === "error");
    expect(error && "message" in error && error.message).toMatch(
      /no agent is connected/i,
    );
    // It must not offer a retry for something that cannot succeed.
    expect(error && "retryable" in error && error.retryable).toBe(false);
  });

  it("falls back to none when the transport is local but no address is set", async () => {
    process.env.AGENT_TRANSPORT = "local";
    delete process.env.AGENT_URL;
    expect(agentTransport().kind).toBe("none");
  });

  it("treats an unrecognised transport as none rather than guessing", () => {
    process.env.AGENT_TRANSPORT = "bedrock-direct";
    expect(agentTransport().kind).toBe("none");
  });

  it("always ends the turn, so nothing can wait for an event that never comes", async () => {
    delete process.env.AGENT_TRANSPORT;
    const events = await collect(agentTransport().run(request));
    expect(events.filter((e) => e.type === "done")).toHaveLength(1);
  });
});

describe("AgentCore is named, not silently missing", () => {
  it("throws by name so switching to it early fails at the seam", async () => {
    process.env.AGENT_TRANSPORT = "agentcore";
    const transport = agentTransport();
    expect(transport.kind).toBe("agentcore");
    expect(transport.available).toBe(false);
    await expect(collect(transport.run(request))).rejects.toThrow(
      /AgentCore Runtime adapter/,
    );
  });
});

describe("the wire contract is strict about what it accepts", () => {
  it("parses the events it knows", () => {
    expect(parseAgentEvent('{"type":"done"}')).toEqual({ type: "done" });
    expect(parseAgentEvent('{"type":"thinking","text":"reading"}')).toEqual({
      type: "thinking",
      text: "reading",
    });
  });

  it("drops anything it does not recognise, rather than passing it on", () => {
    // A newer agent must not be able to put arbitrary content on a screen.
    expect(
      parseAgentEvent('{"type":"execute","command":"rm -rf /"}'),
    ).toBeNull();
    expect(parseAgentEvent("not json")).toBeNull();
    expect(parseAgentEvent('"a string"')).toBeNull();
    expect(parseAgentEvent("null")).toBeNull();
  });

  it("has a version, so a mismatch between the two images is visible", () => {
    expect(AGENT_CONTRACT_VERSION).toMatch(/^\d+$/);
  });
});

describe("the never-guess rule (SPEC §7)", () => {
  const grounded = {
    basis: "stated" as const,
    value: "Yes",
    quote:
      "Multi-factor authentication is enforced for all administrative access.",
    source: "novara-security-overview.pdf",
  };

  it("accepts an answer that carries what it came from", () => {
    expect(violatesNeverGuess(grounded)).toBeNull();
  });

  it("accepts an abstention that abstains completely", () => {
    expect(
      violatesNeverGuess({
        basis: "not_stated",
        value: null,
        quote: null,
        source: null,
      }),
    ).toBeNull();
  });

  it("refuses an abstention that smuggles an answer through anyway", () => {
    expect(
      violatesNeverGuess({
        basis: "not_stated",
        value: "Yes",
        quote: null,
        source: null,
      }),
    ).toMatch(/carries no answer/i);
  });

  it("refuses a stated answer with nothing to point at", () => {
    expect(violatesNeverGuess({ ...grounded, quote: null })).toMatch(
      /passage it came from/i,
    );
    expect(violatesNeverGuess({ ...grounded, source: null })).toMatch(
      /passage it came from/i,
    );
  });

  it("refuses an inference with no grounding quote — that is a guess", () => {
    // The distinction the whole basis vocabulary exists for: an inference
    // is still evidence-backed, it just took one step to get there.
    expect(
      violatesNeverGuess({
        basis: "inferred",
        value: "Yes",
        quote: null,
        source: "a document",
      }),
    ).toMatch(/is a guess/i);
  });

  it("refuses a grounded basis that proposes nothing", () => {
    expect(violatesNeverGuess({ ...grounded, value: null })).toMatch(
      /must propose a value/i,
    );
  });
});
