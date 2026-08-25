/**
 * The model seam — the only place in the whole system that knows a model
 * exists (SPEC §6.1). Nothing under the web app's `src/` may import a model
 * SDK, and a test asserts that.
 *
 * `AGENT_PROVIDER` chooses the transport; everything downstream speaks the
 * identical Anthropic Messages API, so no code path differs by provider:
 *
 * - `anthropic` (default) — the Anthropic API. `ANTHROPIC_BASE_URL` can
 *   point it at a local Ollama (≥0.19 serves `/v1/messages` in this exact
 *   shape), which is how the gates get exercised without a bill.
 * - `bedrock` — AWS Bedrock. Credentials and region resolve through the
 *   standard AWS chain, so on ECS the task role is enough and there are no
 *   keys in the environment. Set `AGENT_MODEL` to the Bedrock model id.
 *
 * **A local model measures the harness, never the quality bar.** Its job is
 * to prove the gates reject what they should. Never read a quality
 * conclusion from an Ollama run.
 */
import type { Trouble } from "../../src/lib/agent-contract.ts";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";

export type ModelClient = Pick<Anthropic, "messages">;

export function modelClient(): ModelClient {
  const provider = process.env.AGENT_PROVIDER ?? "anthropic";
  if (provider === "bedrock") {
    return new AnthropicBedrock() as unknown as ModelClient;
  }
  if (provider !== "anthropic") {
    throw new Error(
      `unknown AGENT_PROVIDER '${provider}' — expected anthropic or bedrock`,
    );
  }
  // baseURL and apiKey both come from the environment; pointing baseURL at
  // Ollama needs no key, which is why the fallback is a placeholder rather
  // than a throw.
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "not-needed-for-local",
    baseURL: process.env.ANTHROPIC_BASE_URL,
  });
}

/**
 * What went wrong with a model call, in the shared vocabulary.
 *
 * The SDK's own error carries the status; everything below it is a network
 * fault reaching the API. Anything we cannot place is reported as
 * "unavailable" rather than guessed at — a wrong diagnosis sends somebody
 * to check a key that was never the problem.
 */
export function modelTrouble(cause: unknown): Trouble {
  const status = (cause as { status?: number })?.status;
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate";
  if (status === 500 || status === 503 || status === 529) return "overloaded";
  const code =
    (cause as { code?: string })?.code ??
    (cause as { cause?: { code?: string } })?.cause?.code;
  if (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET"
  ) {
    return "network";
  }
  return "unavailable";
}

export function modelId(): string {
  return process.env.AGENT_MODEL ?? "claude-sonnet-5";
}

/**
 * Which model this service is actually talking to, in words — reported on
 * /healthz so nobody has to infer it from environment variables. "anthropic
 * with a base URL override" is a local model; without one it is the real
 * Claude API, and those are very different things to be running.
 */
export function providerDescription(): string {
  const provider = process.env.AGENT_PROVIDER ?? "anthropic";
  if (provider === "bedrock") return "bedrock";
  const base = process.env.ANTHROPIC_BASE_URL;
  if (base) return `local (${base})`;
  return process.env.ANTHROPIC_API_KEY
    ? "anthropic-api"
    : "anthropic-api (no key set)";
}

/**
 * The text of a reply, ignoring anything that is not text.
 *
 * Reasoning models return `thinking` blocks before the answer. Taking
 * `content[0]` gets the model's private deliberation instead of its output —
 * observed first time out against qwen3, which spent its whole token budget
 * thinking and returned no text at all.
 */
export function textOf(message: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return message.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("")
    .trim();
}

/**
 * The first JSON object in a reply. Models wrap JSON in prose or a code
 * fence however firmly you ask them not to; that is a formatting quirk to
 * absorb here, not a provenance failure to reject.
 */
/**
 * Spell raw control characters inside string literals the way JSON needs.
 *
 * Outside a string they are whitespace and mean nothing; inside one they
 * are illegal, and a model writing a paragraph produces them constantly.
 * Tracks escapes so a backslash before a quote does not end the string.
 */
function escapeInsideStrings(json: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const char of json) {
    if (escaped) {
      out += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      out += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      out += char;
      continue;
    }
    if (inString && (char === "\n" || char === "\r" || char === "\t")) {
      out += char === "\n" ? "\\n" : char === "\r" ? "\\r" : "\\t";
      continue;
    }
    out += char;
  }
  return out;
}

export function extractJson(text: string): string {
  // Try the first fenced block, then every other fenced block, then the raw
  // text. A model that opens with an unrelated fence, or writes prose and
  // never fences at all, used to fail here as though it had said nothing —
  // and the caller reported that to a person as "nothing worth suggesting".
  const candidates: string[] = [];
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    if (match[1]) candidates.push(match[1]);
  }
  candidates.push(text);
  for (const body of candidates) {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) continue;
    const slice = body.slice(start, end + 1);
    try {
      JSON.parse(slice);
      return slice;
    } catch {
      // A long prose field is where this breaks: a model writing several
      // paragraphs puts real newlines inside the string rather than \n, and
      // that is not JSON however well-formed the rest of it is. Escaping
      // them is a repair, not a guess — the characters are kept exactly,
      // only spelled the way the format requires.
      const repaired = escapeInsideStrings(slice);
      if (repaired !== slice) {
        try {
          JSON.parse(repaired);
          return repaired;
        } catch {
          // Still not it; fall through to the next candidate.
        }
      }
      // Not this one — a fence holding an example, or a truncated tail.
    }
  }
  // Say what could not be parsed. Every capability funnels its failures
  // through this one sentence, and "no JSON object" has now sent me looking
  // in the wrong place three times.
  console.error(
    "[extractJson] nothing parseable in:",
    JSON.stringify(text.slice(0, 300)),
  );
  throw new Error("the model returned no JSON object");
}
