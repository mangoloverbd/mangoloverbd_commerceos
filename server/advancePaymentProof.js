// Proof that an advance / partial payment was actually received: the wallet or
// bank it came through and a TrxID or the sender's last 4 digits. Proof is
// optional, and is always cleared when there is no advance.
export const ADVANCE_PAYMENT_METHODS = ["bkash", "nagad", "rocket", "bank"];

const REFERENCE_PATTERN = /^[A-Z0-9 #/-]{4,40}$/;

export function normalizeAdvancePaymentProof({ advance, method, reference }) {
  if (!(Number(advance) > 0)) {
    return { ok: true, value: { advance_payment_method: null, advance_payment_reference: null } };
  }

  const cleanMethod = typeof method === "string" ? method.trim().toLowerCase() : "";
  if (cleanMethod && !ADVANCE_PAYMENT_METHODS.includes(cleanMethod)) {
    return { ok: false, error: "Invalid advance payment method" };
  }

  const cleanReference =
    typeof reference === "string" ? reference.trim().replace(/\s+/g, " ").toUpperCase() : "";
  if (cleanReference && !REFERENCE_PATTERN.test(cleanReference)) {
    return {
      ok: false,
      error: "Payment reference must be 4–40 letters or digits (TrxID or last 4 digits)",
    };
  }

  return {
    ok: true,
    value: {
      advance_payment_method: cleanMethod || null,
      advance_payment_reference: cleanReference || null,
    },
  };
}
