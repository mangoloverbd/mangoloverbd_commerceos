import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AiActionCard from "../components/order-chat/AiActionCard";

const recommendation = {
  key: "add", summary: "Set Cocoa Brown Trouser / M stock to 62 (was 12, +50)",
  args: { product_id: "p1", variant_id: "vM", fields: { stock_quantity: 62 } },
  signal: 3 as const, tone: "green" as const, label: "High confidence", cta: "Apply",
};
const alternatives = [{
  key: "set", summary: "Set to 50 (replace)", args: { product_id: "p1", variant_id: "vM", fields: { stock_quantity: 50 } },
  signal: 1 as const, tone: "orange" as const, label: "Needs review", cta: "Apply",
}];

describe("AiActionCard", () => {
  it("renders the primary recommendation summary", () => {
    render(<AiActionCard tool="update_variant" recommendation={recommendation} alternatives={alternatives}
      status="pending" onApply={() => {}} onReject={() => {}} />);
    expect(screen.getByText(/Set Cocoa Brown Trouser/)).toBeTruthy();
  });

  it("opens the alternatives drawer and promotes a selection", () => {
    render(<AiActionCard tool="update_variant" recommendation={recommendation} alternatives={alternatives}
      status="pending" onApply={() => {}} onReject={() => {}} />);
    fireEvent.click(screen.getByText("Alternatives"));
    fireEvent.click(screen.getByText("Set to 50 (replace)"));
    // the promoted summary now shows as primary
    expect(screen.getAllByText(/Set to 50/).length).toBeGreaterThan(0);
  });

  it("calls onApply with the selected args on Accept", () => {
    const onApply = vi.fn();
    render(<AiActionCard tool="update_variant" recommendation={recommendation} alternatives={alternatives}
      status="pending" onApply={onApply} onReject={() => {}} />);
    fireEvent.click(screen.getByText("Apply"));
    expect(onApply).toHaveBeenCalledWith(recommendation.args);
  });

  it("calls onReject on Reject", () => {
    const onReject = vi.fn();
    render(<AiActionCard tool="update_variant" recommendation={recommendation} alternatives={alternatives}
      status="pending" onApply={() => {}} onReject={onReject} />);
    fireEvent.click(screen.getByText("Reject"));
    expect(onReject).toHaveBeenCalled();
  });

  it("hides the Alternatives button when alternatives is empty", () => {
    render(<AiActionCard tool="update_order" recommendation={recommendation} alternatives={[]}
      status="pending" onApply={() => {}} onReject={() => {}} />);
    expect(screen.queryByText("Alternatives")).toBeNull();
  });
});
