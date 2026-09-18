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
  it("clears the pending calendar selection after choosing All Time and reopening", async () => {
    const user = userEvent.setup();
    render(<ControlledPicker />);

    await user.click(screen.getByTestId("button-date-range-picker"));
    expect(await screen.findByText("Custom Range")).toBeInTheDocument();
    expect(document.querySelector('[aria-selected="true"]')).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "All Time" }));
    await user.click(screen.getByTestId("button-date-range-picker"));

    await waitFor(() => {
      expect(document.querySelector('[aria-selected="true"]')).toBeNull();
    });
  });
});
