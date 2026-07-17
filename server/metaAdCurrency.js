export function convertMetaSpendToBdt(amount, currency, usdToBdt) {
  const normalizedCurrency = String(currency || "").trim().toUpperCase();
  if (normalizedCurrency === "BDT") return Number(amount.toFixed(2));
  if (normalizedCurrency === "USD") return Number((amount * usdToBdt).toFixed(2));
  return null;
}
