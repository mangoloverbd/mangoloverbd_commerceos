import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  OrderRowsPerPageSelect,
  OrderTablePagination,
} from "@/components/orders/OrderTablePagination";
import { useOrderPageSize } from "@/hooks/useOrderPageSize";

describe("OrderTablePagination", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows page position and disables navigation at the boundaries", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <OrderTablePagination
        page={0}
        pageSize={100}
        totalItems={145}
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("renders page navigation without the row selector", () => {
    render(
      <OrderTablePagination
        page={0}
        pageSize={100}
        totalItems={10}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("offers the supported row limits from the standalone selector", async () => {
    const user = userEvent.setup();
    const onPageSizeChange = vi.fn();

    render(
      <OrderRowsPerPageSelect
        pageSize={100}
        onPageSizeChange={onPageSizeChange}
        ariaLabel="Rows per page for warehouse orders"
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Rows per page for warehouse orders" }));
    expect(screen.getAllByRole("option")).toHaveLength(5);
    await user.click(screen.getByRole("option", { name: "20" }));

    expect(onPageSizeChange).toHaveBeenCalledWith(20);
  });
});

describe("useOrderPageSize", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("falls back to 100 for an unsupported stored value", () => {
    localStorage.setItem("order-page-size", "500");

    const { result } = renderHook(() => useOrderPageSize("order-page-size"));

    expect(result.current[0]).toBe(100);
  });

  it("saves supported values under the provided key", () => {
    const { result } = renderHook(() => useOrderPageSize("warehouse-order-page-size"));

    act(() => result.current[1](50));

    expect(result.current[0]).toBe(50);
    expect(localStorage.getItem("warehouse-order-page-size")).toBe("50");
  });
});
