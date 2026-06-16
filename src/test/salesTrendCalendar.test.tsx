import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GitHubCalendar, type SalesTrendDay } from "@/components/ui/git-hub-calendar";

const days: SalesTrendDay[] = [
  {
    date: "2026-06-01",
    totalRevenue: 1200,
    newCustomerRevenue: 700,
    existingCustomerRevenue: 500,
    totalOrders: 2,
    newCustomerOrders: 1,
    existingCustomerOrders: 1,
    intensity: 4,
  },
];

describe("GitHubCalendar", () => {
  it("does not wrap the sales trend grid in overflow clipping that cuts off the hover card", () => {
    const { container } = render(<GitHubCalendar data={days} />);

    expect(container.querySelector(".overflow-x-hidden")).toBeNull();
  });

  it("labels trend segments as customers instead of users", () => {
    const { queryByText, getByText } = render(<GitHubCalendar data={days} />);

    expect(getByText("New Customer")).toBeInTheDocument();
    expect(getByText("Existing Customer")).toBeInTheDocument();
    expect(queryByText("New User")).not.toBeInTheDocument();
    expect(queryByText("Existing User")).not.toBeInTheDocument();
  });
});
