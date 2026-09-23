import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const source = readFileSync("server/index.js", "utf8");
const route = (marker: string) => source.slice(source.indexOf(marker), source.indexOf("\napp.", source.indexOf(marker) + 5));

it("guards and scopes manual labels to the current workspace", () => {
  const body = route('app.post("/api/order-protection/attempts/:id/label"');
  for (const token of ["requireOrderProtectionStaff(req)", 'if (!user)', 'role !== "admin"', "getRiskAttempt(supabase, { orgId", "labelRiskAttempt(supabase, { orgId", 'list: "allow"']) expect(body).toContain(token);
});

it("pages scoped accuracy rows with a bounded reporting window", () => {
  const body = route('app.get("/api/order-protection/accuracy"');
  for (const token of ["requireOrderProtectionStaff(req)", 'if (!user)', "[7, 30].includes(days)", '.from("order_risk_attempts")', '.eq("org_id", orgId)', '.range(offset, offset + pageSize - 1)', "rows.length < 5000", "computeAccuracy(rows, { now, days })"]) expect(body).toContain(token);
});

it("labels only explicitly fake review rejections", () => {
  const body = route('app.patch("/api/order-protection/reviews/:id"');
  expect(body).toContain('req.body?.rejectReason === "fake"');
  expect(body).toContain('labelRiskAttempt(supabase, { orgId, attemptId: data.attempt_id, label: "fake" })');
});
