import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MetricNumberFlow } from "@/components/ui/number-flow";

type CapturedNumberFlowProps = {
  animated?: boolean;
  value: number;
  prefix?: string;
  locales?: string;
  format?: { maximumFractionDigits?: number };
};

const numberFlowCalls = vi.hoisted(() => [] as CapturedNumberFlowProps[]);

vi.mock("@number-flow/react", () => ({
  default: (props: CapturedNumberFlowProps) => {
    numberFlowCalls.push(props);
    return <span data-testid="number-flow">{props.value}</span>;
  },
}));

describe("MetricNumberFlow", () => {
  beforeEach(() => {
    numberFlowCalls.length = 0;
  });

  it("disables animation on mount and enables it for later value changes", async () => {
    const view = render(<MetricNumberFlow value={100} />);

    expect(numberFlowCalls[0]).toMatchObject({
      animated: false,
      value: 100,
      prefix: "৳",
      locales: "en-BD",
      format: { maximumFractionDigits: 0 },
    });

    await waitFor(() => {
      expect(numberFlowCalls.at(-1)).toMatchObject({ animated: true, value: 100 });
    });

    view.rerender(<MetricNumberFlow value={200} />);

    expect(numberFlowCalls.at(-1)).toMatchObject({ animated: true, value: 200 });
  });
});
