/**
 * The enforcement layer has an off switch, and nothing could see it.
 *
 * Every gate in this repo is a script under `scripts/hooks/`, and every
 * script only runs because `.claude/settings.json` says when. Nothing read
 * that file. An independent verifier deleted the entire `Stop` block, ran
 * the suite, and got 184 green — while the in-app transparency page went
 * on telling an administrator the gate runs "automatically, whenever a
 * working session tries to finish". The agent map's reference for hooks was
 * *file existence*, not wiring.
 *
 * So this is the wiring's external reference: the scripts on disk, and the
 * events each one must be attached to. A hook that exists but is not wired
 * fails here; so does one wired to an event it was not written for.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const settings = JSON.parse(readFileSync(join(ROOT, ".claude", "settings.json"), "utf8"));

/** Which event each hook script must be wired to, and how it must match. */
const WIRING: Record<string, { event: string; matcher?: RegExp }> = {
  "advise.mjs": { event: "PostToolUse", matcher: /Edit\|Write\|MultiEdit/ },
  "guard.mjs": { event: "PreToolUse", matcher: /Edit\|Write\|MultiEdit/ },
  "stop-gate.mjs": { event: "Stop" },
};

const commandsFor = (event: string): string[] =>
  ((settings.hooks?.[event] ?? []) as { hooks?: { command?: string }[] }[]).flatMap((entry) =>
    (entry.hooks ?? []).map((h) => h.command ?? ""),
  );

describe("every gate is actually wired to fire", () => {
  const scripts = readdirSync(join(ROOT, "scripts", "hooks")).filter((f) => f.endsWith(".mjs"));

  it("every hook script on disk is declared in WIRING", () => {
    // The reference is the directory, so a new gate cannot be added
    // without someone deciding which event it belongs to.
    expect(scripts.sort()).toEqual(Object.keys(WIRING).sort());
  });

  for (const [script, { event, matcher }] of Object.entries(WIRING)) {
    it(`${script} is wired to ${event}`, () => {
      const commands = commandsFor(event);
      expect(commands.some((c) => c.includes(script)), `${script} is not wired to ${event}`).toBe(
        true,
      );
    });

    if (matcher) {
      it(`${script} fires on the tools it is written for`, () => {
        const entries = (settings.hooks?.[event] ?? []) as {
          matcher?: string;
          hooks?: { command?: string }[];
        }[];
        const mine = entries.find((e) => (e.hooks ?? []).some((h) => h.command?.includes(script)));
        expect(mine?.matcher, `${script} has no matcher`).toBeTruthy();
        expect(mine!.matcher).toMatch(matcher);
      });
    }
  }

  it("every wired command points at a script that exists", () => {
    for (const event of Object.keys(settings.hooks ?? {})) {
      for (const command of commandsFor(event)) {
        const named = command.match(/scripts\/hooks\/([\w.-]+)/)?.[1];
        expect(named, `a ${event} hook runs something that is not a hook script: ${command}`,
        ).toBeTruthy();
        expect(scripts, `${event} runs ${named}, which does not exist`).toContain(named!);
      }
    }
  });

  it("every wired command has a timeout, so a hung gate cannot hang the session", () => {
    for (const event of Object.keys(settings.hooks ?? {})) {
      const entries = settings.hooks[event] as { hooks?: { timeout?: number }[] }[];
      for (const entry of entries) {
        for (const hook of entry.hooks ?? []) {
          expect(hook.timeout, `a ${event} hook has no timeout`).toBeGreaterThan(0);
        }
      }
    }
  });
});
