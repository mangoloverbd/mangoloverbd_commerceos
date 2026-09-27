import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar, SidebarProvider, readSidebarOpenPreference, useSidebar } from "@/components/ui/sidebar";

function StateProbe() {
  const { state, open, peeking } = useSidebar();
  return <span data-testid="probe">{`${state}:${open}:${peeking}`}</span>;
}

function renderSidebar(defaultOpen: boolean) {
  const view = render(
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar collapsible="icon">
        <StateProbe />
      </Sidebar>
    </SidebarProvider>,
  );
  const panel = view.container.querySelector<HTMLElement>("[data-sidebar-panel]")!;
  const root = view.container.querySelector<HTMLElement>("[data-collapsible]")!;
  return { panel, root };
}

describe("collapsed sidebar hover peek", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the full sidebar while a collapsed sidebar is hovered, without pinning it open", () => {
    const { panel, root } = renderSidebar(false);
    expect(screen.getByTestId("probe")).toHaveTextContent("collapsed:false:false");

    fireEvent.mouseEnter(panel);
    act(() => { vi.advanceTimersByTime(300); });

    expect(screen.getByTestId("probe")).toHaveTextContent("expanded:false:true");
    expect(root).toHaveAttribute("data-state", "expanded");
    expect(root).toHaveAttribute("data-peeking", "true");

    fireEvent.mouseLeave(panel);
    act(() => { vi.advanceTimersByTime(300); });

    expect(screen.getByTestId("probe")).toHaveTextContent("collapsed:false:false");
    expect(root).toHaveAttribute("data-collapsible", "icon");
  });

  it("reports the peek to components that read the sidebar state outside <Sidebar>", () => {
    function OuterProbe() {
      const { state } = useSidebar();
      return <span data-testid="outer-probe">{state}</span>;
    }
    const view = render(
      <SidebarProvider defaultOpen={false}>
        <OuterProbe />
        <Sidebar collapsible="icon"><span /></Sidebar>
      </SidebarProvider>,
    );
    fireEvent.mouseEnter(view.container.querySelector<HTMLElement>("[data-sidebar-panel]")!);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId("outer-probe")).toHaveTextContent("expanded");
  });

  it("ignores a quick pass over the collapsed sidebar", () => {
    const { panel } = renderSidebar(false);
    fireEvent.mouseEnter(panel);
    act(() => { vi.advanceTimersByTime(50); });
    fireEvent.mouseLeave(panel);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId("probe")).toHaveTextContent("collapsed:false:false");
  });

  it("does nothing on hover when the sidebar is already expanded", () => {
    const { panel } = renderSidebar(true);
    fireEvent.mouseEnter(panel);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId("probe")).toHaveTextContent("expanded:true:false");
  });
});

describe("sidebar open preference", () => {
  afterEach(() => { document.cookie = "sidebar:state=; path=/; max-age=0"; });

  it("stays collapsed across reloads once someone collapses it", () => {
    function Toggle() {
      const { setOpen } = useSidebar();
      return <button onClick={() => setOpen(false)}>collapse</button>;
    }
    render(<SidebarProvider defaultOpen><Toggle /></SidebarProvider>);
    expect(readSidebarOpenPreference(true)).toBe(true);
    fireEvent.click(screen.getByText("collapse"));
    expect(readSidebarOpenPreference(true)).toBe(false);
  });
});
