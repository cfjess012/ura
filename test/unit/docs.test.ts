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
    //
    // The governance log (§13) is excluded, and that is a correction rather
    // than a loosening. It is append-only by design — every settled decision
    // stays in it forever — so counting it meant the guard tightened by one
    // line every time a decision was recorded, and the only ways to satisfy
    // it were to delete history or to stop writing things down. Both are
    // worse than a long file. What this measures is the part that is
    // supposed to stay small: the law.
    const lines = spec.split("\n");
    const logStart = lines.findIndex((l) => l.startsWith("## 13."));
    const logEnd = lines.findIndex((l) => l.startsWith("## 14."));
    const law = lines.length - (logEnd - logStart);
    expect(law, "SPEC's law sections have grown — extract to a skill").toBeLessThan(620);
  });
});

describe("the verifier cannot fall behind the law it audits", () => {
  const verifier = readFileSync(join(ROOT, ".claude", "agents", "slice-verifier.md"), "utf8");

  it("names every §24 experience principle", () => {
    // Extract the numbered laws from SPEC §24.
    const section = spec.slice(spec.indexOf("## 24. Experience principles"));
    const body = section.slice(0, section.indexOf("\n## "));
    const laws = [...body.matchAll(/^(\d+)\. \*\*/gm)].map((m) => m[1]!);
    expect(laws.length).toBeGreaterThanOrEqual(10);
    for (const n of laws) {
      expect(verifier, `§24.${n} missing from the verifier`).toContain(`24.${n}`);
    }
  });

  it("points at the skills rather than paraphrasing them", () => {
    for (const skill of ["ux-audit", "ui-craft", "error-handling"]) {
      expect(verifier, skill).toContain(`${skill}/SKILL.md`);
    }
  });
});

describe("the skills cannot fall behind the law they audit", () => {
  // N7: ux-audit sat two revisions behind SPEC §24 — it had no §24.3 at all
  // and its 24.3–24.8 were the SPEC's 24.4–24.9. A verifier told to follow
  // the skill audited against the wrong list and reported nothing wrong.
  const skill = readFileSync(join(ROOT, ".claude", "skills", "ux-audit", "SKILL.md"), "utf8");
  const laws = (spec.split("## 24.")[1] ?? "").split("## 25.")[0] ?? "";

  it("ux-audit lists exactly the §24 laws, and numbers them the same", () => {
    const inSpec = [...laws.matchAll(/^(\d+)\. \*\*([^*.]+)/gm)].map(
      (m) => `24.${m[1]} ${m[2]!.trim()}`,
    );
    expect(inSpec.length).toBeGreaterThan(8);
    for (const law of inSpec) {
      const [number, ...words] = law.split(" ");
      const firstWords = words.join(" ").split(" ").slice(0, 3).join(" ");
      const heading = skill.match(new RegExp(`\\*\\*${number!.replace(".", "\\.")} ([^*]+)`));
      expect(heading, `${number} is missing from the ux-audit skill`).toBeTruthy();
      expect(
        heading![1]!.toLowerCase().startsWith(firstWords.toLowerCase().slice(0, 12)),
        `${number} says "${heading![1]!.slice(0, 40)}" but the law says "${firstWords}"`,
      ).toBe(true);
    }
  });
});

describe("the agent map can be checked against something other than itself", () => {
  // The old test regenerated the map and compared it to the committed copy:
  // it proved the file matched the generator, and nothing proved the
  // generator matched the SPEC. Seven registered features were missing for
  // weeks while it stayed green. A check may never be its own reference.
  const map = JSON.parse(
    readFileSync(join(ROOT, "src", "data", "agents.json"), "utf8"),
  ) as { groups: { side: string; nodes: { name: string }[] }[] };
  const register = (spec.split("### 22.1 Phase-2 feature register")[1] ?? "").split("## 23.")[0]!;
  const rows = register
    .split("\n")
    .filter((l) => l.startsWith("|") && !l.includes("---") && !l.startsWith("| From"))
    .map((l) => l.split("|")[2]!.trim().replace(/\*\*/g, ""));

  it("lists every feature registered in §22.1 — no silent drops", () => {
    expect(rows.length).toBeGreaterThan(10);
    const listed = map.groups.flatMap((g) => g.nodes.map((n) => n.name));
    const missing = rows.filter(
      (row) => !listed.some((name) => row.startsWith(name) || name === row),
    );
    expect(missing, "registered in SPEC §22.1 but absent from the map").toEqual([]);
  });

  it("counts the same both ways", () => {
    const runtime = map.groups
      .filter((g) => g.side === "runtime")
      .flatMap((g) => g.nodes).length;
    expect(runtime, "§22.1 rows vs runtime nodes on the map").toBe(rows.length);
  });
});
