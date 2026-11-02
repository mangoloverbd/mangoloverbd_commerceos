import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DeviceMobile, Prohibit } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";

type BlockKind = "phone" | "device";
type BlockState = { available: boolean; blocked: boolean };
export type OrderBlockStatus = Record<BlockKind, BlockState>;

const LABELS: Record<BlockKind, { block: string; blocked: string; unavailable: string }> = {
  phone: { block: "Block number", blocked: "Number blocked", unavailable: "This order has no valid phone number" },
  device: { block: "Block device", blocked: "Device blocked", unavailable: "No device was recorded for this order" },
};

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || fallback);
  return body as T;
}

export function OrderBlockButtons({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();
  // Blocking is admin-only: the server refuses team members (403), so the
  // status never loads and the buttons stay hidden.
  const queryKey = ["order-block-status", orderId];
  const statusQuery = useQuery({
    queryKey,
    retry: false,
    queryFn: async () => readJson<OrderBlockStatus>(await apiFetch(`/api/orders/${orderId}/block-status`), "Could not load block status"),
  });
  const mutation = useMutation({
    mutationFn: async ({ kind, blocked }: { kind: BlockKind; blocked: boolean }) =>
      readJson<OrderBlockStatus>(await apiFetch(`/api/orders/${orderId}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, blocked }),
      }), "Could not update block"),
    onSuccess: (status, { kind, blocked }) => {
      queryClient.setQueryData(queryKey, status);
      toast.success(blocked ? `${kind === "phone" ? "Number" : "Device"} blocked from ordering` : `${kind === "phone" ? "Number" : "Device"} unblocked`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!statusQuery.data?.phone || !statusQuery.data?.device) return null;

  return (
    <div data-testid="order-block-buttons" className="flex items-center gap-2">
      {(["phone", "device"] as const).map((kind) => {
        const state = statusQuery.data[kind];
        const Icon = kind === "phone" ? Prohibit : DeviceMobile;
        const label = state.blocked ? LABELS[kind].blocked : LABELS[kind].block;
        return (
          <button
            key={kind}
            type="button"
            disabled={!state.available || mutation.isPending}
            title={!state.available ? LABELS[kind].unavailable : state.blocked ? "Click to unblock" : undefined}
            aria-pressed={state.blocked}
            onClick={() => mutation.mutate({ kind, blocked: !state.blocked })}
            className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 disabled:cursor-not-allowed disabled:opacity-40 ${state.blocked ? "bg-red-600 text-white hover:bg-red-700" : "bg-black/[0.04] text-black hover:bg-black/[0.08]"}`}
          >
            <Icon weight="light" size={14} aria-hidden="true" className="shrink-0" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
