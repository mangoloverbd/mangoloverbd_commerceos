import { describe, expect, it } from "vitest";
import { detectSignals } from "../../server/risk/detect.js";

const ctx = {
  customer: { name: "Rahim Uddin", address: "", notes: "" },
  telemetry: { pastedFields: [], phoneCandidates: [], firstInteractionAt: null },
  network: { type: "mobile" }, geo: null, turnstile: "missing", honeypot: "", items: [{ quantity: 1 }], now: Date.now(),
};
const facts = {
  links: { devicePhones7d: 0, phoneDevices7d: 0, deviceNetworks1h: 0, networkPhones24h: 0 },
  attempts: { phone15m: 0, device15m: 0, phone24h: 0 },
  history: { phoneFakeCancelled: 0, deviceFakeCancelled: 0, phoneDelivered: 0, deviceDelivered: 0 },
  courier: null, lists: { allow: [], block: [] },
};
const incomplete = (address: string) => detectSignals({ ...ctx, customer: { ...ctx.customer, address } }, facts)
  .some(signal => signal.code === "address_incomplete");

describe("address completeness from place names", () => {
  it("accepts a named district plus another place, in English or Bangla", () => {
    for (const address of [
      "Chinishpur, Narsingdi Sadar, Narsingdi",
      "bagduli,pangsha,rajbari",
      "Noyapara Kashimpur gazipur",
      "কেওটখালী, সদর, ময়মনসিংহ",
      "scout satabdi Bhabon kakrail. Dhaka",
      "Sherpur bogura",
      "Ghior Manikgonj",
      "Hossainpur kishorganj",
      "Noyapara, madhabpur, habigonj",
    ]) expect(incomplete(address), address).toBe(false);
  });

  it("still flags a lone district or a lone place", () => {
    for (const address of ["Dhaka Bangladesh", "টংগিবাড়ী", "Dhaka", "গাজীপুর সদর", "near market", "Narsingdi Sadar Narsingdi", "জয়পুরহাট সদর জয়পুরহাট"]) {
      expect(incomplete(address), address).toBe(true);
    }
  });

  it("keeps accepting house and road style addresses", () => {
    expect(incomplete("House 1 Road 2 Dhaka")).toBe(false);
  });
});
