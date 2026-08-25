import { describe, expect, it } from "vitest";
import { modelTrouble } from "../src/model.ts";

describe("naming what went wrong with a model call", () => {
  it("reads the API's own status", () => {
    expect(modelTrouble({ status: 401 })).toBe("auth");
    expect(modelTrouble({ status: 403 })).toBe("auth");
    expect(modelTrouble({ status: 429 })).toBe("rate");
    expect(modelTrouble({ status: 529 })).toBe("overloaded");
    expect(modelTrouble({ status: 503 })).toBe("overloaded");
  });

  it("reads a network fault below the API", () => {
    expect(modelTrouble({ cause: { code: "ECONNREFUSED" } })).toBe("network");
    expect(modelTrouble({ code: "ENOTFOUND" })).toBe("network");
    expect(modelTrouble({ code: "ETIMEDOUT" })).toBe("network");
  });

  it("does not guess at what it cannot place", () => {
    // A wrong diagnosis is worse than a vague one: it sends somebody to
    // check a key that was never the problem.
    expect(modelTrouble(new Error("something else"))).toBe("unavailable");
    expect(modelTrouble(undefined)).toBe("unavailable");
    expect(modelTrouble({ status: 418 })).toBe("unavailable");
  });
});
