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
  if (!Number.isSafeInteger(riskScore) || riskScore < 0 || riskScore > 100) return null;
  if (!["allow", "review", "block"].includes(result.action)) return null;
  return {
    action: result.action,
    addressPresent: result.addressPresent ?? result.address_present ?? true,
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
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Validate only delivery-address specificity. Return JSON with action (allow|review|block), risk_score (0-100), and reason. Do not infer identity or contact anyone." },
          { role: "user", content: JSON.stringify({ customer_name: customerName, address }) },
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
