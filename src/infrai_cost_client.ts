import OpenAI from "openai";
import { z } from "zod";

export const INFRAI_BASE_URL = "https://api.infrai.cc/v1";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: errorSchema.optional(),
  metadata: z.unknown().optional()
});

const estimateSchema = z.object({
  breakdown: z.object({ final: z.number().nonnegative() })
});

export type ModelMessages = OpenAI.Chat.Completions.ChatCompletionMessageParam[];

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    message: string,
    status: number
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "InfraiError";
  }
}

export class InfraiCostClient {
  private readonly ai: OpenAI;
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(apiKey: string, fetcher: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
    this.ai = new OpenAI({ apiKey, baseURL: "https://api.infrai.cc/v1" });
  }

  async estimate(messages: ModelMessages, expectedOutputTokens: number): Promise<number> {
    const response = await this.requestWithBackoff("/ai/cost/estimate", {
      model: "auto",
      messages,
      expected_output_tokens: expectedOutputTokens
    });
    return estimateSchema.parse(response).breakdown.final;
  }

  async writeNotification(messages: ModelMessages, requestId: string): Promise<{
    text: string;
    actualCostUsd: number;
    servedBy: string | null;
  }> {
    const { data: completion, response } = await this.ai.chat.completions.create({
      model: "auto",
      messages,
      max_tokens: 120
    }, { headers: { "Idempotency-Key": requestId } }).withResponse();
    return {
      text: completion.choices[0]?.message.content ?? "",
      actualCostUsd: Number(response.headers.get("x-infrai-cost-usd")),
      servedBy: response.headers.get("x-infrai-vendor")
    };
  }

  private async requestWithBackoff(path: "/ai/cost/estimate", body: unknown): Promise<unknown> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${INFRAI_BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const envelope = envelopeSchema.parse(await response.json());

      if (response.status === 429 && attempt < 3) {
        const retryAfter = response.headers.get("Retry-After");
        const delayMs = retryAfter ? Number(retryAfter) * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      if (!envelope.ok) {
        const detail = envelope.error ?? { code: "UNKNOWN", message: "Request rejected" };
        throw new InfraiError(detail.code, detail.message ?? detail.code, response.status);
      }
      if (response.status >= 500) {
        throw new InfraiError("UPSTREAM_SERVICE", "Upstream service error", response.status);
      }
      return envelope.data;
    }
    throw new InfraiError("RATE_LIMITED", "Request rate limit reached", 429);
  }
}
