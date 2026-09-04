import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddProductsDialog } from "@/components/warehouse/AddProductsDialog";

const apiFetch = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/components/ui/sonner", () => ({ toast }));

const products = [
  { id: "p1", name: "Sundarbans Honey", selling_price: 800, stock_quantity: 12, warehouse_id: null },
  { id: "p2", name: "Chia Seed", selling_price: 650, stock_quantity: 7, warehouse_id: "other-warehouse" },
  { id: "p3", name: "Already Here", selling_price: 500, stock_quantity: 3, warehouse_id: "main" },
];

function renderDialog() {
  return render(
    <AddProductsDialog open warehouseId="main" warehouseName="Main Warehouse" onClose={vi.fn()} onAssigned={vi.fn()} />,
  );
}

describe("add products dialog", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    toast.error.mockReset();
    toast.success.mockReset();
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/products") return { ok: true, json: async () => ({ products }) };
      return { ok: true, json: async () => ({}) };
    });
  });

  it("lists only products not assigned to this warehouse and filters by search", async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(await screen.findByText("Sundarbans Honey")).toBeInTheDocument();
    expect(screen.getByText("Chia Seed")).toBeInTheDocument();
    expect(screen.queryByText("Already Here")).not.toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search products" }), "chia");
    expect(screen.queryByText("Sundarbans Honey")).not.toBeInTheDocument();
    expect(screen.getByText("Chia Seed")).toBeInTheDocument();
  });

  it("assigns selected products and closes on success", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onAssigned = vi.fn();
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/products") return { ok: true, json: async () => ({ products }) };
      if (url === "/api/products/bulk-assign-warehouse" && init?.method === "POST") {
        return { ok: true, json: async () => ({ updated: 2 }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    render(
      <AddProductsDialog open warehouseId="main" warehouseName="Main Warehouse" onClose={onClose} onAssigned={onAssigned} />,
    );
    await user.click(await screen.findByRole("checkbox", { name: /Sundarbans Honey/ }));
    await user.click(screen.getByRole("checkbox", { name: /Chia Seed/ }));
    await user.click(screen.getByRole("button", { name: "Assign 2 products" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/bulk-assign-warehouse",
      expect.objectContaining({ method: "POST" }),
    ));
    const call = apiFetch.mock.calls.find(([url]) => url === "/api/products/bulk-assign-warehouse");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ product_ids: ["p1", "p2"], warehouse_id: "main" });
    expect(onAssigned).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open and reports API errors", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/products") return { ok: true, json: async () => ({ products }) };
      if (url === "/api/products/bulk-assign-warehouse") {
        return { ok: false, json: async () => ({ error: "Warehouse not found" }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    render(
      <AddProductsDialog open warehouseId="main" warehouseName="Main Warehouse" onClose={onClose} onAssigned={vi.fn()} />,
    );
    await user.click(await screen.findByRole("checkbox", { name: /Sundarbans Honey/ }));
    await user.click(screen.getByRole("button", { name: "Assign 1 product" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Warehouse not found"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /Sundarbans Honey/ })).toBeChecked();
  });
});
