import { z } from "zod";
import { INFRAI_BASE_URL, InfraiError } from "../src/infrai_cost_client.js";

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string().optional() }).passthrough().optional(),
  metadata: z.unknown().optional()
});

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");

for (let attempt = 0; attempt < 4; attempt += 1) {
  const response = await fetch(`${INFRAI_BASE_URL}/account/budget/set`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "appointment-notifications-monthly-budget-v1"
    },
    body: JSON.stringify({
      hard_cap_usd: 100,
      period: "monthly",
      alert_threshold_usd: 80
    })
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
  if (response.status >= 500) throw new InfraiError("UPSTREAM_SERVICE", "Upstream service error", response.status);
  console.log(JSON.stringify(envelope.data, null, 2));
  break;
}
