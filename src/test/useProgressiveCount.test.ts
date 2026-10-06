import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProgressiveCount } from "@/hooks/useProgressiveCount";

// Each batch is scheduled after React renders the previous one, so step until settled.
function flushBatches() {
  for (let step = 0; step < 20; step++) act(() => { vi.runOnlyPendingTimers(); });
}

describe("useProgressiveCount", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the first rows at once and the rest after the page's entrance, in batches", () => {
    const { result } = renderHook(() => useProgressiveCount(100));
    expect(result.current).toBe(20);
    // Nothing more while the entrance plays.
    act(() => { vi.advanceTimersByTime(800); });
    expect(result.current).toBe(20);
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe(40);
    flushBatches();
    expect(result.current).toBe(100);
  });

  it("renders short lists in full straight away", () => {
    const { result } = renderHook(() => useProgressiveCount(12));
    expect(result.current).toBe(12);
  });

  it("renders everything when turned off (print view)", () => {
    const { result } = renderHook(() => useProgressiveCount(100, { enabled: false }));
    expect(result.current).toBe(100);
  });

  it("keeps every row once shown, when the list changes later", () => {
    const { result, rerender } = renderHook(({ total }) => useProgressiveCount(total), { initialProps: { total: 100 } });
    flushBatches();
    rerender({ total: 120 });
    flushBatches();
    expect(result.current).toBe(120);
  });
});
