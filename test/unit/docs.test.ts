/**
 * Documentation architecture (SPEC G-18): law in SPEC, procedure in skills.
 * These tests make drift a red build rather than a discovery weeks later.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SKILLS = join(ROOT, ".claude", "skills");
const spec = readFileSync(join(ROOT, "SPEC.md"), "utf8");
const claudeMd = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
const skillNames = readdirSync(SKILLS);
const skillBody = (name: string) => readFileSync(join(SKILLS, name, "SKILL.md"), "utf8");

describe("SPEC ↔ skills stay in sync", () => {
  it("every skill named in SPEC or CLAUDE.md exists on disk", () => {
    // Derived from what exists, never an allowlist that rots.
    const known = new Set(skillNames);
    const named = new Set(
      [...spec.matchAll(/`\/?([a-z-]+)`/g), ...claudeMd.matchAll(/`\/?([a-z-]+)`/g)]
        .map((m) => m[1]!)
        .filter((candidate) => known.has(candidate)),
    );
    expect(named.size).toBeGreaterThan(0);
    for (const name of named) expect(skillNames, name).toContain(name);
  });

  it("every skill declares the SPEC section it implements", () => {
    for (const name of skillNames) {
      const body = skillBody(name);
      expect(body, name).toMatch(/Implements SPEC §/);
      const section = body.match(/Implements SPEC §(\d+)/)![1]!;
      expect(spec, `${name} → §${section}`).toMatch(new RegExp(`^## ${section}\\.`, "m"));
    }
  });

  it("every skill has frontmatter whose description names the moment to use it", () => {
    for (const name of skillNames) {
      const body = skillBody(name);
      expect(body.startsWith("---\n"), name).toBe(true);
      expect(body, name).toMatch(new RegExp(`^name: ${name}$`, "m"));
      const description = body.match(/^description: (.+)$/m)?.[1] ?? "";
      // A description that names a situation gets surfaced; a title does not.
      expect(description.length, name).toBeGreaterThan(60);
      expect(description, name).toMatch(/Use when|Use before|Use whenever/);
    }
  });
});

describe("the always-resident context stays thin", () => {
  it("CLAUDE.md remains a router, not a manual", () => {
    expect(claudeMd.split("\n").length).toBeLessThan(120);
  });

  it("SPEC keeps the law and does not grow procedure back", () => {
    // A guard, not a target: if this trips, extract to a skill rather than
    // raising the number.
    expect(spec.split("\n").length).toBeLessThan(650);
  });
});
