import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { ProviderError, type LlmProvider } from "./types";

/**
 * Claude adapter. Structured outputs are validated against a Zod schema by the SDK.
 * Server-side refusal fallbacks are enabled ("default" routing). A final `refusal` is surfaced as a
 * non-retryable error so the research task records it instead of fabricating a value.
 */
export class ClaudeLlm implements LlmProvider {
  name = "anthropic";
  private client: Anthropic;
  constructor(apiKey: string, public model: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  }

  async json<T>({ system, user, schema, maxTokens = 8000 }: { system: string; user: string; schema: z.ZodType<T>; maxTokens?: number }) {
    try {
      const res = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium", format: betaZodOutputFormat(schema as z.ZodType) },
        system,
        messages: [{ role: "user", content: user }],
      });
      if (res.stop_reason === "refusal") throw new ProviderError("The AI model declined this request.", false);
      if (res.parsed_output == null) throw new ProviderError("The AI response could not be parsed.", true);
      return {
        data: res.parsed_output as T,
        usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
      };
    } catch (e) {
      throw mapError(e);
    }
  }

  async text({ system, user, maxTokens = 4000 }: { system: string; user: string; maxTokens?: number }) {
    try {
      const res = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system,
        messages: [{ role: "user", content: user }],
      });
      if (res.stop_reason === "refusal") throw new ProviderError("The AI model declined this request.", false);
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
      return { text, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } };
    } catch (e) {
      throw mapError(e);
    }
  }
}

function mapError(e: unknown) {
  if (e instanceof ProviderError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new ProviderError("Anthropic API key is invalid.", false);
  if (e instanceof Anthropic.BadRequestError) return new ProviderError(`AI request rejected: ${e.message}`, false);
  if (e instanceof Anthropic.RateLimitError) return new ProviderError("AI provider rate limit reached.", true);
  if (e instanceof Anthropic.APIConnectionError) return new ProviderError("Could not reach the AI provider.", true);
  if (e instanceof Anthropic.APIError) return new ProviderError(`AI provider error: ${e.message}`, (e.status ?? 500) >= 500);
  return new ProviderError((e as Error)?.message ?? "AI error", true);
}
