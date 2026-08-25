/**
 * Load the repository's .env, and let it win.
 *
 * Node's own `--env-file` yields to anything already exported by the shell,
 * which is the usual precedence and was exactly wrong here: a stale
 * ANTHROPIC_API_KEY exported from a shell profile silently shadowed the
 * working key in .env, and the API's reply — "API key is invalid" — sent
 * everyone to check the file that was already correct. The failure was
 * indistinguishable from a bad key in .env, which is the worst kind of
 * failure: it makes the fix look like the problem.
 *
 * So within this project the project's file is authoritative, and which key
 * won is printed at startup rather than left to be deduced from a 401.
 *
 * This is deliberately not a dotenv dependency. It reads KEY=value lines,
 * strips one layer of matching quotes, and ignores everything else — the
 * only .env this ever reads is the one in this repository.
 */
import { readFileSync } from "node:fs";
// fileURLToPath, never `.pathname`: on Windows a file URL's pathname is
// "/C:/…", which is not a path any filesystem call accepts.
import { fileURLToPath } from "node:url";

/** Where the value in use came from, for the startup line. */
export type EnvSource = "project .env" | "the environment" | "unset";

function parse(text: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const at = trimmed.indexOf("=");
    if (at < 1) continue;
    const key = trimmed.slice(0, at).trim();
    let value = trimmed.slice(at + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    found.set(key, value);
  }
  return found;
}

/**
 * Apply .env over the current environment. Returns where each named
 * variable ended up coming from, so startup can report it.
 */
export function loadProjectEnv(
  path = fileURLToPath(new URL("../../.env", import.meta.url)),
  report: string[] = ["ANTHROPIC_API_KEY", "AGENT_MODEL", "AGENT_PROVIDER"],
): Record<string, EnvSource> {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    // No .env is a normal way to run this — the local model needs no key.
  }
  const fromFile = parse(text);
  const sources: Record<string, EnvSource> = {};
  for (const name of report) {
    sources[name] = fromFile.has(name)
      ? "project .env"
      : process.env[name]
        ? "the environment"
        : "unset";
  }
  for (const [key, value] of fromFile) process.env[key] = value;
  return sources;
}
