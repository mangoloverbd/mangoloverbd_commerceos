const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TIMEOUT_MS = 5_000;

export async function verifyTurnstileToken({ token, remoteIp, secret, fetchImpl = fetch } = {}) {
  if (typeof token !== "string" || !token.trim() || typeof secret !== "string" || !secret.trim()) {
    return { ok: false };
  }

  const body = new URLSearchParams({ secret, response: token.trim() });
  if (typeof remoteIp === "string" && remoteIp.trim()) body.set("remoteip", remoteIp.trim());

  try {
    const signal = typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(TURNSTILE_TIMEOUT_MS)
      : undefined;
    const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      ...(signal ? { signal } : {}),
    });
    if (response.status >= 500) return { ok: false, unavailable: true };
    const payload = await response.json();
    return { ok: payload?.success === true };
  } catch {
    return { ok: false, unavailable: true };
  }
}
