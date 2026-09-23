import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { OrderEditorTabPanels, OrderEditorTabSwitch } from "@/components/order-editor/OrderEditorTabs";

it("shows a Risk tab for website orders and keeps the order editor mounted", async () => {
  const user = userEvent.setup();
  function Test() {
    const [tab, setTab] = ["details", () => {}] as const;
    return <><OrderEditorTabSwitch value={tab} onChange={setTab} showRisk /><OrderEditorTabPanels tab="risk" details={<div>Unsaved order form</div>} logs={<div>Logs</div>} risk={<div>Risk evidence</div>} /></>;
  }
  render(<MemoryRouter><Test /></MemoryRouter>);
  expect(screen.getByText("Risk evidence")).toBeInTheDocument();
  expect(screen.getByText("Unsaved order form")).toBeInTheDocument();
  await user.click(screen.getByText("Risk"));
});
