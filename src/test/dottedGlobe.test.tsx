import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DottedGlobe, cometPoint, pinTransform } from "@/components/home/DottedGlobe";
import type { HomeLiveVisitor } from "@/components/home/types";

const visit = (city: string, latitude: number, longitude: number, minute: number): HomeLiveVisitor => ({
  city, country: "BD", path: "/", latitude, longitude, last_seen_at: `2026-10-06T04:${String(minute).padStart(2, "0")}:00.000Z`,
});

describe("DottedGlobe pin", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps one steady pin when every live visitor is in the same city", () => {
    render(<DottedGlobe visitors={[visit("Dhaka", 23.81, 90.41, 30), visit("Dhaka", 23.81, 90.41, 29)]} />);
    const pin = screen.getByText("Dhaka, BD").closest("div[style]") as HTMLElement;
    act(() => { vi.advanceTimersByTime(12_000); });
    // Same element, still showing Dhaka: nothing remounted, so nothing flickers.
    expect(screen.getAllByText("Dhaka, BD")).toHaveLength(1);
    expect(screen.getByText("Dhaka, BD").closest("div[style]")).toBe(pin);
  });

  it("flies to the next place every few seconds and reports the landing", () => {
    const onLand = vi.fn();
    render(<DottedGlobe visitors={[visit("Dhaka", 23.81, 90.41, 30), visit("Rajshahi", 24.37, 88.6, 29)]} onLand={onLand} />);
    expect(screen.getByText("Dhaka, BD")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(4_000); });
    // Mid-flight: the comet is travelling, nothing has landed yet.
    expect(screen.queryByText("Rajshahi, BD")).not.toBeInTheDocument();
    expect(onLand).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1_300); });
    expect(screen.getByText("Rajshahi, BD")).toBeInTheDocument();
    expect(onLand).toHaveBeenCalledTimes(1);
  });

  it("curls the comet out and lands exactly on the new place", () => {
    const from = { x: 100, y: 100 };
    const to = { x: 110, y: 120 };
    expect(cometPoint(from, to, 0)).toEqual(from);
    expect(cometPoint(from, to, 1)).toEqual(to);
    // Mid-flight it has swung out to the right of both places.
    expect(cometPoint(from, to, 0.5).x).toBeGreaterThan(to.x);
  });

  it("does not hide a shown pin again when the data refreshes", () => {
    const visitors = [visit("Dhaka", 23.81, 90.41, 30)];
    const { rerender } = render(<DottedGlobe visitors={visitors} />);
    const pin = screen.getByText("Dhaka, BD").closest("div[style]") as HTMLElement;
    pin.style.visibility = "visible"; // what the draw loop does each frame
    rerender(<DottedGlobe visitors={[visit("Dhaka", 23.81, 90.41, 31)]} />);
    expect(pin.style.visibility).toBe("visible");
  });

  it("moves the pin with a sub-pixel transform rather than left/top", () => {
    expect(pinTransform(412.3456, 198.7)).toBe("translate3d(412.35px, 198.70px, 0) translate(calc(-100% + 7px), -50%)");
  });
});
