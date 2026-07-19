import crypto from "crypto";

// Warm-token gate for public storefront cache warming. A request carrying
// the correct X-Warm-Token bypasses the public read rate limiter so a
// purge re-warm storm can't lock out its own cache warming.
// Comparison is constant-time (crypto.timingSafeEqual) to avoid a token
// timing oracle.
export function isWarmRequest(req, warmToken = process.env.WARM_TOKEN || "") {
  if (!warmToken) return false;
  const token = req.headers["x-warm-token"] || "";
  if (!token) return false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(warmToken);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
