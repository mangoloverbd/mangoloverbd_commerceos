import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { campaignReceiptPayload, persistCampaignEvent, signCampaignReceipt, verifyCampaignReceipt } from "../../server/campaignEvents.js";
import { database, handlers, http, orgId, foreignOrg, uuid } from "./campaignHandlerHarness";

const secret = "test-secret-that-is-at-least-32-characters-long";
const now = Date.parse("2026-10-03T12:00:00.000Z");
const event = {
  v: 1,
  handle: "mangoloverbd",
  linkId: "11111111-1111-4111-8111-111111111111",
  clickId: randomUUID(),
  clickedAt: new Date(now - 1000).toISOString(),
  isBot: false,
  visitorHash: "a".repeat(64),
  referrerHost: "facebook.com",
  device: "mobile",
};

describe("campaign receipt signatures", () => {
  it("authenticates bounded event data and preserves the original click timestamp", () => {
    const token = signCampaignReceipt(event, secret);
    expect(verifyCampaignReceipt(token, secret, { now })).toEqual(event);
  });

  it("rejects forged, expired, future, malformed, and bot-attribution receipts", () => {
    const token = signCampaignReceipt(event, secret);
    expect(verifyCampaignReceipt(`${token.slice(0, -1)}x`, secret, { now })).toBeUndefined();
    expect(verifyCampaignReceipt(signCampaignReceipt({ ...event, clickedAt: new Date(now - 31 * 86400000).toISOString() }, secret), secret, { now })).toBeUndefined();
    expect(verifyCampaignReceipt(signCampaignReceipt({ ...event, clickedAt: new Date(now + 60_001).toISOString() }, secret), secret, { now })).toBeUndefined();
    expect(verifyCampaignReceipt(signCampaignReceipt({ ...event, isBot: true }, secret), secret, { now })).toMatchObject({ isBot: true });
    expect(verifyCampaignReceipt("x".repeat(5000), secret, { now })).toBeUndefined();
  });

  it("uses a distinct versioned HMAC domain", () => {
    const token = signCampaignReceipt(event, secret);
    const [payload, signature] = token.split(".");
    expect(signature).toBe(createHmac("sha256", secret).update(`campaign-receipt-v1:${payload}`).digest("hex"));
    expect(campaignReceiptPayload(event)).toBe(payload);
  });

  it("persists only signed receipts in the fixed workspace and rejects foreign handles", async () => {
    process.env.CAMPAIGN_EDGE_SECRET = secret;
    const foreignLinkId = uuid(91);
    const db = database({ campaign_links: [{ id: event.linkId, org_id: orgId, slug: "mango-reel" }, { id: foreignLinkId, org_id: foreignOrg, slug: "foreign" }] });
    const { app } = handlers(db);
    const token = signCampaignReceipt(event, secret);
    expect((await http(app, "POST", "/api/public/v1/mangoloverbd/campaign-click-events", undefined, { "x-mlbd-campaign-receipt": token })).status).toBe(202);
    expect(db.tables.campaign_link_clicks[0]).toMatchObject({ id: event.clickId, org_id: orgId, link_id: event.linkId, clicked_at: event.clickedAt });
    expect((await http(app, "POST", "/api/public/v1/foreign/campaign-click-events", undefined, { "x-mlbd-campaign-receipt": token })).status).toBe(401);
    expect((await http(app, "POST", "/api/public/v1/mangoloverbd/campaign-click-events", undefined, { "x-mlbd-campaign-receipt": "forged" })).status).toBe(401);
    const foreignToken = signCampaignReceipt({ ...event, clickId: randomUUID(), linkId: foreignLinkId }, secret);
    expect((await http(app, "POST", "/api/public/v1/mangoloverbd/campaign-click-events", undefined, { "x-mlbd-campaign-receipt": foreignToken })).status).toBe(404);
    expect(db.tables.campaign_link_clicks).toHaveLength(1);
    delete process.env.CAMPAIGN_EDGE_SECRET;
  });

  it("accepts exact idempotent retries but refuses an existing request UUID bound to another link", async () => {
    const db = database();
    await persistCampaignEvent(db, orgId, event);
    await expect(persistCampaignEvent(db, orgId, event)).resolves.toMatchObject({ id: event.clickId, link_id: event.linkId });
    await expect(persistCampaignEvent(db, orgId, { ...event, linkId: uuid(88) })).rejects.toThrow('campaign_event_conflict');
    expect(db.tables.campaign_link_clicks).toHaveLength(1);
  });
});
