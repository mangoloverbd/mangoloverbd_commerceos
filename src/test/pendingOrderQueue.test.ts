import { beforeEach, describe, expect, it } from "vitest";
import { readPendingOrderQueue, savePendingOrderQueue } from "@/lib/pendingOrderQueue";

describe("pendingOrderQueue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a saved queue", () => {
    savePendingOrderQueue(["order-1", "order-2"]);

    expect(readPendingOrderQueue()).toEqual(["order-1", "order-2"]);
  });

  it("returns null when nothing was saved", () => {
    expect(readPendingOrderQueue()).toBeNull();
  });

  it("returns null for a stale snapshot", () => {
    savePendingOrderQueue(["order-1"]);

    expect(readPendingOrderQueue(Date.now() + 31 * 60 * 1000)).toBeNull();
  });

  it("returns null for corrupt payloads", () => {
    localStorage.setItem("ml:pending-order-queue", "not-json");

    expect(readPendingOrderQueue()).toBeNull();
  });
});
