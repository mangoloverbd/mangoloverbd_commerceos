import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  normalizeCampaignSlug, slugFromName, normalizeCampaignChannel,
  normalizeDestinationPath, buildCampaignUtm, isBotUserAgent,
  resolveCampaignAttribution, buildCampaignVisitorHash,
} from "../../server/campaignLinks.js";

const click = {
  id: "11111111-1111-4111-8111-111111111111",
  link_id: "22222222-2222-4222-8222-222222222222",
  org_id: "33333333-3333-4333-8333-333333333333",
  clicked_at: "2026-09-01T00:00:00.000Z", is_bot: false,
};

describe("campaign validation", () => {
  it("normalizes valid slugs and enforces both length boundaries", () => {
    expect(normalizeCampaignSlug(" Himsagar-Reel ")).toBe("himsagar-reel");
    expect(normalizeCampaignSlug("abc")).toBe("abc");
    expect(normalizeCampaignSlug("a".repeat(60))).toBe("a".repeat(60));
    for (const value of [null, 123, "ab", "a".repeat(61), "-abc", "abc-", "a--bc", "a/b", "a_b", "আম"]) {
      expect(normalizeCampaignSlug(value)).toBeUndefined();
    }
  });
  it("suggests bounded valid slugs from names, without inventing an empty slug", () => {
    expect(slugFromName("  Himsagar Reel #2!  ")).toBe("himsagar-reel-2");
    expect(slugFromName("Café Launch")).toBe("cafe-launch");
    expect(slugFromName("a".repeat(59) + " long name")).toBe("a".repeat(59));
    expect(slugFromName("!!!")).toBeUndefined();
  });
  it.each(["facebook", "instagram", "tiktok", "youtube", "whatsapp", "influencer", "print", "sms", "other"])("uses stored %s channel as the canonical UTM source", (channel) => {
    expect(normalizeCampaignChannel(` ${channel.toUpperCase()} `)).toBe(channel);
    expect(buildCampaignUtm({ channel, slug: "himsagar-reel" })).toEqual({
      utm_source: channel, utm_medium: "campaign_link", utm_campaign: "himsagar-reel",
    });
  });
  it("rejects unsupported channels", () => {
    for (const value of ["meta", "email", null, [], ""]) expect(normalizeCampaignChannel(value)).toBeUndefined();
  });
  it.each([
    ["/", "/"], ["/step/himsagar?variant=large&utm_source=custom#buy", "/step/himsagar?variant=large&utm_source=custom#buy"],
    ["/catalog/../step/himsagar", "/step/himsagar"], ["/আম", "/%E0%A6%86%E0%A6%AE"],
    ["/a?next=https%3A%2F%2Fevil.example", "/a?next=https%3A%2F%2Fevil.example"],
    ["/sale-50%25", "/sale-50%25"],
  ])("canonicalizes safe destination %s", (path, expected) => {
    expect(normalizeDestinationPath(path)).toBe(expected);
  });
  it.each([
    "https://www.mangolover.com.bd/a", "//evil.example", "///evil.example", "a", " /a", "/\\evil.example",
    "/a\n", "/a%0d%0aLocation:x", "/%5cevil", "/%2f%2fevil", "/%252f%252fevil", "/%zz", "/%E0%A4",
    "/go", "/go/abc", "/GO/abc", "/go?x=1", "/%67%6f/abc", "/%2567%256f/abc",
    "/a/../go/abc", "/a/%2e%2e/go/abc", "/a/%252e%252e/go/abc", "/go%2fabc", "/go%3fabc",
    "/a/..//evil.example", "/a/%2e%2e//evil.example", "/a/%252e%252e//evil.example",
    "/a/..//go/abc", "/" + "x".repeat(200),
  ])("rejects unsafe destination %s", (path) => {
    expect(normalizeDestinationPath(path)).toBeUndefined();
  });
});

