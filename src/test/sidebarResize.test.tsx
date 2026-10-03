import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";

function renderSidebar() {
  const view = render(
    <SidebarProvider data-testid="wrapper">
      <Sidebar collapsible="icon">
        <div>Menu</div>
      </Sidebar>
    </SidebarProvider>,
  );
  const width = () => (screen.getByTestId("wrapper") as HTMLElement).style.getPropertyValue("--sidebar-width");
  const state = () => view.container.querySelector("[data-collapsible]")?.getAttribute("data-state");
  return { ...view, width, state, handle: () => screen.getByRole("separator", { name: "Resize sidebar" }) };
}

function drag(handle: HTMLElement, toX: number) {
  fireEvent.pointerDown(handle, { button: 0, clientX: 192 });
  fireEvent(window, new MouseEvent("pointermove", { clientX: toX }));
  fireEvent(window, new MouseEvent("pointerup", { clientX: toX }));
}

describe("resizable sidebar", () => {
  beforeEach(() => localStorage.clear());

  it("starts at 192px and exposes an accessible separator", () => {
    const { width, handle } = renderSidebar();
    expect(width()).toBe("192px");
    expect(handle()).toHaveAttribute("aria-valuemin", "192");
    expect(handle()).toHaveAttribute("aria-valuemax", "320");
    expect(handle()).toHaveAttribute("aria-valuenow", "192");
  });

  it("resizes with the keyboard within 192–320px and remembers the width", () => {
    const { width, handle, unmount } = renderSidebar();
    fireEvent.keyDown(handle(), { key: "ArrowRight" });
    expect(width()).toBe("208px");
    fireEvent.keyDown(handle(), { key: "End" });
    expect(width()).toBe("320px");
    fireEvent.keyDown(handle(), { key: "ArrowRight" });
    expect(width()).toBe("320px");
    unmount();

    expect(renderSidebar().width()).toBe("320px");
  });

  it("resets to the default width on double-click", () => {
    localStorage.setItem("ml:sidebar-width", "280");
    const { width, handle } = renderSidebar();
    expect(width()).toBe("280px");
    fireEvent.doubleClick(handle());
    expect(width()).toBe("192px");
  });

  it("ignores a stored width outside the limits", () => {
    localStorage.setItem("ml:sidebar-width", "900");
    expect(renderSidebar().width()).toBe("320px");
  });

  it("follows the pointer while dragging", () => {
    const { width, handle } = renderSidebar();
    drag(handle(), 260);
    expect(width()).toBe("260px");
    expect(localStorage.getItem("ml:sidebar-width")).toBe("260");
  });

  it("snaps to the minimised rail when dragged well past the minimum", () => {
    const { state, handle } = renderSidebar();
    expect(state()).toBe("expanded");
    drag(handle(), 100);
    expect(state()).toBe("collapsed");
  });
});
