import { describe, expect, it } from "vitest";
import { buildCustomerExportCsv } from "@/lib/customerExport";

describe("customer marketing export", () => {
  it("exports filtered customers with lifecycle and campaign fields as escaped CSV", () => {
    const csv = buildCustomerExportCsv([
      {
        name: 'Nadia "VIP" Rahman',
        phone: "01712345678",
        totalOrders: 3,
        totalSpent: 12500,
        averageOrderValue: 4167,
        primarySource: "shopify",
        sources: ["shopify", "facebook"],
        riskLevel: "low",
        lifecycleStage: "vip",
        campaignSegments: ["vip_loyalty", "review_request"],
        lastOrderAt: "2026-07-01T10:00:00Z",
      },
    ]);

    expect(csv.split("\n")[0]).toBe("Name,Phone,Lifecycle Stage,Campaign Segments,Primary Source,Sources,Orders,Total Spent,AOV,Risk,Last Order");
    expect(csv).toContain('"Nadia ""VIP"" Rahman",01712345678,VIP,"VIP Loyalty; Review Request",Shopify,"Shopify; Facebook",3,"৳12,500","৳4,167",Low,"Jul 1, 2026"');
  });
});
