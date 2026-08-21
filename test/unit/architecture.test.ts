/**
 * The cloud-native rules as tests (SPEC §26). Prose is advice; a test is a
 * rule. These fail the build if the codebase drifts back toward code that
 * cannot be lifted onto AWS.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..", "src");

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) filesUnder(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}
const read = (p: string) => readFileSync(p, "utf8");
const rel = (p: string) => p.slice(SRC.length + 1);

describe("§26.1 pure logic is liftable", () => {
  // Modules that must run unchanged inside a Lambda or AgentCore task.
  const PURE = ["lib/intake.ts", "lib/intake-values.ts", "lib/errors.ts"];

  it("imports no framework, driver, or environment", () => {
    for (const file of PURE) {
      const source = read(join(SRC, file));
      expect(source, file).not.toMatch(/from "next/);
      expect(source, file).not.toMatch(/from "(drizzle-orm|postgres)/);
      expect(source, file).not.toMatch(/process\.env/);
    }
  });

  it("takes plain data, not web request shapes", () => {
    const source = read(join(SRC, "lib/intake-values.ts"));
    expect(source).not.toMatch(/\bFormData\b/);
    expect(source).not.toMatch(/\bRequest\b/);
  });
});

describe("§26.2 persistence is behind one interface", () => {
  it("only the store and the db module touch the driver", () => {
    const allowed = new Set(["lib/repo.ts", "lib/db.ts", "lib/schema.ts"]);
    const offenders = filesUnder(SRC)
      .filter((f) => !allowed.has(rel(f)))
      .filter((f) => /from "drizzle-orm|from "postgres"|getDb\(/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});

describe("§26.3 configuration is read in one place", () => {
  it("no module outside the config reads process.env", () => {
    const offenders = filesUnder(SRC)
      .filter((f) => rel(f) !== "lib/config.ts")
      .filter((f) => /process\.env/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("no hardcoded connection strings or hosts anywhere in src", () => {
    for (const file of filesUnder(SRC)) {
      const source = read(file);
      expect(source, rel(file)).not.toMatch(/postgres:\/\/[^"'`\s]+/);
      expect(source, rel(file)).not.toMatch(/localhost:\d{4}/);
    }
  });
});

describe("§25 error handling is structural", () => {
  it("server actions return typed results rather than throwing on failure", () => {
    const source = read(join(SRC, "app/actions.ts"));
    // One deliberate throw remains: an empty project name before a row
    // exists. Everything else must flow through failure().
    // Any throw, not just `throw new Error` — a bespoke error class threw
    // straight past this guard and landed a refusal on the generic error
    // boundary (N15, N3). `redirect()` throws by design and is exempt.
    const throws = source.match(/throw new \w+/g) ?? [];
    expect(throws, "server actions return failures; they do not throw").toEqual([]);
    expect(source).toMatch(/failure\(/);
  });
});

describe("§2 authority is checked on the object, not only on the listing", () => {
  // N1: role scoping filtered the assessment list and nothing else, so every
  // assessment was open to every persona by URL. A route that loads a
  // project must go through the one helper that decides who may see it.
  it("no project route reads the store directly instead of openProject", () => {
    const offenders = filesUnder(join(SRC, "app", "(app)", "projects"))
      .filter((f) => /page\.tsx$/.test(f))
      .filter((f) => /projects\/\[id\]/.test(rel(f)))
      .filter((f) => /projectStore\(\)\.get\(/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("every write action decides authority before it writes", () => {
    const source = read(join(SRC, "app", "actions.ts"));
    for (const action of ["saveIntake", "answerGate"]) {
      const body = source.slice(source.indexOf(`export async function ${action}`));
      const upToWrite = body.slice(0, body.indexOf("Store()."));
      expect(upToWrite, `${action} writes before checking`).toMatch(/editableProject/);
    }
  });
});
