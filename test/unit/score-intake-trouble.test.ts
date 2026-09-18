/**
 * §25 · what the intake AI check says when it could not read anything.
 *
 * The reported defect: the owner pressed "Save & run AI check" with the
 * agent service stopped, and the screen showed one grey sentence below the
 * fold. Underneath, three layers each threw the reason away — the agent
 * returned an empty scoring for every fault, the seam returned the same
 * empty scoring for a 401 as for a refused connection, and the action
 * turned all of it into one unavailable coherence.
 *
 * These tests hold the seam to naming the fault, because the sentence a
 * person reads and whether they are invited to retry both derive from it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentTransport } from "@/lib/agent";
import { tellTrouble } from "@/lib/assistant-trouble";

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

function local() {
  process.env.AGENT_TRANSPORT = "local";
  process.env.AGENT_URL = "http://agent.test";
  return agentTransport();
}

const task = { description: "a description", fields: [], dimensions: [] };

/** One canned HTTP answer from the agent service. */
function answers(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  );
}

describe("the seam names why nothing was scored", () => {
  it("reports a refused connection as the assistant not running", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new Error("connect ECONNREFUSED"), {
          code: "ECONNREFUSED",
        });
      }),
    );
    const scoring = await local().scoreIntake(task);
    expect(scoring.scores).toEqual([]);
    expect(scoring.why).toBe("unreachable");
    // The one that must never invite a retry: nothing is listening, and
    // pressing the button again teaches somebody the product is broken.
    expect(tellTrouble(scoring.why!).retryable).toBe(false);
  });

  it("tells a rejected key apart from a rate limit", async () => {
    answers(401, null);
    expect((await local().scoreIntake(task)).why).toBe("auth");
    answers(429, null);
    expect((await local().scoreIntake(task)).why).toBe("rate");
    // The distinction that matters: one needs a person, one needs a minute.
    expect(tellTrouble("auth").retryable).toBe(false);
    expect(tellTrouble("rate").retryable).toBe(true);
  });

  it("reports a server fault as overloaded, which is worth another go", async () => {
    answers(503, null);
    const scoring = await local().scoreIntake(task);
    expect(scoring.why).toBe("overloaded");
    expect(tellTrouble(scoring.why!).retryable).toBe(true);
  });

  it("prefers the agent's own name for the trouble over the status code", async () => {
    // The agent is the only side that knows whether Claude refused the key
    // or the network did. A 500 carrying "network" is a network fault.
    answers(500, { why: "network" });
    expect((await local().scoreIntake(task)).why).toBe("network");
  });

  it("treats an answer with no scores as nothing usable, not a grade of nought", async () => {
    // This is the one that used to be indistinguishable from a real read:
    // an empty scoring rendered as "couldn't check", with no way to tell
    // whether the model had failed or simply found nothing to say.
    answers(200, { scores: [], conflicts: [], summary: null });
    const scoring = await local().scoreIntake(task);
    expect(scoring.why).toBe("unavailable");
  });

  it("says nothing about trouble when it actually read the intake", async () => {
    answers(200, {
      scores: [{ id: "clarity", score: 3 }],
      conflicts: [],
      summary: null,
    });
    const scoring = await local().scoreIntake(task);
    expect(scoring.why).toBeUndefined();
    expect(scoring.scores).toHaveLength(1);
  });

  it("names the no-agent case rather than returning a silent blank", async () => {
    delete process.env.AGENT_TRANSPORT;
    const scoring = await agentTransport().scoreIntake(task);
    expect(scoring.why).toBe("unreachable");
  });
});

describe("every sentence this can produce is fit to put on the screen", () => {
  it("never leaks a driver message, a URL or a status code", async () => {
    for (const why of ["unreachable", "auth", "rate", "overloaded"] as const) {
      const said = tellTrouble(why).message;
      expect(said).not.toMatch(/ECONNREFUSED|http|401|429|503|fetch/i);
      // §25: the person's first question is whether their work survived.
      expect(said).toMatch(/untouched|nothing .*lost/i);
    }
  });
});

describe("the check words its own failures, rather than a drafting surface's", () => {
  const ALL = [
    "unreachable",
    "auth",
    "rate",
    "overloaded",
    "network",
    "unavailable",
  ] as const;

  it("never says a draft was not written on a button that grades", async () => {
    // The bug this guards: the shared sentences were written for drafting,
    // and reusing them verbatim under a heading reading "The check didn't
    // run" produced "so nothing was drafted" about a check.
    for (const why of ALL) {
      expect(tellTrouble(why, "check").message).not.toMatch(/draft/i);
    }
  });

  it("still answers the question every one of them is really asked", async () => {
    for (const why of ALL) {
      expect(tellTrouble(why, "check").message).toMatch(
        /untouched|nothing .*lost/i,
      );
    }
  });

  it("keeps one verdict on retrying per fault, whatever the surface", async () => {
    // The voice changes; whether waiting helps is a property of the fault.
    for (const why of ALL) {
      expect(tellTrouble(why, "check").retryable).toBe(
        tellTrouble(why).retryable,
      );
    }
  });

  it("leaves the drafting voice exactly as it was", async () => {
    expect(tellTrouble("unreachable").message).toMatch(/nothing was drafted/i);
  });
});
