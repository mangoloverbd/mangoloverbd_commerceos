import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DottedGlobe, pinTransform } from "@/components/home/DottedGlobe";
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

  it("moves between different places every few seconds", () => {
    render(<DottedGlobe visitors={[visit("Dhaka", 23.81, 90.41, 30), visit("Rajshahi", 24.37, 88.6, 29)]} />);
    expect(screen.getByText("Dhaka, BD")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(screen.getByText("Rajshahi, BD")).toBeInTheDocument();
    expect(screen.queryByText("Dhaka, BD")).not.toBeInTheDocument();
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
