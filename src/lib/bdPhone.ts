export function normalizeBdPhone(phone: string | null | undefined): string | null {
  let clean = String(phone || "").replace(/\D/g, "");
  if (clean.startsWith("880")) {
    const after = clean.slice(3);
    if (after.startsWith("01") && after.length === 11) clean = after;
    else if (after.startsWith("1") && after.length === 10) clean = `0${after}`;
  }
  return clean.length === 11 && clean.startsWith("01") ? clean : null;
}

// Numbers typed by a customer or staff: English digits only, as
// 01[3-9]XXXXXXXX or +8801[3-9]XXXXXXXX, ignoring spaces and dashes. Stored
// and imported numbers keep using the lenient normalizeBdPhone.
export function normalizeBdMobileInput(phone: string | null | undefined): string | null {
  if (typeof phone !== "string") return null;
  const match = /^(?:0|\+880)(1[3-9]\d{8})$/.exec(phone.replace(/[\s-]/g, ""));
  return match ? `0${match[1]}` : null;
}

export function bdWhatsAppHref(phone: string | null | undefined): string | null {
  const normalized = normalizeBdPhone(phone);
  return normalized ? `https://wa.me/88${normalized}` : null;
}
