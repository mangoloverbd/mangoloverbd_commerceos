import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendStream, config } = vi.hoisted(() => ({
  sendStream: vi.fn(async (options?: { onDone?: () => void }) => options?.onDone?.()),
  config: { resolve: (_cfg: { aiProvider: string; aiDefaultModel?: string }) => {} },
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async () => new Response(JSON.stringify({ conversations: [] }), { status: 200 })),
  getAppConfig: vi.fn(() => new Promise((resolve) => { config.resolve = resolve; })),
}));
vi.mock("@/components/order-chat/useAiChatStream", () => ({ useAiChatStream: () => sendStream }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ role: "admin", isAdmin: true, loading: false }) }));

import OrderChat from "@/pages/OrderChat";

function renderChat(state?: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[{ pathname: "/order-chat", state }]}>
        <Routes>
          <Route path="/order-chat" element={<OrderChat />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Ask Edith prefill from Home", () => {
  beforeEach(() => sendStream.mockClear());

  it("sends the Home question once, after the model config has loaded", async () => {
    renderChat({ prompt: "Which orders are risky today?" });
    expect(sendStream).not.toHaveBeenCalled();

    config.resolve({ aiProvider: "openrouter", aiDefaultModel: "dots-studio/dots-3-note-preview:free" });

    await waitFor(() => expect(sendStream).toHaveBeenCalledTimes(1));
    const call = sendStream.mock.calls[0][0] as { messages: { content: string }[]; model: string };
    expect(call.messages.at(-1)?.content).toContain("Which orders are risky today?");
    expect(call.model).toBe("dots-studio/dots-3-note-preview:free");
  });

  it("does nothing without a prompt", async () => {
    renderChat();
    config.resolve({ aiProvider: "openai" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sendStream).not.toHaveBeenCalled();
  });
});
