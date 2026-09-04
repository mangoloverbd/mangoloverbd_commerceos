import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Warehouse } from "@phosphor-icons/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WarehouseDialog } from "@/components/WarehouseDialog";
import { WarehouseMetric } from "@/components/warehouse/WarehouseMetric";

const apiFetch = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/components/ui/sonner", () => ({ toast }));

describe("warehouse presentation", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    toast.error.mockReset();
    toast.success.mockReset();
  });

  it("renders a compact Products-style metric", () => {
    render(<WarehouseMetric label="Warehouses" value={3} detail="Active locations" icon={<Warehouse weight="light" />} />);

    expect(screen.getByText("Warehouses")).toHaveClass("uppercase", "tracking-[0.3em]");
    expect(screen.getByText("3")).toHaveClass("text-2xl", "tabular-nums");
    expect(screen.getByText("Active locations")).toBeInTheDocument();
  });

  it("submits a trimmed create payload through the shared dialog", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<WarehouseDialog open warehouse={null} onClose={onClose} onSaved={onSaved} />);

    await user.type(screen.getByRole("textbox", { name: "Warehouse name" }), "  North Hub  ");
    await user.type(screen.getByRole("textbox", { name: "Address" }), "Uttara");
    await user.type(screen.getByRole("textbox", { name: "Contact person" }), "Rafi");
    await user.type(screen.getByRole("textbox", { name: "Phone" }), "01700000000");
    await user.click(screen.getByRole("button", { name: "Save warehouse" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(apiFetch).toHaveBeenCalledWith("/api/warehouses", expect.objectContaining({ method: "POST" }));
    const request = apiFetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      name: "North Hub",
      address: "Uttara",
      contact_person: "Rafi",
      phone: "01700000000",
      is_default: false,
    });
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open and reports validation and request errors", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const view = render(<WarehouseDialog open warehouse={null} onClose={onClose} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Save warehouse" }));
    expect(toast.error).toHaveBeenCalledWith("Warehouse name is required");
    expect(onClose).not.toHaveBeenCalled();

    apiFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "Name already exists" }) });
    await user.type(screen.getByRole("textbox", { name: "Warehouse name" }), "North Hub");
    await user.click(screen.getByRole("button", { name: "Save warehouse" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Name already exists"));
    expect(onClose).not.toHaveBeenCalled();
    expect(view.getByRole("textbox", { name: "Warehouse name" })).toHaveValue("North Hub");
  });
});