describe("human click attribution", () => {
  it("does not extend the window for a captured checkout", () => {
    expect(resolveCampaignAttribution({ click, orgId: click.org_id, effectiveAt: new Date("2026-10-01T00:00:00.001Z") })).toEqual({});
  });
  it.each(["2026-09-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"])("accepts the inclusive boundary %s", (effectiveAt) => {
    expect(resolveCampaignAttribution({ click, orgId: click.org_id, effectiveAt })).toEqual({
      campaign_link_id: click.link_id, campaign_click_id: click.id, campaign_attributed_at: effectiveAt,
    });
  });
  it("uses submission time for holds, but conversion time for recovered drafts", () => {
    expect(resolveCampaignAttribution({ click, orgId: click.org_id, effectiveAt: "2026-09-30T00:00:00.000Z" }).campaign_click_id).toBe(click.id);
    expect(resolveCampaignAttribution({ click, orgId: click.org_id, effectiveAt: "2026-10-02T00:00:00.000Z" })).toEqual({});
  });
  it("accepts Supabase's microsecond timestamptz representation on real click rows", () => {
    expect(resolveCampaignAttribution({ click: { ...click, clicked_at: "2026-09-01T00:00:00.123456+00:00" }, orgId: click.org_id, effectiveAt: "2026-09-02T00:00:00.123Z" })).toEqual({
      campaign_link_id: click.link_id, campaign_click_id: click.id, campaign_attributed_at: "2026-09-02T00:00:00.123Z",
    });
  });
  it("rejects future clicks, invalid dates, bots and inconsistent associations", () => {
    for (const changed of [null, { ...click, is_bot: true }, { ...click, is_bot: undefined },
      { ...click, clicked_at: "bad" }, { ...click, clicked_at: null }, { ...click, clicked_at: "2026-02-30T00:00:00.000Z" },
      { ...click, id: "bad" }, { ...click, link_id: null }, { ...click, org_id: "other" },
      { ...click, link: { id: click.link_id, org_id: "other" } }, { ...click, link: { id: click.id, org_id: click.org_id } },
    ]) expect(resolveCampaignAttribution({ click: changed, orgId: click.org_id, effectiveAt: "2026-09-02T00:00:00.000Z" })).toEqual({});
    for (const effectiveAt of [null, "bad", "2026-08-31T23:59:59.999Z", "2026-02-30T00:00:00.000Z"]) {
      expect(resolveCampaignAttribution({ click, orgId: click.org_id, effectiveAt })).toEqual({});
    }
  });
});

describe("click quality", () => {
  it.each(["facebookexternalhit/1.1", "Facebot", "meta-externalagent/1.1", "meta-externalfetcher/1.1", "Twitterbot", "WhatsApp/2.23", "Slackbot-LinkExpanding", "TelegramBot", "Googlebot", "bingbot", "HeadlessChrome/123", "curl/8", "python-requests/2", "Discordbot/2.0", "LinkedInBot/1.0", "SkypeUriPreview", "Pinterestbot", "DuckDuckBot"])("recognizes preview/crawler %s", (ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });
  it.each([
    "Mozilla/5.0 (iPhone) AppleWebKit/605.1 [FBAN/FBIOS;FBAV/400]",
    "Mozilla/5.0 (Linux; Android) Chrome/120 Instagram 300.0",
    "Mozilla/5.0 (iPhone) AppleWebKit/605.1 WhatsApp/2.23 Mobile Safari/604.1",
    "Mozilla/5.0 Chrome/120 Safari/537.36", "", null,
  ])("does not treat real browser social markers as bots: %s", (ua) => {
    expect(isBotUserAgent(ua)).toBe(false);
  });
  it("domain-separates and keys visitor-days with bounded UA, day and IP", () => {
    const args = { ip: "203.0.113.1", userAgent: "Mozilla/5.0", dhakaDay: "2026-09-01", secret: "s".repeat(32) };
    const expected = createHmac("sha256", args.secret).update(JSON.stringify(["mlbd:campaign-visitor-day:v1", args.dhakaDay, args.ip, args.userAgent])).digest("hex");
    const hash = buildCampaignVisitorHash(args);
    expect(hash).toBe(expected);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    for (const changes of [{ ip: "203.0.113.2" }, { dhakaDay: "2026-09-02" }, { userAgent: "different" }, { secret: "t".repeat(32) }]) {
      expect(buildCampaignVisitorHash({ ...args, ...changes })).not.toBe(hash);
    }
    expect(buildCampaignVisitorHash({ ...args, userAgent: "a".repeat(400) + "tail" })).toBe(buildCampaignVisitorHash({ ...args, userAgent: "a".repeat(400) }));
  });
  it("does not mint a shared hash for untrustworthy/missing IP or invalid context", () => {
    const args = { ip: "203.0.113.1", userAgent: null, dhakaDay: "2026-09-01", secret: "s".repeat(32) };
    for (const changes of [{ ip: null }, { ip: "unknown" }, { ip: "1.2.3.4, 5.6.7.8" }, { secret: "short" }, { dhakaDay: "2026-02-30" }]) {
      expect(buildCampaignVisitorHash({ ...args, ...changes })).toBeUndefined();
    }
  });
});
