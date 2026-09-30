import assert from "node:assert/strict";
import test from "node:test";
import { InfraiCostClient } from "../src/infrai_cost_client.js";

test("reads the final estimate from the cost breakdown", async () => {
  const fetcher = async () => new Response(JSON.stringify({
    ok: true,
    data: {
      model: "azure_foundry/gpt-5.4-mini",
      breakdown: { currency: "USD", final: 0.00064024 }
    }
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  const client = new InfraiCostClient("test-key", fetcher as typeof fetch);

  const estimate = await client.estimate([{ role: "user", content: "test" }], 120);

  assert.equal(estimate, 0.00064024);
});
