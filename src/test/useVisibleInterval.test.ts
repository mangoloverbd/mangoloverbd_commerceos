import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVisibleInterval } from "@/hooks/useVisibleInterval";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useVisibleInterval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
  });

  afterEach(() => {
    setHidden(false);
    vi.useRealTimers();
  });

  it("runs the callback on every tick while the tab is visible", () => {
    const callback = vi.fn();
    renderHook(() => useVisibleInterval(callback, 1000));

    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("skips ticks while hidden and catches up once when visible again", () => {
    const callback = vi.fn();
    renderHook(() => useVisibleInterval(callback, 1000));

    setHidden(true);
    vi.advanceTimersByTime(5000);
    expect(callback).not.toHaveBeenCalled();

    setHidden(false);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not catch up when no tick was skipped while hidden", () => {
    const callback = vi.fn();
    renderHook(() => useVisibleInterval(callback, 1000));

    setHidden(true);
    vi.advanceTimersByTime(500);
    setHidden(false);
    expect(callback).not.toHaveBeenCalled();
  });

  it("always calls the latest callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useVisibleInterval(cb, 1000), {
      initialProps: { cb: first },
    });

    rerender({ cb: second });
    vi.advanceTimersByTime(1000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("updates the callback ref in a layout effect", () => {
    const source = readFileSync(resolve(process.cwd(), "src/hooks/useVisibleInterval.ts"), "utf8");
    expect(source).toContain("useLayoutEffect(() => {\n    callbackRef.current = callback;");
  });

  it("does nothing when disabled", () => {
    const callback = vi.fn();
    renderHook(() => useVisibleInterval(callback, 1000, false));

    vi.advanceTimersByTime(5000);
    expect(callback).not.toHaveBeenCalled();
  });

  it("clears the interval and visibility listener on unmount", () => {
    const callback = vi.fn();
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useVisibleInterval(callback, 1000));

    setHidden(true);
    vi.advanceTimersByTime(2000);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

    setHidden(false);
    vi.advanceTimersByTime(5000);
    expect(callback).not.toHaveBeenCalled();
    removeSpy.mockRestore();
  });
});
