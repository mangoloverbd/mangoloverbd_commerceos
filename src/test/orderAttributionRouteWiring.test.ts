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

describe("order attribution wiring", () => {
  it("imports the pure attribution rules instead of duplicating them in routes", () => {
    expect(source).toMatch(
      /import \{[^}]*buildAttributionPatch[^}]*buildStatusEvent[^}]*\} from "\.\/orderAttribution\.js"/,
    );
  });

  it("stamps the creator and validates the requested assignee on order creation", () => {
    const create = routeSection(
      'app.post("/api/orders"',
      'app.patch("/api/orders/:id"',
    );

    expect(create).toContain("row.created_by = user.id");
    expect(create).toContain("requestedAssignee");
    expect(create).toContain("assertWorkspaceMember");
    expect(create).toContain('return res.status(400).json({ error: "Invalid assigned_to" })');
    expect(create).toContain("row.assigned_to = user.id");
    expect(create).not.toMatch(/req\.body(?:\?\.)?\.org(?:Id|_id)/);
  });

  it("derives creation attribution from the initial status and logs the creation", () => {
    const create = routeSection(
      'app.post("/api/orders"',
      'app.patch("/api/orders/:id"',
    );

    expect(create).toContain("buildAttributionPatch");
    expect(create).toContain("fromStatus: null");
    expect(create).toContain("toStatus: row.status");
    expect(create).toContain("Object.assign(row,");
    expect(create).toContain("buildStatusEvent");
    expect(create).toContain('orderTable: "orders"');
    expect(create).toContain('actorKind: "user"');
  });

  it("stamps attribution and appends an event for a user status change", () => {
    const patch = routeSection(
      'app.patch("/api/orders/:id"',
      'app.post("/api/orders/:id/send-sms"',
    );

    expect(patch).toContain("orderCheck.status");
    expect(patch).toContain("buildAttributionPatch");
    expect(patch).toContain("buildStatusEvent");
    expect(patch).toContain('actorKind: "user"');
    expect(patch).toContain('.eq("org_id", orgId)');
    expect(patch).not.toMatch(/"(?:created_by|assigned_to|confirmed_by|cancelled_by)"/);
  });

  it("uses a workspace-scoped assignee guard and a non-blocking event writer", () => {
    const guard = routeSection(
      "async function assertWorkspaceMember",
      "async function recordStatusEvent",
    );
    const eventWriter = routeSection(
      "async function recordStatusEvent",
      'app.post("/api/orders"',
    );

    expect(guard).toContain('.from("user_roles")');
    expect(guard).toContain('.eq("org_id", orgId)');
    expect(guard).toContain('.eq("user_id", userId)');
    expect(eventWriter).toContain('.from("order_status_events")');
    expect(eventWriter).toContain("console.error");
    expect(eventWriter).not.toContain("throw");
  });
});
