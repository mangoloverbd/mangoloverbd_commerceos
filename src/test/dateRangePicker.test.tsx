import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { describe, expect, it } from "vitest";
import { DateRangePicker } from "@/components/DateRangePicker";

const initialRange: DateRange = {
  from: new Date(2026, 8, 1),
  to: new Date(2026, 8, 18),
};

function ControlledPicker() {
  const [range, setRange] = useState<DateRange | null>(initialRange);

  return (
    <DateRangePicker value={range} onChange={setRange} />
  );
}

describe("DateRangePicker", () => {
  it("seeds the calendar's pending range from the committed value, applies a custom range on Apply, and clears after All Time", async () => {
    const user = userEvent.setup();
    render(<ControlledPicker />);

    await user.click(screen.getByTestId("button-date-range-picker"));
    expect(await screen.findByText("18 days selected")).toBeInTheDocument();
    expect(screen.getByLabelText("Start date")).toHaveValue("01/09/2026");
    expect(screen.getByLabelText("End date")).toHaveValue("18/09/2026");

    await user.click(screen.getByRole("button", { name: "All Time" }));

    await waitFor(() => {
      expect(screen.getByTestId("button-date-range-picker")).toHaveTextContent("All Time");
    });

    await user.click(screen.getByTestId("button-date-range-picker"));
    await waitFor(() => {
      expect(screen.queryByText(/days? selected/)).not.toBeInTheDocument();
    });
  });

  it("only commits a manually picked range once Apply is pressed, and Cancel discards it", async () => {
    const user = userEvent.setup();
    render(<ControlledPicker />);

    await user.click(screen.getByTestId("button-date-range-picker"));
    await screen.findByText("18 days selected");

    await user.click(screen.getByRole("button", { name: /September 15, 2026/ }));
    await user.click(screen.getByRole("button", { name: /September 20, 2026/ }));
    expect(await screen.findByText("6 days selected")).toBeInTheDocument();
    // Not yet committed — the trigger still shows the original range.
    expect(screen.getByTestId("button-date-range-picker")).toHaveTextContent("Sep 1 – Sep 18, 2026");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.getByTestId("button-date-range-picker")).toHaveTextContent("Sep 1 – Sep 18, 2026");
    });

    await user.click(screen.getByTestId("button-date-range-picker"));
    await user.click(screen.getByRole("button", { name: /September 15, 2026/ }));
    await user.click(screen.getByRole("button", { name: /September 20, 2026/ }));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(screen.getByTestId("button-date-range-picker")).toHaveTextContent("Sep 15 – Sep 20, 2026");
    });
  });
});
