import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function routeSection(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

const webhook = () =>
  routeSection('app.post("/api/webhooks/steadfast"', "// ── Returns ──");

describe("steadfast webhook attribution isolation", () => {
  it("never writes any attribution column", () => {
    const section = webhook();
    for (const column of [
      "confirmed_by",
      "confirmed_at",
      "cancelled_by",
      "cancelled_at",
      "created_by",
      "assigned_to",
    ]) {
      expect(section).not.toContain(column);
    }
  });

  it("never calls buildAttributionPatch", () => {
    expect(webhook()).not.toContain("buildAttributionPatch");
  });

  it("logs a meaningful transition as a courier webhook with no actor", () => {
    const section = webhook();
    expect(section).toContain('select("id, org_id, courier_status, status, risk_attempt_id")');
    expect(section).toContain("buildStatusEvent");
    expect(section).toContain('actorKind: "courier_webhook"');
    expect(section).toContain("actorId: null");
    expect(section).toContain("includeEquivalentBusinessState: true");
  });

  it("keeps both the update and event workspace-scoped", () => {
    expect(webhook()).toContain('.eq("org_id", order.org_id)');
    expect(webhook()).toContain("orgId: order.org_id");
  });

  it("requires a configured secret and logs only a persisted courier update", () => {
    const section = webhook();

    expect(section).toContain('const cfg = await getOrgSettings(order.org_id, ["courier_webhook_secret"])');
    expect(section).toContain("if (secret && bearerToken !== secret)");
    expect(section).toContain("const { data: updatedOrder, error: updateError } = await supabase");
    expect(section).toContain('.select("id, status")');
    expect(section).toContain("if (!updatedOrder)");
  });

  it("logs bot-created inbox orders as system without fabricating a user", () => {
    const save = routeSection(
      "async function saveMetaInboxOrder",
      "async function sendMetaMessage",
    );
    expect(save).toMatch(/buildStatusEvent|prepareStatusEvent/);
    expect(save).toContain('actorKind: "system"');
    expect(save).toContain("actorId: null");
    expect(save).not.toContain("confirmed_by");
    expect(save).not.toContain("created_by");
  });
});
