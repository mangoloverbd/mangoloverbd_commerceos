import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CaretDown, CaretUp, ClockCounterClockwise } from "@phosphor-icons/react";
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
  from_status?: string | null;
  to_status?: string | null;
};

type TimelineResponse = { events: TimelineEvent[] };

const RECENT_LIMIT = 5;

function formatTimelineTimestamp(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toLocaleString("en-BD") : value;
}

function formatTimelineRelative(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return value;
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatTimelineTimestamp(value);
}

function humanizeStatus(value?: string | null) {
  if (!value) return "—";
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
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

  const events = activityQuery.data?.events ?? [];
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const visibleEvents = showAll ? events : events.slice(0, RECENT_LIMIT);

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
      ) : events.length === 0 ? (
        <p className="mt-3 text-[11px] text-black/50">No recorded activity yet.</p>
      ) : (
        <>
          <ol className="mt-1">
            {visibleEvents.map((event) => {
              const open = openId === event.id;
              const label = activityActionLabel(event.action);
              return (
                <li key={event.id} className="border-b border-black/[0.05] last:border-0">
                  <button
                    type="button"
                    aria-label={`${open ? "Collapse" : "Expand"}: ${label}`}
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : event.id)}
                    className="flex w-full items-center gap-2 py-2 text-left"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <Chip variant="caption" color={activityActionColor(event.action)}>
                        {label}
                      </Chip>
                      <span className="truncate text-[11px] font-medium text-black">{event.actor_display_name}</span>
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-black/50">{formatTimelineRelative(event.occurred_at)}</span>
                    {open ? <CaretUp size={11} weight="light" className="shrink-0 text-black/50" /> : <CaretDown size={11} weight="light" className="shrink-0 text-black/50" />}
                  </button>
                  {open && (
                    <div className="pb-2 pl-1 text-[11px] text-black/65">
                      {event.from_status || event.to_status ? (
                        <p>{humanizeStatus(event.from_status)} <span aria-hidden="true">→</span> {humanizeStatus(event.to_status)}</p>
                      ) : (
                        <p>{label}</p>
                      )}
                      <p className="mt-0.5 text-[10px] text-black/40">{formatTimelineTimestamp(event.occurred_at)}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {events.length > RECENT_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="mt-2 text-[11px] font-medium underline"
            >
              {showAll ? "Show recent activity" : `View all ${events.length} activity`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
