import { describe, expect, it } from "vitest";
import { mapWithConcurrency, planCustomerSms } from "../../server/customerSms.js";
import { normalizeBdPhone } from "../../server/abandonedCheckouts.js";
import { CUSTOMER_SMS_TEMPLATES, smsSegments } from "@/lib/customerSms";

const customers = [
  { id: "01711111111", name: "Rahim", phone: "01711111111" },
  { id: "01822222222", name: "Unknown", phone: "+8801822222222" },
  { id: "name:karim", name: "Karim", phone: "" },
  { id: "dup", name: "Rahim again", phone: "8801711111111" },
];

describe("planCustomerSms", () => {
  it("personalises each message and falls back when the name is unknown", () => {
    const { recipients } = planCustomerSms({ customers, customerIds: ["01711111111", "01822222222"], message: "প্রিয় {{customer_name}}, ধন্যবাদ", normalizePhone: normalizeBdPhone });
    expect(recipients).toEqual([
      { phone: "01711111111", message: "প্রিয় Rahim, ধন্যবাদ" },
      { phone: "01822222222", message: "প্রিয় গ্রাহক, ধন্যবাদ" },
    ]);
  });

  it("skips customers without a phone, ignores unknown ids and sends once per number", () => {
    const { recipients, skipped } = planCustomerSms({ customers, customerIds: ["01711111111", "dup", "name:karim", "not-a-customer"], message: "Hi", normalizePhone: normalizeBdPhone });
    expect(recipients).toHaveLength(1);
    expect(skipped).toBe(2);
  });
});

describe("mapWithConcurrency", () => {
  it("keeps result order and never runs more than the limit at once", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (value: number) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value * 10;
    });
    expect(results).toEqual([10, 20, 30, 40, 50, 60]);
    expect(peak).toBe(2);
  });
});

describe("smsSegments", () => {
  it("counts plain-text SMS at 160 characters, then 153 per part", () => {
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("a".repeat(161))).toBe(2);
  });

  it("counts Bangla SMS at 70 characters, then 67 per part", () => {
    expect(smsSegments("ক".repeat(70))).toBe(1);
    expect(smsSegments("ক".repeat(71))).toBe(2);
    expect(smsSegments("")).toBe(0);
  });
});

describe("CUSTOMER_SMS_TEMPLATES", () => {
  it("only uses placeholders the composer knows how to fill", () => {
    for (const template of CUSTOMER_SMS_TEMPLATES) {
      const tokens = template.message.match(/\{\{[^}]+\}\}/g) || [];
      for (const token of tokens) expect(["{{customer_name}}", "{{store_phone}}"]).toContain(token);
    }
  });
});
