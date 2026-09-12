import { describe, expect, it, vi } from "vitest";
import { validateAddressWithAI } from "../../server/addressValidation.js";

describe("address validation", () => {
  it("uses GPT-4o-mini and returns structured address guidance", async () => {
    let request: Record<string, unknown> | undefined;
    const result = await validateAddressWithAI({
      customerName: "Test Customer",
      address: "House 1 Road 2 Dhaka",
      notes: "Please call before delivery",
      fetchImpl: vi.fn(async (_url, init) => {
        request = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            action: "allow",
            address_valid: true,
            address_present: true,
            abuse: false,
            test_or_fake: false,
            vague: false,
            risk_score: 5,
            reason: "specific",
          }) } }],
        }), { status: 200 });
      }),
      apiKey: "test-key",
    });

    expect(request?.model).toBe("gpt-4o-mini");
    const messages = request?.messages as Array<{ role: string; content: string }>;
    expect(JSON.parse(messages[1].content)).toEqual({
      customer_name: "Test Customer",
      address: "House 1 Road 2 Dhaka",
      notes: "Please call before delivery",
    });
    expect(result).toMatchObject({ action: "allow", addressValid: true, riskScore: 5 });
  });

  it("fails closed when the provider is unavailable", async () => {
    const result = await validateAddressWithAI({
      customerName: "Test Customer",
      address: "House 1 Road 2 Dhaka",
      fetchImpl: vi.fn(async () => new Response("down", { status: 503 })),
      apiKey: "test-key",
    });
    expect(result).toEqual({ unavailable: true });
  });
});
