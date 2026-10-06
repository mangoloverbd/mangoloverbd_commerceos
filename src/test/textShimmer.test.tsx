import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextShimmer } from "@/components/ui/text-shimmer";

describe("TextShimmer", () => {
  it("keeps the same element when its parent re-renders, so the shimmer never restarts", () => {
    const { rerender } = render(<div data-tick="1"><TextShimmer as="h2">Good afternoon!</TextShimmer></div>);
    const heading = screen.getByRole("heading", { name: "Good afternoon!" });
    rerender(<div data-tick="2"><TextShimmer as="h2">Good afternoon!</TextShimmer></div>);
    expect(screen.getByRole("heading", { name: "Good afternoon!" })).toBe(heading);
  });
});
