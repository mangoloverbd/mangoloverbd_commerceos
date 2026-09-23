import { classifyContent } from "./content.js";
import { parseBdLocation } from "./location.js";
import { createSignal, THRESHOLDS } from "./signals.js";

const HATER_CITY_DISTRICTS = new Map([["rajshahi", "15"], ["natore", "16"], ["chapainawabganj", "18"], ["chapai nawabganj", "18"], ["naogaon", "19"]]);

export function detectSignals(ctx, facts, config = {}) {
  const signals = [];
  const add = (code, evidence) => signals.push(createSignal(code, evidence));
  const { links, attempts, history, courier, lists } = facts;
  const { customer, telemetry, network } = ctx;
  const location = parseBdLocation(customer.address);
  const districts = Array.isArray(config.haterDistrictIds) ? config.haterDistrictIds : ["15", "16", "18", "19"];
  if (ctx.honeypot) add("honeypot_filled", "The hidden checkout field was filled");
  const allowKinds = lists.allow.filter(kind => kind === "phone" || kind === "device" || (kind === "network" && network.type === "broadband"));
  if (allowKinds.length) add("staff_allowlist", `Staff allowlisted this ${allowKinds[0]}`);
  for (const kind of lists.block) {
    // Fingerprints are shared by identical phone models, and mobile networks by
    // thousands of carrier-NAT users; neither may block an order on its own.
    if (kind === "fingerprint" || (kind === "network" && network.type !== "broadband")) continue;
    add(kind === "network" ? "blocklist_network" : kind === "phone" ? "blocklist_phone" : "blocklist_device", `Staff blocklisted ${kind} identity`);
  }
  for (const code of classifyContent(customer, config.extraAbuseTerms || [])) add(code, "Customer details matched a prohibited content pattern");
  const detailWords = [customer.name, customer.address].join(" ").toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
  if (detailWords.some(word => /^(?:asdf\w*|qwer\w*|zxcv\w*|hjkl\w*)$/.test(word) || /(\p{L})\1{4,}/u.test(word))) add("gibberish_content", "Customer details contain keyboard or repeated-letter text");
  if (links.devicePhones7d >= THRESHOLDS.devicePhones7d) add("device_many_phones", `This device used ${links.devicePhones7d} phones in 7 days`);
  if (links.phoneDevices7d >= THRESHOLDS.phoneDevices7d) add("phone_many_devices", `This phone appeared on ${links.phoneDevices7d} devices in 7 days`);
  if (attempts.phone15m >= THRESHOLDS.phoneBurst15m) add("phone_burst_15m", `${attempts.phone15m} orders from this phone in 15 minutes`);
  if (attempts.device15m >= THRESHOLDS.deviceBurst15m) add("device_burst_15m", `${attempts.device15m} orders from this device in 15 minutes`);
  if (attempts.phone24h >= THRESHOLDS.phoneVelocity24h) add("phone_velocity_24h", `${attempts.phone24h} orders from this phone in 24 hours`);
  if (links.deviceNetworks1h >= THRESHOLDS.deviceNetworks1h) add("device_switching_networks", `This device used ${links.deviceNetworks1h} networks in an hour`);
  if (network.type !== "mobile" && links.networkPhones24h >= THRESHOLDS.networkPhones24h) add("network_many_phones", `${links.networkPhones24h} phones used this network in 24 hours`);
  if (network.type === "foreign") add("hosting_or_vpn_network", "The network appears outside Bangladesh");
  if (history.phoneFakeCancelled) add("phone_fake_history", `${history.phoneFakeCancelled} order(s) from this phone were confirmed fake`);
  if (history.deviceFakeCancelled) add("device_fake_history", `${history.deviceFakeCancelled} order(s) from this device were confirmed fake`);
  if (history.phoneDelivered && !history.phoneFakeCancelled) add("trusted_delivered_customer", `${history.phoneDelivered} order(s) were delivered to this phone`);
  if (history.deviceDelivered) add("trusted_device", `${history.deviceDelivered} order(s) from this device were delivered`);
  if (courier) {
    if (courier.totalParcels >= THRESHOLDS.courierBadMinParcels && courier.successRate < THRESHOLDS.courierBadRate) add("courier_bad_history", `Courier delivery success is ${courier.successRate}% across ${courier.totalParcels} parcels`);
    if (courier.totalParcels === 0) add("courier_no_history", "No courier parcel history was found");
    if (courier.totalParcels >= THRESHOLDS.courierStrongMinParcels && courier.successRate >= THRESHOLDS.courierStrongRate) add("courier_strong_history", `Courier delivery success is ${courier.successRate}% across ${courier.totalParcels} parcels`);
  }
  if (!location.hasPlaceMarker || !location.hasArea) add("address_incomplete", "The address needs a clearer place marker or area");
  if (districts.includes(location.districtId)) add("hater_region_address", `The address names ${location.districtName} district`);
  // Mobile-carrier IP geolocation in Bangladesh is unreliable (carrier NAT), so
  // only fixed broadband locations count as network location evidence.
  const ipDistrict = ctx.geo?.city ? HATER_CITY_DISTRICTS.get(ctx.geo.city.toLocaleLowerCase("en")) : null;
  if (ipDistrict && districts.includes(ipDistrict) && network.type === "broadband") add("hater_region_ip", `Broadband network location reports ${ctx.geo.city.slice(0, 80)}`);
  if (telemetry.phoneCandidates.length >= THRESHOLDS.phoneRetypedCandidates) add("phone_retyped", `${telemetry.phoneCandidates.length} valid phone numbers were entered`);
  // The storefront does not render Turnstile yet, so a missing token is not
  // evidence about the shopper. Only a token that was sent and rejected counts.
  if (ctx.turnstile === "failed") add("bot_check_failed", "The bot check was not completed successfully");
  if (telemetry.firstInteractionAt != null && ctx.now - telemetry.firstInteractionAt >= 0 && ctx.now - telemetry.firstInteractionAt < THRESHOLDS.fastCheckoutSeconds * 1000) add("very_fast_checkout", "Checkout completed less than 12 seconds after first interaction");
  if (telemetry.pastedFields.includes("phone") && telemetry.pastedFields.includes("address")) add("phone_pasted", "Phone and address were pasted during checkout");
  if (/\d/.test(customer.name) || customer.name.length === 1 || customer.name.toLowerCase() === customer.address.toLowerCase()) add("name_suspicious", "Customer name needs a closer look");
  if (ctx.items.some(item => item.quantity > THRESHOLDS.unusualLineQuantity)) add("quantity_unusual", "A line quantity exceeds the normal threshold");
  return signals;
}
