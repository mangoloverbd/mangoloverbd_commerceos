import { isIP } from "node:net";
import networks from "./dictionaries/bdNetworks.json" with { type: "json" };

export const MOBILE_ASNS = Object.freeze([24389, 24432, 45245, 45925]);

function numericIp(ip) {
  if (isIP(ip) === 4) return { family: "v4", value: ip.split(".").reduce((value, octet) => (value << 8n) + BigInt(octet), 0n) };
  if (isIP(ip) !== 6) return null;
  const groups = ipv6Groups(ip);
  if (!groups) return null;
  if (groups.slice(0, 5).every(value => value === 0) && groups[5] === 0xffff) {
    return { family: "v4", value: (BigInt(groups[6]) << 16n) + BigInt(groups[7]) };
  }
  return { family: "v6", value: groups.reduce((value, group) => (value << 16n) + BigInt(group), 0n) };
}

const ranges = Object.fromEntries(["v4", "v6"].map(family => [family, networks.ranges[family].map(([start, end, asn]) => [numericIp(start)?.value, numericIp(end)?.value, asn]).filter(([start, end]) => start != null && end != null).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)]));

export function lookupAsn(ip) {
  const target = typeof ip === "string" ? numericIp(ip) : null;
  if (!target) return null;
  const entries = ranges[target.family];
  let low = 0, high = entries.length - 1, candidate = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (entries[mid][0] <= target.value) { candidate = mid; low = mid + 1; }
    else high = mid - 1;
  }
  // Ranges normally do not overlap, but check preceding candidates for longest coverage.
  for (let index = candidate; index >= 0 && index >= candidate - 8; index--) {
    if (target.value <= entries[index][1]) return entries[index][2];
  }
  return null;
}

export function classifyNetwork({ ip, country } = {}) {
  const asn = lookupAsn(ip);
  if (asn != null) return { type: MOBILE_ASNS.includes(asn) ? "mobile" : "broadband", asn };
  if (typeof country === "string" && country.toUpperCase() !== "BD") return { type: "foreign", asn: null };
  return { type: "unknown", asn: null };
}

const first = (value) => (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();
const valid = (value) => typeof value === "string" && !value.includes("%") && isIP(value.trim()) ? value.trim() : null;

export function getTrustedRequestIp(req) {
  for (const header of ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"]) {
    const ip = valid(first(req?.headers?.[header]));
    if (ip) return ip;
  }
  return valid(req?.socket?.remoteAddress);
}

function ipv6Groups(ip) {
  let source = ip.toLowerCase();
  const suffix = source.slice(source.lastIndexOf(":") + 1);
  if (suffix.includes(".")) {
    const [a, b, c, d] = suffix.split(".").map(Number);
    source = `${source.slice(0, source.lastIndexOf(":") + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = source.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 && missing < 1) return null;
  const groups = halves.length === 2 ? [...head, ...Array(missing).fill("0"), ...tail] : head;
  return groups.length === 8 && groups.every((value) => /^[0-9a-f]{1,4}$/.test(value))
    ? groups.map((value) => Number.parseInt(value, 16)) : null;
}

export function networkKey(ip) {
  const address = valid(ip);
  if (!address) return null;
  const v4 = (value) => `v4:${value.split(".").slice(0, 3).map(Number).join(".")}.0/24`;
  if (isIP(address) === 4) return v4(address);
  const groups = ipv6Groups(address);
  if (!groups) return null;
  if (groups.slice(0, 5).every((value) => value === 0) && groups[5] === 0xffff) {
    return v4([groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join("."));
  }
  return `v6:${groups.slice(0, 4).map((value) => value.toString(16)).join(":")}::/64`;
}
