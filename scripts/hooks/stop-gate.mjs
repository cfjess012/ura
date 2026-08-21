#!/usr/bin/env node
/**
 * Stop gate (SPEC §0 Build Rule 3): work does not conclude on a red build.
 * Runs only the tiers that need nothing external — typecheck and unit —
 * so the gate is fast and cannot fail for environmental reasons. The full
 * chain (integration + e2e) is `pnpm verify` and the `full-gates` skill.
 */
import { execSync } from "node:child_process";

try {
  execSync("pnpm typecheck && pnpm test:unit", { stdio: "pipe", cwd: process.cwd() });
  process.exit(0);
} catch (error) {
  const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.slice(-2000);
  console.error(
    "Stop gate: typecheck or unit tests are red — finish the work or fix the break.\n" + output,
  );
  process.exit(2);
}
