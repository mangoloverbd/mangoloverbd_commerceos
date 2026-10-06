import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

// Runs the real /api/tracker.js body in a fresh browser window per test.
const serverSource = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const trackerStart = serverSource.indexOf('app.get("/api/tracker.js", publicTrackerCors');
const bodyStart = serverSource.indexOf("return res.send(`", trackerStart) + "return res.send(`".length;
const script = serverSource.slice(bodyStart, serverSource.indexOf("`);", bodyStart))
  .replace("${JSON.stringify(orgId)}", JSON.stringify("00000000-0000-4000-8000-000000000001"));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Hit = Record<string, unknown> & { kind: string; session_id: string; visitor_id: string; event_id: string };

function loadTracker({ url = "https://www.mangolover.com.bd/product/katimon-mango", cookie = "", hidden = false, reply = () => ({ ok: true }) as Record<string, unknown> } = {}) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url, runScripts: "outside-only", pretendToBeVisual: true });
  const win = dom.window as unknown as Window & typeof globalThis & { eval: (code: string) => unknown };
  if (cookie) win.document.cookie = cookie;
  // A page opened in a background tab (or preloaded by an in-app browser) starts hidden.
  if (hidden) Object.defineProperty(win.document, "hidden", { configurable: true, get: () => true });
  const hits: Hit[] = [];
  win.fetch = vi.fn(async (_endpoint: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Hit;
    hits.push(body);
    return { json: async () => reply(body) } as Response;
  }) as unknown as typeof fetch;
  win.eval(script);
  const settle = () => new Promise(resolve => setTimeout(resolve, 20));
  const setHidden = (hidden: boolean) => {
    Object.defineProperty(win.document, "hidden", { configurable: true, get: () => hidden });
    win.document.dispatchEvent(new win.Event("visibilitychange"));
  };
  return { win, hits, settle, setHidden, cookie: (name: string) => win.document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1] ?? "" };
}

describe("tracker script", () => {
  it("sets first-party visitor and visit cookies and sends ids with each event", async () => {
    const tracker = loadTracker();
    await tracker.settle();
    expect(tracker.cookie("ms_vid")).toMatch(UUID);
    expect(tracker.cookie("ms_sid")).toMatch(UUID);
    expect(tracker.hits[0]).toMatchObject({ kind: "pageview", visitor_id: tracker.cookie("ms_vid"), session_id: tracker.cookie("ms_sid") });
    expect(tracker.hits[0].event_id).toMatch(UUID);
  });

  it("keeps the same visitor and visit when the cookies already exist", async () => {
    const vid = "11111111-1111-4111-8111-111111111111", sid = "22222222-2222-4222-8222-222222222222";
    const tracker = loadTracker({ cookie: `ms_vid=${vid}` });
    tracker.win.document.cookie = `ms_sid=${sid}`;
    const second = loadTracker({ cookie: `ms_vid=${vid}` });
    second.win.document.cookie = `ms_sid=${sid}`;
    second.win.eval(script);
    await second.settle();
    expect(second.hits.at(-1)).toMatchObject({ visitor_id: vid, session_id: sid });
  });

  it("counts a new page once and ignores same-path history updates", async () => {
    const tracker = loadTracker();
    await tracker.settle();
    tracker.win.history.replaceState({}, "", "/product/katimon-mango?variant=2kg");
    await tracker.settle();
    tracker.win.history.pushState({}, "", "/step/katimon-mango");
    await tracker.settle();
    expect(tracker.hits.filter(hit => hit.kind === "pageview").map(hit => new URL(String(hit.url)).pathname)).toEqual(["/product/katimon-mango", "/step/katimon-mango"]);
    expect(new Set(tracker.hits.map(hit => hit.event_id)).size).toBe(tracker.hits.length);
  });

  it("sends time on page when the tab is hidden, without a presence heartbeat", async () => {
    const tracker = loadTracker();
    await tracker.settle();
    await new Promise(resolve => setTimeout(resolve, 1100));
    tracker.setHidden(true);
    await tracker.settle();
    const engage = tracker.hits.find(hit => hit.kind === "engage");
    expect(engage?.active_seconds).toBeGreaterThanOrEqual(1);
    expect(tracker.hits.filter(hit => hit.kind === "heartbeat")).toHaveLength(0);
  });

  it("counts a page opened in a background tab once it is shown", async () => {
    const tracker = loadTracker({ hidden: true });
    await tracker.settle();
    // Nothing while nobody is looking at it.
    expect(tracker.hits).toHaveLength(0);
    tracker.setHidden(false);
    await tracker.settle();
    // Shown: the page view goes out (not just a heartbeat), so the visit and its location exist.
    expect(tracker.hits.map(hit => hit.kind)).toEqual(["pageview"]);
    expect(new URL(String(tracker.hits[0].url)).pathname).toBe("/product/katimon-mango");
    // Later visibility changes are heartbeats; the page is never counted twice.
    tracker.setHidden(true);
    tracker.setHidden(false);
    await tracker.settle();
    expect(tracker.hits.filter(hit => hit.kind === "pageview")).toHaveLength(1);
  });

  it("sends nothing from a team browser opted out with ?ms_exclude=1", async () => {
    const tracker = loadTracker({ url: "https://www.mangolover.com.bd/?ms_exclude=1" });
    await tracker.settle();
    expect(tracker.hits).toHaveLength(0);
    expect(tracker.cookie("ms_exclude")).toBe("1");
  });

  it("starts a new visit and resends once when the server says the visit expired", async () => {
    let rotations = 0;
    const tracker = loadTracker({ reply: () => (rotations++ === 0 ? { ok: true, rotate: true } : { ok: true }) });
    await tracker.settle();
    const [first, retry] = tracker.hits;
    expect(retry).toMatchObject({ kind: "pageview" });
    expect(retry.session_id).not.toBe(first.session_id);
    expect(retry.event_id).not.toBe(first.event_id);
    expect(tracker.cookie("ms_sid")).toBe(retry.session_id);
    expect(tracker.hits).toHaveLength(2);
  });
});
