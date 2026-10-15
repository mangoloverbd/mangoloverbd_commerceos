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
  it("seeds the date fields from the committed value and only clears after All time + Apply", async () => {
    const user = userEvent.setup();
    render(<ControlledPicker />);

    await user.click(screen.getByTestId("button-date-range-picker"));
    expect(await screen.findByLabelText("Start date")).toHaveValue("September 1, 2026");
    expect(screen.getByLabelText("End date")).toHaveValue("September 18, 2026");

    await user.click(screen.getByRole("button", { name: "All time" }));
    // Staged only — the trigger still shows the original range.
    expect(screen.getByTestId("button-date-range-picker")).toHaveTextContent("Sep 1 – Sep 18, 2026");

    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => {
      expect(screen.getByTestId("button-date-range-picker")).toHaveTextContent("All time");
    });
  });

  it("only commits a manually picked range once Apply is pressed, and Cancel discards it", async () => {
    const user = userEvent.setup();
    render(<ControlledPicker />);

    await user.click(screen.getByTestId("button-date-range-picker"));
    await screen.findByLabelText("Start date");

    await user.click(screen.getByRole("button", { name: /September 15, 2026/ }));
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /September 20, 2026/ }));
    expect(screen.getByLabelText("End date")).toHaveValue("September 20, 2026");
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
