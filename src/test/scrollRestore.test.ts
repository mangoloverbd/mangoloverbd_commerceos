import { beforeEach, describe, expect, it } from "vitest";
import { consumeScrollRestored, markScrollRestored } from "@/lib/scrollRestore";

describe("scrollRestore", () => {
  beforeEach(() => {
    consumeScrollRestored("__reset__");
  });

  it("is consumed once for the path that was marked", () => {
    markScrollRestored("/orders");
    expect(consumeScrollRestored("/orders")).toBe(true);
    expect(consumeScrollRestored("/orders")).toBe(false);
  });

  it("only matches its own path, and is cleared even on a miss", () => {
    markScrollRestored("/orders");
    expect(consumeScrollRestored("/orders/abc")).toBe(false);
    expect(consumeScrollRestored("/orders")).toBe(false);
  });

  it("returns false when nothing was marked", () => {
    expect(consumeScrollRestored("/orders")).toBe(false);
  });
});
