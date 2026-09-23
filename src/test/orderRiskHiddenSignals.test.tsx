import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RiskDetails, RiskSignalChips } from "@/components/risk/RiskDashboard";
import { isVisibleRiskSignal, visibleRiskSignals, type RiskAttempt, type RiskSignal } from "@/lib/orderRisk";

const botCheck: RiskSignal = { code: "bot_check_failed", family: "BEHAVIOUR", severity: "medium", points: 20, label: "Bot check failed", evidence: "The bot check was not completed successfully" };
const address: RiskSignal = { code: "address_incomplete", family: "CONTENT", severity: "medium", points: 20, label: "Incomplete address", evidence: "The address needs a clearer place marker or area" };

describe("hidden risk signals", () => {
  it("drops the bot-check signal while Turnstile is not in use", () => {
    expect(visibleRiskSignals([botCheck, address])).toEqual([address]);
    expect(isVisibleRiskSignal("bot_check_failed")).toBe(false);
    expect(isVisibleRiskSignal("address_incomplete")).toBe(true);
  });

  it("does not render the bot-check chip or its evidence", () => {
    render(<RiskSignalChips signals={[botCheck, address]} />);
    expect(screen.queryByText("Bot check failed")).toBeNull();
    expect(screen.getByText("Incomplete address")).toBeTruthy();
  });

  it("hides the bot-check evidence in the investigation view", () => {
    const attempt = { id: "a", created_at: "2026-09-23T18:00:00Z", decision: "HOLD", score: 40, mode: "shadow", signals: [botCheck, address] } as unknown as RiskAttempt;
    render(<RiskDetails attempt={attempt} />);
    expect(screen.queryByText("The bot check was not completed successfully")).toBeNull();
    expect(screen.getByText("The address needs a clearer place marker or area")).toBeTruthy();
  });
});
