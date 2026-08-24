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

export function modelId(): string {
  return process.env.AGENT_MODEL ?? "claude-sonnet-5";
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
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("the model returned no JSON object");
  }
  return body.slice(start, end + 1);
}
