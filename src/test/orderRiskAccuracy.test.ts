import { expect, it } from "vitest";
import { computeAccuracy } from "../../server/risk/accuracy.js";

const now = new Date("2026-09-23T12:00:00Z");
const attempt = (decision: string, label: string | null, signals: string[] = [], mode = "shadow") => ({ decision, label, signals: signals.map(code => ({ code })), mode, created_at: "2026-09-22T12:00:00Z" });

it("separates unknown outcomes from measured precision and counts genuine customers held or blocked", () => {
  const { overall, signals } = computeAccuracy([
    attempt("BLOCK", "fake", ["test_content"]), attempt("BLOCK", "genuine", ["test_content"], "active"),
    attempt("HOLD", "fake", ["address_incomplete"]), attempt("HOLD", "genuine", ["address_incomplete"]),
    attempt("ALLOW", "fake"), attempt("ALLOW", null),
  ], { now, days: 7 });
  expect(overall).toMatchObject({ attempts: 6, holds: 2, blocks: 2, holdRate: 2 / 6, labelledFake: 3, labelledGenuine: 2, blockPrecision: 0.5, blockedGenuine: 1, heldGenuine: 1, fakeCaught: 2 / 3, fakeSlipped: 1 });
  expect(signals.find((signal: { code: string }) => signal.code === "test_content")).toMatchObject({ fired: 2, fake: 1, genuine: 1, precisionFake: 0.5 });
});

it("ignores attempts outside the reporting window", () => {
  expect(computeAccuracy([{ ...attempt("BLOCK", "fake"), created_at: "2026-09-01T00:00:00Z" }], { now, days: 7 }).overall.attempts).toBe(0);
});
