#!/usr/bin/env node
/**
 * The whole product, AI included, in one command.
 *
 * The agent is off by default and that is deliberate (SPEC §7): a
 * capability that is not connected must be unreachable, not present and
 * apologetic. But it meant seeing your own AI features took a two-part
 * incantation nobody should have to remember, which is its own friction.
 *
 * This starts the agent, waits until it actually answers, then starts the
 * web app pointed at it. Ctrl-C stops both.
 */
import { spawn } from "node:child_process";
// fileURLToPath, never `.pathname`: on Windows the latter yields "/C:/…".
import { fileURLToPath } from "node:url";

// The check below says "put it in .env"; this is what makes that true here
// as well as in the agent it spawns.
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch {
  // No .env is a normal way to run this — the local model needs no key.
}

const AGENT_PORT = Number(process.env.AGENT_PORT ?? 8790);
const AGENT_URL = `http://localhost:${AGENT_PORT}`;
/**
 * Two ways to run the agent, chosen by AGENT_MODE:
 *   ollama (default) — free, local, exercises the gates
 *   claude           — the real Claude API, needs ANTHROPIC_API_KEY
 * Bedrock is the third and belongs to a deployment, not to a dev script.
 */
// A flag, not a leading VAR=value: the latter is POSIX shell syntax and is
// not an assignment on Windows at all. AGENT_MODE still works for anyone
// who already exports it.
const MODE = process.argv.includes("--claude")
  ? "claude"
  : (process.env.AGENT_MODE ?? "ollama");
const USING_CLAUDE = MODE === "claude";
const OLLAMA = process.env.ANTHROPIC_BASE_URL ?? "http://localhost:11434";
const MODEL =
  process.env.AGENT_MODEL ?? (USING_CLAUDE ? "claude-sonnet-5" : "qwen3:14b");

const say = (m) => console.log(`\x1b[36m[dev:ai]\x1b[0m ${m}`);

/** Is something already answering there? Reuse it rather than fighting it. */
async function alreadyUp() {
  try {
    const r = await fetch(`${AGENT_URL}/healthz`, {
      signal: AbortSignal.timeout(1500),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Ollama has to be running, and it is a better error than a stack trace. */
async function ollamaReachable() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

const children = [];
const stop = () => {
  for (const child of children) child.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

if (USING_CLAUDE && !process.env.ANTHROPIC_API_KEY) {
  console.error(
    `\n  ANTHROPIC_API_KEY is not set, so there is nothing to talk to.\n` +
      `  Put it in .env, or run \`pnpm dev:ai\` to use the local model instead.\n`,
  );
  process.exit(1);
}

if (!USING_CLAUDE && !(await ollamaReachable())) {
  console.error(
    `\n  The local model is not answering at ${OLLAMA}.\n` +
      `  Start it with:  ollama serve\n` +
      `  Then run this again — or run plain \`pnpm dev\` for the product with no AI.\n`,
  );
  process.exit(1);
}

if (await alreadyUp()) {
  say(`an agent is already answering on ${AGENT_PORT} — using it`);
} else {
  say(
    `starting the agent on ${AGENT_PORT} — ${USING_CLAUDE ? "Claude API" : "local"}, ${MODEL}`,
  );
  // The agent is its own process and gets none of Next's .env loading, so
  // it asks Node for the file directly. Without this it started with no key
  // at all and the API reported the SDK's placeholder as an invalid key —
  // which reads, from the outside, exactly like a bad key in .env.
  const agent = spawn(
    "node",
    [
      "--env-file-if-exists=../.env",
      "--experimental-strip-types",
      "src/server.ts",
    ],
    {
      cwd: fileURLToPath(new URL("../agent", import.meta.url)),
      env: {
        ...process.env,
        AGENT_PROVIDER: "anthropic",
        // No base URL for the Claude API — that override is what makes the
        // identical client talk to a local model instead.
        ...(USING_CLAUDE ? {} : { ANTHROPIC_BASE_URL: OLLAMA }),
        AGENT_MODEL: MODEL,
        PORT: String(AGENT_PORT),
      },
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  children.push(agent);

  // Wait until it actually answers. Starting the web app first would show
  // the product with no AI and look exactly like the thing this fixes.
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await alreadyUp()) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!(await alreadyUp())) {
    console.error(
      `\n  The agent did not come up on ${AGENT_PORT}. Its output is above.\n`,
    );
    stop();
  }
  say("agent is answering");
}

say(
  "starting the web app with the assistant connected — http://localhost:3100",
);
// shell: true — on Windows the executable is pnpm.cmd, and spawn without a
// shell does not resolve it.
const web = spawn("pnpm", ["dev"], {
  shell: process.platform === "win32",
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: { ...process.env, AGENT_TRANSPORT: "local", AGENT_URL },
  stdio: ["ignore", "inherit", "inherit"],
});
children.push(web);
web.on("exit", stop);
