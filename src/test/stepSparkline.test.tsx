import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StepSparkline } from "../../src/components/charts/StepSparkline";

describe("StepSparkline", () => {
  it("puts the zero baseline inside the chart when values go negative", () => {
    const { container } = render(<StepSparkline values={[100, -50, 25]} seed="profit" width={90} height={30} />);
    const baseline = container.querySelector("[data-sparkline] > line")!;
    const y = Number(baseline.getAttribute("y1"));
    // top = 4, bottom = 28: zero sits a third of the way up from the bottom.
    expect(y).toBeGreaterThan(4);
    expect(y).toBeLessThan(28);
  });

  it("rises between steps through eased curves, not vertical risers", () => {
    const { container } = render(<StepSparkline values={[1, 2, 2, 4]} seed="x" />);
    const line = container.querySelectorAll("[data-sparkline] path")[1].getAttribute("d") ?? "";
    expect(line.match(/C/g)?.length).toBe(2); // 1→2 and 2→4; the flat 2→2 has none
    expect(line).not.toMatch(/V/);
  });
});

describe("StepSparkline grouping", () => {
  it("sums dense series into maxSteps steps with range labels", () => {
    const values = Array.from({ length: 24 }, (_, h) => (h === 18 ? 900 : 0));
    const labels = Array.from({ length: 24 }, (_, h) => `${h}:00`);
    const { container } = render(<StepSparkline values={values} labels={labels} seed="hourly" maxSteps={8} />);
    if (typeof window.PointerEvent === "undefined") {
      (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
    }
    const hitArea = container.querySelector("[data-sparkline] > rect")!;
    hitArea.getBoundingClientRect = () => ({ left: 0, top: 0, width: 112, height: 32, right: 112, bottom: 32, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(hitArea, { clientX: 111 }); // 8th and last step
    expect(screen.getByRole("tooltip")).toHaveTextContent("21:00 – 23:00");
    fireEvent.pointerMove(hitArea, { clientX: 90 }); // 7th step (x 84–98) holds hour 18
    expect(screen.getByRole("tooltip")).toHaveTextContent("900");
  });
});

describe("StepSparkline running total", () => {
  it("climbs to the series total and labels steps by where they end", async () => {
    if (typeof window.PointerEvent === "undefined") {
      (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
    }
    const { fireEvent, screen } = await import("@testing-library/react");
    const { container } = render(
      <StepSparkline
        values={[100, 0, 0, 300, 0, 200]}
        labels={["1 AM", "2 AM", "3 AM", "4 AM", "5 AM", "6 AM"]}
        seed="rev"
        width={60}
        maxSteps={3}
        cumulative
      />
    );
    const hitArea = container.querySelector("[data-sparkline] rect")!;
    hitArea.getBoundingClientRect = () => ({ left: 0, top: 0, width: 60, height: 32, right: 60, bottom: 32, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(hitArea, { clientX: 30 }); // second step: 100 + 0 + 300
    expect(screen.getByRole("tooltip")).toHaveTextContent("400");
    expect(screen.getByRole("tooltip")).toHaveTextContent("by 4 AM");
    fireEvent.pointerMove(hitArea, { clientX: 55 }); // last step: full total
    expect(screen.getByRole("tooltip")).toHaveTextContent("600");
    expect(screen.getByRole("tooltip")).toHaveTextContent("by 6 AM");
  });
});

describe("StepSparkline smooth curve", () => {
  it("draws a single smooth curve with only the latest point marked", () => {
    const { container } = render(<StepSparkline values={[100, 0, 400, 50]} seed="smooth" width={80} height={30} curve="smooth" />);
    const line = container.querySelectorAll("[data-sparkline] path")[1].getAttribute("d") ?? "";
    expect(line.match(/C/g)?.length).toBe(3); // one curve between each pair of points
    expect(container.querySelectorAll("[data-point]")).toHaveLength(1);
    // No dashed baseline or sparkle dots in the smooth style.
    expect(container.querySelector("[data-sparkline] > line")).toBeNull();
  });

  it("never overshoots below zero between a burst and quiet periods", () => {
    const { container } = render(<StepSparkline values={[0, 0, 900, 0, 0]} seed="burst" width={100} height={30} curve="smooth" />);
    const line = container.querySelectorAll("[data-sparkline] path")[1].getAttribute("d") ?? "";
    const ys = Array.from(line.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)).map((m) => Number(m[2]));
    // y grows downward; the zero level sits at height - 4 = 26.
    expect(Math.max(...ys)).toBeLessThanOrEqual(26 + 1e-9);
  });
});

describe("StepSparkline points", () => {
  it("marks every step with a dot and inks the latest one", () => {
    const { container } = render(<StepSparkline values={[1, 3, 2, 5]} seed="pts" />);
    const dots = Array.from(container.querySelectorAll("[data-point]"));
    expect(dots).toHaveLength(4);
    expect(dots.map((d) => d.getAttribute("fill"))).toEqual(["#ffffff", "#ffffff", "#ffffff", "#121212"]);
  });
});

describe("StepSparkline span labels", () => {
  it("labels grouped hours from the first start to the last end", () => {
    if (typeof window.PointerEvent === "undefined") {
      (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
    }
    const hours = ["12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM"];
    const ends = ["1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM"];
    const { container } = render(
      <StepSparkline values={[5, 1, 0, 2, 8, 3]} labels={hours} endLabels={ends} seed="span" width={60} maxSteps={2} />
    );
    const hitArea = container.querySelector("[data-sparkline] > rect")!;
    hitArea.getBoundingClientRect = () => ({ left: 0, top: 0, width: 60, height: 32, right: 60, bottom: 32, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(hitArea, { clientX: 10 });
    expect(screen.getByRole("tooltip")).toHaveTextContent("6"); // 5 + 1 + 0, per period not running
    expect(screen.getByRole("tooltip")).toHaveTextContent("12 PM – 3 PM");
    fireEvent.pointerMove(hitArea, { clientX: 50 });
    expect(screen.getByRole("tooltip")).toHaveTextContent("13");
    expect(screen.getByRole("tooltip")).toHaveTextContent("3 PM – 6 PM");
  });
});
