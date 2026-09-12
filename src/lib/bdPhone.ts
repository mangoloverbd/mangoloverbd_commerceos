export function normalizeBdPhone(phone: string | null | undefined): string | null {
  let clean = String(phone || "").replace(/\D/g, "");
  if (clean.startsWith("880")) {
    const after = clean.slice(3);
    if (after.startsWith("01") && after.length === 11) clean = after;
    else if (after.startsWith("1") && after.length === 10) clean = `0${after}`;
  }
  return clean.length === 11 && clean.startsWith("01") ? clean : null;
}

export function bdWhatsAppHref(phone: string | null | undefined): string | null {
  const normalized = normalizeBdPhone(phone);
  return normalized ? `https://wa.me/88${normalized}` : null;
}
