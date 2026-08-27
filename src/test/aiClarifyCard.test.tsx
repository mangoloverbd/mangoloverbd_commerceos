import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import AiClarifyCard from "../components/order-chat/AiClarifyCard";

const questions = [
  { q: "Which product?", type: "radio" as const, options: ["Cocoa Brown Trouser", "Cocoa Brown Pants"] },
  { q: "Which sizes?", type: "check" as const, options: ["M", "L", "XL"] },
];

describe("AiClarifyCard", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("renders the first question and auto-advances on radio select", () => {
    const onSubmit = vi.fn();
    render(<AiClarifyCard questions={questions} status="pending" onSubmit={onSubmit} onDismiss={() => {}} />);
    expect(screen.getByText("Which product?")).toBeTruthy();
    fireEvent.click(screen.getByText("Cocoa Brown Trouser"));
    // auto-advance to the second question
    act(() => { vi.advanceTimersByTime(480); });
    expect(screen.getByText("Which sizes?")).toBeTruthy();
  });

  it("toggles check options without auto-advancing", () => {
    render(<AiClarifyCard questions={questions} status="pending" onSubmit={() => {}} onDismiss={() => {}} />);
    fireEvent.click(screen.getByText("Cocoa Brown Trouser"));
    act(() => { vi.advanceTimersByTime(480); });
    fireEvent.click(screen.getByText("M"));
    fireEvent.click(screen.getByText("L"));
    expect(screen.getByText("M").parentElement?.getAttribute("aria-pressed")).toBe("true");
  });

  it("calls onSubmit on the last question send", () => {
    const onSubmit = vi.fn();
    render(<AiClarifyCard questions={questions} status="pending" onSubmit={onSubmit} onDismiss={() => {}} />);
    fireEvent.click(screen.getByText("Cocoa Brown Trouser"));
    act(() => { vi.advanceTimersByTime(480); });
    fireEvent.click(screen.getByText("M"));
    fireEvent.click(screen.getByLabelText("Send answers"));
    expect(onSubmit).toHaveBeenCalled();
  });
});
