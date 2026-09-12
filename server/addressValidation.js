const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 5000;

function extractJson(content) {
  if (typeof content !== "string") return null;
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeProviderResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value;
  const riskScore = Number(result.riskScore ?? result.risk_score);
  const addressValid = result.addressValid ?? result.address_valid;
  const addressPresent = result.addressPresent ?? result.address_present;
  if (!Number.isSafeInteger(riskScore) || riskScore < 0 || riskScore > 100
    || typeof addressValid !== "boolean"
    || typeof addressPresent !== "boolean") return null;
  if (!["allow", "review", "block"].includes(result.action)) return null;
  return {
    action: result.action,
    addressValid,
    addressPresent,
    abuse: result.abuse === true,
    testOrFake: result.testOrFake === true || result.test_or_fake === true,
    vague: result.vague === true,
    riskScore,
    reason: typeof result.reason === "string" ? result.reason.slice(0, 240) : "",
  };
}

export async function validateAddressWithAI({
  customerName,
  address,
  notes = "",
  fetchImpl = fetch,
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.ADDRESS_VALIDATION_MODEL || DEFAULT_MODEL,
  provider = process.env.ADDRESS_VALIDATION_PROVIDER || "openai",
  baseUrl = process.env.ADDRESS_VALIDATION_BASE_URL || "https://api.openai.com/v1",
  timeoutMs = Number(process.env.ADDRESS_VALIDATION_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
} = {}) {
  if (provider.toLowerCase() !== "openai" || !apiKey || typeof customerName !== "string" || typeof address !== "string") return { unavailable: true };
  try {
    const controller = typeof AbortSignal.timeout === "function" ? null : new AbortController();
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "order_address_assessment",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                action: { type: "string", enum: ["allow", "review", "block"] },
                address_valid: { type: "boolean" },
                address_present: { type: "boolean" },
                abuse: { type: "boolean" },
                test_or_fake: { type: "boolean" },
                vague: { type: "boolean" },
                risk_score: { type: "integer", minimum: 0, maximum: 100 },
                reason: { type: "string", maxLength: 240 },
              },
              required: [
                "action",
                "address_valid",
                "address_present",
                "abuse",
                "test_or_fake",
                "vague",
                "risk_score",
                "reason",
              ],
            },
          },
        },
        messages: [
          {
            role: "system",
            content: "Assess a Bangladesh delivery order's customer-supplied text. Check whether the address is a plausible, specific deliverable location rather than random letters, gibberish, a joke, a placeholder, or a fake/test address. Check the address and notes for harassment, profanity, sexual abuse, threats, or other abusive content. Use review for an understandable but incomplete or uncertain address. Use block for gibberish, fake/test content, abuse, or an invalid/non-deliverable address. Use allow only when the address is plausibly deliverable and the text is not abusive. Do not infer identity or contact anyone. Return only the requested JSON fields.",
          },
          { role: "user", content: JSON.stringify({ customer_name: customerName, address, notes }) },
        ],
      }),
      signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(timeoutMs) : controller.signal,
    });
    if (!response.ok) return { unavailable: true };
    const payload = await response.json();
    return normalizeProviderResult(extractJson(payload?.choices?.[0]?.message?.content)) || { unavailable: true };
  } catch {
    return { unavailable: true };
  }
}
