import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadProjectEnv } from "../src/env.ts";

function envFile(body: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "ura-env-")), ".env");
  writeFileSync(path, body);
  return path;
}

const KEEP = { ...process.env };
afterEach(() => {
  process.env = { ...KEEP };
});

describe("loading the project's own environment", () => {
  it("lets the project file beat a variable exported by the shell", () => {
    // The whole reason this exists: a dead key exported from a shell
    // profile shadowed the working one in .env, and the API's "invalid
    // key" pointed at the file that was already right.
    process.env.ANTHROPIC_API_KEY = "stale-from-the-shell";
    loadProjectEnv(envFile("ANTHROPIC_API_KEY=the-real-one\n"));
    expect(process.env.ANTHROPIC_API_KEY).toBe("the-real-one");
  });

  it("says where the value came from, so a 401 is never a mystery", () => {
    process.env.AGENT_MODEL = "from-the-shell";
    const from = loadProjectEnv(envFile("ANTHROPIC_API_KEY=k\n"));
    expect(from.ANTHROPIC_API_KEY).toBe("project .env");
    expect(from.AGENT_MODEL).toBe("the environment");
    expect(from.AGENT_PROVIDER).toBe("unset");
  });

  it("leaves the shell alone for anything the file does not set", () => {
    process.env.AGENT_PROVIDER = "bedrock";
    loadProjectEnv(envFile("ANTHROPIC_API_KEY=k\n"));
    expect(process.env.AGENT_PROVIDER).toBe("bedrock");
  });

  it("reads the shapes a .env actually has", () => {
    loadProjectEnv(
      envFile(
        [
          "# a comment",
          "",
          'QUOTED="in double quotes"',
          "SINGLE='in single quotes'",
          "PLAIN=bare",
          "WITH_EQUALS=a=b=c",
          "  SPACED  =  padded  ",
          "not a variable line",
        ].join("\n"),
      ),
      ["QUOTED"],
    );
    expect(process.env.QUOTED).toBe("in double quotes");
    expect(process.env.SINGLE).toBe("in single quotes");
    expect(process.env.PLAIN).toBe("bare");
    expect(process.env.WITH_EQUALS).toBe("a=b=c");
    expect(process.env.SPACED).toBe("padded");
  });

  it("treats a missing file as a normal way to run", () => {
    // The local model needs no key at all.
    expect(() => loadProjectEnv("/nowhere/at/all/.env")).not.toThrow();
  });
});
