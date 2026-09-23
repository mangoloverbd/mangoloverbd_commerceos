import { isIP } from "node:net";

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
