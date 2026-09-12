import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Combobox } from "@/components/ui/combobox";

describe("Combobox", () => {
  it("keeps a long product list inside a scrollable picker", async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        items={Array.from({ length: 30 }, (_, index) => ({
          value: `product-${index}`,
          label: `Product ${index}`,
          image: `/product-${index}.jpg`,
        }))}
        onValueChange={vi.fn()}
        placeholder="Add a product from catalog…"
      />,
    );

    await user.click(screen.getByRole("combobox"));

    const list = screen.getByRole("listbox");
    expect(list).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
    expect(list.parentElement).toHaveClass("min-h-0");
  });
});
