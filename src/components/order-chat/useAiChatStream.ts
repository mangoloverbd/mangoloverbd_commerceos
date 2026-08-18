import { useCallback } from "react";
import { apiFetch } from "@/lib/api";

export type ClarifyQuestion = { q: string; type: "radio" | "check"; options: string[] };

export type Recommendation = {
  key: string;
  summary: string;
  args: Record<string, unknown>;
  signal: 0 | 1 | 2 | 3;
  tone: "green" | "orange" | "ink";
  label: string;
  cta: string;
};

export type StreamEvent =
  | { type: "delta"; content: string }
  | { type: "question"; call_id: string; questions: ClarifyQuestion[] }
  | {
      type: "action";
      call_id: string;
      tool: string;
      recommendation: Recommendation | null;
      alternatives: Recommendation[];
    };

type SendArgs = {
  messages: { role: "user" | "assistant"; content: string }[];
  model: string;
  signal?: AbortSignal;
  onEvent: (e: StreamEvent) => void;
  onDone: () => void;
  onError: (err: string) => void;
};

export function useAiChatStream() {
  return useCallback(async ({ messages, model, signal, onEvent, onDone, onError }: SendArgs) => {
    let resp: Response;
    try {
      resp = await apiFetch("/api/order-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, model }),
        signal,
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      onError(err instanceof Error ? err.message : "Network error");
      return;
    }

    if (resp.status === 404) {
      onError("Chat backend is not active yet. Restart localhost so the new /api/order-chat route is loaded.");
      return;
    }
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      onError((data as { error?: string }).error || `Error ${resp.status}`);
      return;
    }
    if (!resp.body) {
      onError("No response body");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;

    while (!done) {
      const { done: d, value } = await reader.read();
      if (d) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") {
          done = true;
          break;
        }
        try {
          const parsed = JSON.parse(json);
          if (parsed.delta?.content) onEvent({ type: "delta", content: parsed.delta.content });
          else if (parsed.question) onEvent({ type: "question", call_id: parsed.question.call_id, questions: parsed.question.questions || [] });
          else if (parsed.action) onEvent({
            type: "action",
            call_id: parsed.action.call_id,
            tool: parsed.action.tool,
            recommendation: parsed.action.recommendation || null,
            alternatives: parsed.action.alternatives || [],
          });
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }
    onDone();
  }, []);
}
