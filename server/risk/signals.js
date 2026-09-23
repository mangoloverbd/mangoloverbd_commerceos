export const FAMILIES = Object.freeze(["IDENTITY", "DEVICE", "NETWORK", "BEHAVIOUR", "CONTENT", "LOCATION", "HISTORY", "LIST"]);
export const SEVERITY_POINTS = Object.freeze({ critical: 100, high: 40, medium: 20, low: 10 });
export const THRESHOLDS = Object.freeze({
  holdScore: 40, blockScore: 100, blockMinHighFamilies: 2,
  fastCheckoutSeconds: 12, devicePhones7d: 3, phoneDevices7d: 3,
  deviceNetworks1h: 3, networkPhones24h: 4, phoneBurst15m: 2,
  deviceBurst15m: 3, phoneVelocity24h: 3, courierBadMinParcels: 3,
  courierBadRate: 50, courierStrongMinParcels: 5, courierStrongRate: 90,
  phoneRetypedCandidates: 3, unusualLineQuantity: 10,
});

const definitions = [
  // Password managers can fill hidden fields, so on its own this holds for a call.
  ["honeypot_filled", "BEHAVIOUR", "high", "Bot form fill"],
  ["blocklist_phone", "LIST", "critical", "Blocked phone"],
  ["blocklist_device", "LIST", "critical", "Blocked device"],
  ["blocklist_network", "LIST", "critical", "Blocked network"],
  ["abusive_content", "CONTENT", "critical", "Abusive text"],
  ["gibberish_content", "CONTENT", "critical", "Gibberish details"],
  ["test_content", "CONTENT", "critical", "Test/fake details"],
  ["device_many_phones", "DEVICE", "high", "One device, many phones"],
  ["phone_many_devices", "IDENTITY", "high", "One phone, many devices"],
  ["phone_fake_history", "HISTORY", "high", "Previous fake order"],
  ["device_fake_history", "HISTORY", "high", "Device linked to fake order"],
  ["phone_burst_15m", "IDENTITY", "high", "Repeat order in 15 min"],
  ["device_burst_15m", "DEVICE", "high", "Rapid repeat orders"],
  ["courier_bad_history", "HISTORY", "high", "Poor delivery record"],
  ["device_switching_networks", "NETWORK", "medium", "Device switching networks"],
  ["network_many_phones", "NETWORK", "medium", "One network, many phones"],
  ["hosting_or_vpn_network", "NETWORK", "medium", "VPN / foreign network"],
  ["phone_velocity_24h", "IDENTITY", "medium", "Velocity phone 24h"],
  ["courier_no_history", "HISTORY", "medium", "No delivery history"],
  ["address_incomplete", "CONTENT", "medium", "Incomplete address"],
  ["hater_region_ip", "LOCATION", "medium", "Hater region (network)"],
  ["hater_region_address", "LOCATION", "medium", "Hater region (address)"],
  ["phone_retyped", "BEHAVIOUR", "medium", "Phone changed repeatedly"],
  ["bot_check_failed", "BEHAVIOUR", "medium", "Bot check failed"],
  ["very_fast_checkout", "BEHAVIOUR", "low", "Very fast checkout"],
  ["phone_pasted", "BEHAVIOUR", "low", "Pasted details"],
  ["name_suspicious", "CONTENT", "low", "Suspicious name"],
  ["quantity_unusual", "BEHAVIOUR", "low", "Unusual quantity"],
  ["trusted_delivered_customer", "HISTORY", "trust", "Delivered before", -60],
  ["trusted_device", "DEVICE", "trust", "Trusted device", -40],
  ["courier_strong_history", "HISTORY", "trust", "Good delivery record", -15],
  ["staff_allowlist", "LIST", "trust", "Allowlisted", -100],
];

export const SIGNAL_DEFINITIONS = Object.freeze(Object.fromEntries(definitions.map(([code, family, severity, label, credit]) => [code,
  Object.freeze({ family, severity, points: credit ?? SEVERITY_POINTS[severity], label })])));

export function createSignal(code, evidence) {
  const definition = SIGNAL_DEFINITIONS[code];
  if (!definition) throw new TypeError("Unknown risk signal");
  if (typeof evidence !== "string" || !evidence.trim() || evidence.length > 240) throw new TypeError("Invalid risk evidence");
  return { code, ...definition, evidence: evidence.trim() };
}
