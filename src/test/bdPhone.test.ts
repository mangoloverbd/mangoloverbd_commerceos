import { describe, expect, it } from "vitest";
import { bdWhatsAppHref, normalizeBdPhone } from "@/lib/bdPhone";

describe("Bangladesh phone helpers", () => {
  it("normalizes local and international input", () => {
    expect(normalizeBdPhone("01712345678")).toBe("01712345678");
    expect(normalizeBdPhone("+880 1712-345678")).toBe("01712345678");
    expect(normalizeBdPhone("8801712345678")).toBe("01712345678");
  });

  it("rejects invalid numbers", () => {
    expect(normalizeBdPhone("0181234567")).toBeNull();
    expect(normalizeBdPhone("0121234567")).toBeNull();
    expect(normalizeBdPhone(null)).toBeNull();
  });

  it("builds a blank WhatsApp chat URL", () => {
    expect(bdWhatsAppHref("01712345678")).toBe("https://wa.me/8801712345678");
    expect(bdWhatsAppHref("bad phone")).toBeNull();
  });
});
