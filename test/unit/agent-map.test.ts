/**
 * The agent map cannot go stale (G-25).
 *
 * A generated file that nobody regenerates is a snapshot with better
 * manners — this suite proves the committed data matches the repository
 * right now, so adding an agent or editing an instruction and forgetting to
 * regenerate fails the build instead of quietly misleading an administrator.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const committed = JSON.parse(readFileSync(join(ROOT, "src", "data", "agents.json"), "utf8"));

describe("the published agent map matches the repository", () => {
  it("lists every subagent, skill and hook that exists on disk", () => {
    const listed = new Set(
      committed.groups.flatMap((g: { nodes: { name: string }[] }) => g.nodes.map((n) => n.name)),
    );
    for (const dir of readdirSync(join(ROOT, ".claude", "skills"))) {
      expect(listed, `skill ${dir} is missing from the map`).toContain(dir);
    }
    for (const file of readdirSync(join(ROOT, ".claude", "agents"))) {
      expect(listed, `subagent ${file} is missing from the map`).toContain(file.replace(".md", ""));
    }
  });

  it("carries each agent's real instructions, not a summary", () => {
    const skill = committed.groups
      .flatMap((g: { nodes: { name: string; full: string }[] }) => g.nodes)
      .find((n: { name: string }) => n.name === "ux-audit");
    const onDisk = readFileSync(join(ROOT, ".claude", "skills", "ux-audit", "SKILL.md"), "utf8");
    // The stored text is the file's body — a distinctive line must survive.
    const distinctive = onDisk.match(/^.*punishes honesty.*$/m)?.[0];
    expect(distinctive, "expected the origin story in the skill").toBeTruthy();
    expect(skill.full).toContain(distinctive!.trim());
  });

  it("regenerating produces identical data — the committed copy is current", () => {
    const scratch = mkdtempSync(join(tmpdir(), "agent-map-"));
    // BOTH outputs go to the scratch directory. This test used to send the
    // HTML to a temp path while the generator wrote `src/data/agents.json`
    // at the repo root regardless — so running the suite silently repaired
    // a tampered artifact, the Stop gate's staleness check could never
    // fire, and a hand-edited file went red once then green on the retry
    // (enforcement-layer verification, gate 1).
    execFileSync(
      "node",
      ["scripts/build-agent-map.mjs", join(scratch, "out.html"), join(scratch, "agents.json")],
      { cwd: ROOT, stdio: "pipe" },
    );
    const regenerated = JSON.parse(readFileSync(join(scratch, "agents.json"), "utf8"));
    // Ignore the generation date, which moves every day by design.
    const strip = (d: { generated?: string }) => ({ ...d, generated: undefined });
    expect(strip(regenerated)).toEqual(strip(committed));
  });

  it("every agent states when it runs and what it can see", () => {
    for (const group of committed.groups) {
      for (const node of group.nodes) {
        expect(node.trigger?.length, `${node.name} has no trigger`).toBeGreaterThan(20);
        expect(node.access?.length, `${node.name} has no access description`).toBeGreaterThan(20);
        // Plain words for a person, not a tool list.
        expect(node.access, node.name).not.toMatch(/\b(Read|Grep|Glob|Bash)\b,/);
      }
    }
  });
});
