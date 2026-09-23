import { describe, expect, it } from "vitest";
import { detectSignals } from "../../server/risk/detect.js";

const ctx = {
  customer: { name: "Rahim Uddin", address: "House 1 Road 2 Dhaka", notes: "" },
  items: [{ quantity: 1 }], honeypot: "", turnstile: "ok", now: 1_800_000_000_000,
  hashes: { phone: "a", device: "b", fingerprint: "c", network: "d" },
  geo: { country: "BD", region: "BD-C", city: "Dhaka" }, network: { type: "mobile" },
  telemetry: { firstInteractionAt: null, phoneCandidates: [], pastedFields: [] },
};
const facts = {
  links: { devicePhones7d: 1, phoneDevices7d: 1, deviceNetworks1h: 1, networkPhones24h: 0 },
  attempts: { phone15m: 1, phone24h: 1, device15m: 1 },
  history: { phoneDelivered: 0, phoneFakeCancelled: 0, deviceDelivered: 0, deviceFakeCancelled: 0 },
  courier: null, lists: { block: [], allow: [] }, unavailable: [],
};
const codes = (c = ctx, f = facts) => detectSignals(c, f, { haterDistrictIds: ["15", "16", "18", "19"], extraAbuseTerms: [] }).map(s => s.code);

describe("risk detectors", () => {
  it("uses inclusive attempt and identity thresholds", () => {
    expect(codes(ctx, { ...facts, links: { devicePhones7d: 3, phoneDevices7d: 3, deviceNetworks1h: 3, networkPhones24h: 4 }, attempts: { phone15m: 2, phone24h: 3, device15m: 3 } })).toEqual(expect.arrayContaining(["device_many_phones", "phone_many_devices", "device_switching_networks", "phone_burst_15m", "phone_velocity_24h", "device_burst_15m"]));
    expect(codes({ ...ctx, network: { type: "broadband" } }, { ...facts, links: { ...facts.links, networkPhones24h: 4 } })).toContain("network_many_phones");
    expect(codes(ctx, { ...facts, links: { ...facts.links, networkPhones24h: 4 } })).not.toContain("network_many_phones");
  });

  it("treats all four districts as location evidence, not an automatic block", () => {
    expect(codes({ ...ctx, customer: { ...ctx.customer, address: "House 1 Road 2 Rajshahi" } })).toContain("hater_region_address");
    expect(codes({ ...ctx, customer: { ...ctx.customer, address: "House 1 Road 2 Shibganj" } })).not.toContain("hater_region_address");
    expect(codes({ ...ctx, geo: { country: "BD", region: "E", city: "Bogura" } })).not.toContain("hater_region_ip");
    expect(codes({ ...ctx, geo: { country: "BD", region: "E", city: "Natore" } })).toContain("hater_region_ip");
  });

  it("adds independent content, bot, history, list and trust signals", () => {
    const suspicious = { ...ctx, honeypot: "filled", turnstile: "failed", network: { type: "foreign" }, items: [{ quantity: 11 }], customer: { name: "Test", address: "near market", notes: "f.u.c.k" } };
    const history = { ...facts, history: { phoneDelivered: 1, phoneFakeCancelled: 1, deviceDelivered: 1, deviceFakeCancelled: 1 }, courier: { totalParcels: 3, successRate: 30 }, lists: { block: ["phone"], allow: ["device"] } };
    expect(codes(suspicious, history)).toEqual(expect.arrayContaining(["honeypot_filled", "bot_check_failed", "hosting_or_vpn_network", "quantity_unusual", "test_content", "abusive_content", "address_incomplete", "phone_fake_history", "device_fake_history", "courier_bad_history", "blocklist_phone", "staff_allowlist", "trusted_device"]));
    expect(codes(ctx, { ...facts, courier: { totalParcels: 5, successRate: 90 }, history: { ...facts.history, phoneDelivered: 1 } })).toEqual(expect.arrayContaining(["courier_strong_history", "trusted_delivered_customer"]));
  });
});
