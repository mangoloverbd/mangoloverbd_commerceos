import { useQuery } from "@tanstack/react-query";
import { ClockCounterClockwise } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { Spinner } from "@/components/ui/ios-spinner";
import { Chip } from "@/components/base/badges/chip";
import { activityActionColor, activityActionLabel, type ActivityAction } from "@/lib/activityLogPresentation";

type TimelineEvent = {
  id: string;
  occurred_at: string;
  action: ActivityAction;
  actor_id: string | null;
  actor_display_name: string;
};

type TimelineResponse = { events: TimelineEvent[] };

function formatTimelineTimestamp(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toLocaleString("en-BD") : value;
}

// Compact, read-only "who did what and when" strip for a single order. Shares
// its vocabulary with the Activity Log report page so a staff member sees the
// same language whether they're looking at one order or the whole feed.
export function OrderActivityTimeline({
  endpoint,
  enabled = true,
}: {
  endpoint: string;
  enabled?: boolean;
}) {
  const activityQuery = useQuery({
    queryKey: [endpoint],
    enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<TimelineResponse> => {
      const response = await apiFetch(endpoint);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Could not load activity");
      return body as TimelineResponse;
    },
  });

  if (!enabled) return null;

  return (
    <div className="rounded-xl bg-white p-3">
      <div className="flex items-center gap-1.5">
        <ClockCounterClockwise size={13} weight="light" className="text-black/50" />
        <p className="text-[8px] font-medium uppercase tracking-[0.25em] text-black/60">Activity</p>
      </div>

      {activityQuery.isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-black/50">
          <Spinner size="sm" />
          <span>Loading activity</span>
        </div>
      ) : activityQuery.isError ? (
        <p className="mt-3 text-[11px] text-black/50">Could not load activity for this order.</p>
      ) : (activityQuery.data?.events?.length ?? 0) === 0 ? (
        <p className="mt-3 text-[11px] text-black/50">No recorded activity yet.</p>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {activityQuery.data!.events.map((event) => (
            <li key={event.id} className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Chip variant="caption" color={activityActionColor(event.action)}>
                  {activityActionLabel(event.action)}
                </Chip>
                <span className="truncate text-[11px] font-medium text-black">{event.actor_display_name}</span>
              </div>
              <span className="shrink-0 text-[10px] tabular-nums text-black/50">{formatTimelineTimestamp(event.occurred_at)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
