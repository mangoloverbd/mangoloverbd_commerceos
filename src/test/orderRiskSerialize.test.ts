import { expect, it } from "vitest";
import { buildDisplayHint, toAttemptDetail, toAttemptSummary } from "../../server/risk/serialize.js";

const row = { id: "a", org_id: "o", created_at: "2026-09-23T10:00:00Z", decision: "BLOCK", score: 100, mode: "active", customer_name: "Mina", phone: "01712345448", address: "Rajshahi", parsed_district: "Rajshahi", total: 800, phone_hash: "p".repeat(64), device_hash: "abcdef123456", fingerprint_hash: "123456789abc", network_hash: "fedcba987654", ip_hash: "i".repeat(64), user_agent_hash: "u".repeat(64), ip_prefix: "103.12.44.0/24", signals: [{ code: "low", severity: "low" }, { code: "critical", severity: "critical" }] };

it("provides severity-ranked staff views without full hashes", () => {
  expect(toAttemptSummary(row).topSignals.map((signal: { code: string }) => signal.code)).toEqual(["critical", "low"]);
  expect(toAttemptDetail(row)).toMatchObject({ deviceShortId: "abcdef12", fingerprintShortId: "12345678", networkShortId: "fedcba98" });
  expect(JSON.stringify(toAttemptDetail(row))).not.toContain(row.phone_hash);
  expect(buildDisplayHint("phone", row)).toBe("017•••••448");
  expect(buildDisplayHint("device", row)).toBe("Device abcdef");
});
