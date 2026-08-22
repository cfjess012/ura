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
  /**
   * This used to be a tautology. It gathered every backtick token in the
   * two documents, **filtered them by whether they existed on disk**, and
   * then asserted the survivors existed on disk — so deleting a skill that
   * CLAUDE.md, SPEC and the slice-verifier all route work to left every
   * gate green. The comment claimed it was "derived from what exists,
   * never an allowlist that rots"; the derivation had removed the
   * reference entirely (enforcement-layer verification).
   *
   * The reference now is the routing table in CLAUDE.md — the document
   * that tells a working session which procedure to load. A name in it is
   * a promise that the procedure is there.
   */
  const routed = [...claudeMd.matchAll(/^\| [^|]+ \| `([a-z-]+)` \|$/gm)].map((m) => m[1]!);

  it("the skills table routes work to real skills", () => {
    expect(routed.length, "no skills table found in CLAUDE.md").toBeGreaterThan(5);
    for (const name of routed) expect(skillNames, `${name} is routed to but does not exist`).toContain(name);
  });

  it("every skill on disk is routed to from CLAUDE.md", () => {
    // The other direction: a procedure nobody is told to load is a
    // procedure that does not run.
    for (const name of skillNames)
      expect(routed, `${name} exists but no moment in CLAUDE.md loads it`).toContain(name);
  });

  it("the verifier's own references resolve", () => {
    // .claude/agents/slice-verifier.md names skills to audit against. A
    // dangling name there is silent: the verifier simply skips a standard.
    const verifier = readFileSync(join(ROOT, ".claude", "agents", "slice-verifier.md"), "utf8");
    for (const m of verifier.matchAll(/\.claude\/skills\/([a-z-]+)\/SKILL\.md/g))
      expect(skillNames, `slice-verifier points at ${m[1]}, which does not exist`).toContain(m[1]!);
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
    // The slice-status block is excluded, and that is a correction rather
    // than a loosening — same reasoning as the governance log in SPEC. It
    // grows by a line per finished slice, so counting it meant the budget
    // tightened every time work was completed, and the only ways to pass
    // were to delete status or stop recording it. What this measures is the
    // part that is supposed to stay small: the routing.
    const lines = claudeMd.split("\n");
    const start = lines.findIndex((l) => l.startsWith("## Slice status"));
    const end = lines.findIndex((l) => l.startsWith("## Commands"));
    const router = lines.length - (end - start);
    expect(router, "CLAUDE.md's routing has grown — move detail to a skill").toBeLessThan(105);
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
    // §22.1 is excluded for exactly the same reason, found the same way.
    // The agent register is append-only too: every slice registers the
    // agentic opportunity it designed, forever. Counted, it tightened the
    // guard on every registration, and the only ways to pass would have
    // been to delete law or to stop registering — the failure mode this
    // test's own comment says it corrected for (enforcement-layer
    // verification). It was at 616 of 620: four more registrations away.
    const lines = spec.split("\n");
    const spanOf = (from: string, to: RegExp) => {
      const start = lines.findIndex((l) => l.startsWith(from));
      if (start === -1) return 0;
      const after = lines.slice(start + 1).findIndex((l) => to.test(l));
      return after === -1 ? lines.length - start : after + 1;
    };
    const appendOnly = spanOf("## 13.", /^## 14\./) + spanOf("### 22.1", /^#{2,3} /);
    const law = lines.length - appendOnly;
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
