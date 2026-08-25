#!/usr/bin/env node
/**
 * Start the agent service, on any operating system.
 *
 * The package scripts used to carry their own environment inline —
 * `AGENT_PROVIDER=anthropic AGENT_MODEL=${AGENT_MODEL:-claude-sonnet-5}
 * PORT=8790 node …`. That is POSIX shell syntax. On Windows `cmd` and
 * PowerShell it is not a variable assignment at all, and the whole line
 * fails — including `pnpm agent:claude`, which is the one command somebody
 * needs to see any of the AI work. A launcher in Node has no shell in it,
 * so it behaves the same everywhere.
 *
 *   node scripts/agent.mjs claude    the Claude API (needs ANTHROPIC_API_KEY)
 *   node scripts/agent.mjs ollama    a local model, free, no key
 *   node scripts/agent.mjs           whatever the environment already says
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const mode = process.argv[2] ?? "plain";
const PORT = process.env.PORT ?? "8790";

const forMode = {
  claude: {
    AGENT_PROVIDER: "anthropic",
    AGENT_MODEL: process.env.AGENT_MODEL ?? "claude-sonnet-5",
  },
  ollama: {
    AGENT_PROVIDER: "anthropic",
    // The one seam that points the identical client at a local model.
    ANTHROPIC_BASE_URL:
      process.env.ANTHROPIC_BASE_URL ?? "http://localhost:11434",
    AGENT_MODEL: process.env.AGENT_MODEL ?? "qwen3:14b",
  },
  plain: {},
};

if (!(mode in forMode)) {
  console.error(`unknown mode "${mode}" — expected claude, ollama, or nothing`);
  process.exit(1);
}

// The agent is a separate project with its own package.json and its own
// lockfile — there is no workspace file joining them — so a root
// `pnpm install` never creates agent/node_modules. Without this check the
// failure is ERR_MODULE_NOT_FOUND on a transitive import, which reads as a
// broken repository rather than a missing install step. It went unnoticed
// for as long as it did because a machine that has ever run the agent
// already has the folder.
const agentDir = fileURLToPath(new URL("../agent", import.meta.url));
if (
  !existsSync(fileURLToPath(new URL("../agent/node_modules", import.meta.url)))
) {
  console.error(
    "\n  The agent has dependencies of its own, and they are not installed.\n" +
      "  Run this once:\n\n    pnpm agent:install\n\n" +
      "  (A root `pnpm install` does not reach them — the agent is a separate\n" +
      "   project so it can be deployed on its own.)\n",
  );
  process.exit(1);
}

const agent = spawn(
  process.execPath,
  [
    "--env-file-if-exists=../.env",
    "--experimental-strip-types",
    "src/server.ts",
  ],
  {
    // fileURLToPath, never `.pathname`: on Windows the latter is "/C:/…".
    cwd: agentDir,
    env: { ...process.env, ...forMode[mode], PORT },
    stdio: "inherit",
  },
);

agent.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => agent.kill(signal));
}
