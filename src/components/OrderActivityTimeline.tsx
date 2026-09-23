import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/ios-spinner";
import { Chip } from "@/components/base/badges/chip";
import { activityActionColor, type ActivityAction } from "@/lib/activityLogPresentation";
import {
  ORDER_ACTIVITY_PREFETCH_STALE_MS,
  orderActivityQueryOptions,
  type OrderActivityEvent as Event,
} from "@/lib/orderActivityQuery";
import { activityReasonLabel, layoutActivityChanges } from "@/lib/orderActivityPresentation";
import { OrderActivityChangeList, OrderActivityChangeSummary } from "@/components/OrderActivityChangeDetails";

const RECENT_LIMIT = 5;
const ACTIVITY_ACTIONS = new Set<ActivityAction>([
  "created", "confirmed", "cancelled", "status_changed", "contacted", "reopened",
  "dismissed", "converted", "expired", "viewed", "edited", "assigned", "messaged",
  "fraud_checked", "courier_updated", "printed",
]);

const humanize = (value?: string | null) =>
  value
    ? value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
    : "Unknown";

const timestamp = (value?: string | null) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toLocaleString("en-BD")
    : "From rollout";

const timeAgo = (value?: string | null) => {
  const time = value ? new Date(value).getTime() : Number.NaN;
  if (!Number.isFinite(time)) return "From rollout";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return timestamp(value);
};

const display = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "Not set";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
};

function eventChipColor(event?: Event) {
  const eventType = event?.event_type || event?.action || "";
  if (/cancelled|deleted|failed|dismissed|expired/.test(eventType)) return "rose" as const;
  if (eventType.startsWith("courier.")) return "lime" as const;
  if (eventType === "order.created" || eventType === "converted") return "lime" as const;
  if (eventType === "history.started" || eventType === "order.status_changed") return "yellow" as const;
  if (eventType === "order.edited") return "purple" as const;
  if (eventType === "fraud.checked") return "yellow" as const;
  if (eventType === "message.sent") return "blue" as const;
  if (eventType === "document.printed") return "soft" as const;

  const action = eventType.includes(".") ? eventType.split(".").at(-1) : eventType;
  return action && ACTIVITY_ACTIONS.has(action as ActivityAction)
    ? activityActionColor(action as ActivityAction)
    : "soft";
}

function ActivityLogIcon() {
  return (
    <svg
      data-testid="activity-log-icon"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      className="text-black/60"
    >
      <path fill="currentColor" d="M20.3116 12.6473L20.8293 10.7154C21.4335 8.46034 21.7356 7.3328 21.5081 6.35703C21.3285 5.58657 20.9244 4.88668 20.347 4.34587C19.6157 3.66095 18.4881 3.35883 16.2331 2.75458C13.978 2.15033 12.8504 1.84821 11.8747 2.07573C11.1042 2.25537 10.4043 2.65945 9.86351 3.23687C9.27709 3.86298 8.97128 4.77957 8.51621 6.44561C8.43979 6.7254 8.35915 7.02633 8.27227 7.35057L7.75458 9.28263C7.15033 11.5377 6.84821 12.6652 7.07573 13.641C7.25537 14.4115 7.65945 15.1114 8.23687 15.6522C8.96815 16.3371 10.0957 16.6392 12.3508 17.2435C14.3834 17.7881 15.4999 18.0873 16.415 17.9744C16.5152 17.9621 16.6129 17.9448 16.7092 17.9223C17.4796 17.7427 18.1795 17.3386 18.7203 16.7612C19.4052 16.0299 19.7074 14.9024 20.3116 12.6473Z" />
      <path opacity="0.5" fill="currentColor" d="M16.4149 17.9745C16.2064 18.6128 15.8398 19.1903 15.347 19.6519C14.6157 20.3368 13.4881 20.6389 11.2331 21.2432C8.97798 21.8474 7.85044 22.1496 6.87466 21.922C6.10421 21.7424 5.40432 21.3383 4.86351 20.7609C4.17859 20.0296 3.87647 18.9021 3.27222 16.647L2.75458 14.7152C2.15033 12.4601 1.84821 11.3325 2.07573 10.3568C2.25537 9.5863 2.65945 8.88641 3.23687 8.3456C3.96815 7.66068 5.09569 7.35856 7.35077 6.75431C7.7774 6.64 8.16369 6.53649 8.51621 6.44534C8.43979 6.72513 8.3591 7.02657 8.27222 7.35081L7.75458 9.28266C7.15033 11.5377 6.84821 12.6653 7.07573 13.6411C7.25537 14.4115 7.65945 15.1114 8.23687 15.6522C8.96815 16.3371 10.0957 16.6393 12.3508 17.2435C14.3833 17.7881 15.4999 18.0873 16.4149 17.9745Z" />
    </svg>
  );
}

function ReasonLine({ event }: { event: Event }) {
  if (!event.reason_code && !event.reason_note) return null;
  return (
    <p className="text-[11px] text-black/65">
      {event.reason_code && <span>{activityReasonLabel(event.reason_code)}</span>}
      {event.reason_code && event.reason_note ? " · " : null}
      {event.reason_note && <span>{event.reason_note}</span>}
    </p>
  );
}

function EventHeading({ event, heading }: { event: Event; heading: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Chip
        variant="caption"
        color={eventChipColor(event)}
        className="max-w-[70%] overflow-hidden text-ellipsis"
      >
        {heading}
      </Chip>
      <span className="truncate text-[11px] font-normal text-black/50">by {event.actor_display_name}</span>
    </span>
  );
}

/** Full-page Logs row: heading on the left, what changed in the middle, time on the right. */
function FullEventRow({ event }: { event: Event }) {
  const changes = event.changes || [];
  const layout = layoutActivityChanges(changes);
  const summary = event.summary || humanize(event.event_type || event.action);
  // The status chips already say where it moved to, so the heading stays short.
  const heading = layout.status && /^status changed/i.test(summary) ? "Status changed" : summary;
  const hasInline = Boolean(
    layout.status || layout.total || layout.items.length || layout.inlineFields.length
    || event.reason_code || event.reason_note,
  );
  const hasList = layout.items.length > 0 || layout.listFields.length > 0;

  return (
    <li
      data-testid="activity-event"
      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-2 border-b border-black/[0.05] py-3 last:border-0 sm:grid-cols-[minmax(14rem,1fr)_auto_minmax(14rem,1fr)]"
    >
      <div data-testid="activity-event-heading" className="min-w-0 sm:pt-0.5">
        <EventHeading event={event} heading={heading} />
        <p className="mt-1 pl-1 text-[10px] text-black/40">{timestamp(event.occurred_at)}</p>
      </div>

      {hasInline && (
        <div
          data-testid="activity-event-inline"
          className="col-span-2 row-start-2 flex min-w-0 flex-col gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:items-center sm:text-center"
        >
          <OrderActivityChangeSummary layout={layout} />
          <ReasonLine event={event} />
        </div>
      )}

      <div
        data-testid="activity-event-time"
        className="col-start-2 row-start-1 whitespace-nowrap pt-1 text-right text-[10px] text-black/45 sm:col-start-3"
      >
        {timeAgo(event.occurred_at)}
      </div>

      {hasList && (
        <div
          data-testid="activity-event-changes"
          className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2"
        >
          <OrderActivityChangeList layout={layout} />
        </div>
      )}
    </li>
  );
}

/** Compact popover row: collapsed overview that expands to a before/after table. */
function EventRow({ event }: { event: Event }) {
  const [open, setOpen] = useState(false);
  const changes = event.changes || [];
  const summary = event.summary || humanize(event.event_type || event.action);

  return (
    <li data-testid="activity-event" className="border-b border-black/[0.05] last:border-0">
      <button
        type="button"
        aria-label={`${open ? "Collapse" : "Expand"}: ${summary}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 py-2 text-left"
      >
        <span className="flex min-w-0 flex-1"><EventHeading event={event} heading={summary} /></span>
        <span className="shrink-0 text-[10px] text-black/45">{timeAgo(event.occurred_at)}</span>
        {open ? (
          <CaretUp size={11} weight="light" className="shrink-0 text-black/50" />
        ) : (
          <CaretDown size={11} weight="light" className="shrink-0 text-black/50" />
        )}
      </button>

      {open && (
        <div className="pb-2 pl-1">
          <ReasonLine event={event} />

          {changes.length > 0 && (
            <dl className="mt-1.5 divide-y divide-black/[0.05] border-t border-black/[0.06]">
              {changes.map((change, index) => (
                <div
                  key={`${change.field || change.type || "change"}-${index}`}
                  className="grid grid-cols-[minmax(80px,.7fr)_1fr_auto_1fr] gap-2 py-1.5 text-[10px]"
                >
                  <dt className="font-medium text-black/60">{change.label || humanize(change.field || change.type)}</dt>
                  <dd className="break-words text-black/55">{display(change.before)}</dd>
                  <span aria-hidden="true">→</span>
                  <dd className="break-words text-black">
                    {display(change.after)}
                    {change.addition_reason
                      ? ` (${activityReasonLabel(change.addition_reason)})`
                      : ""}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <p className="mt-1 text-[10px] text-black/40">{timestamp(event.occurred_at)}</p>
        </div>
      )}
    </li>
  );
}

const LIVE_POLL_MS = 2_000;

export type OrderActivityTimelineVariant = "compact" | "full";

export function OrderActivityTimeline({
  endpoint,
  enabled = true,
  variant = "compact",
}: {
  endpoint: string;
  enabled?: boolean;
  variant?: OrderActivityTimelineVariant;
}) {
  const [all, setAll] = useState(false);
  const full = variant === "full";
  const query = useQuery({
    ...orderActivityQueryOptions(endpoint),
    enabled,
    staleTime: full ? 0 : ORDER_ACTIVITY_PREFETCH_STALE_MS,
    // Polling pauses automatically while the browser tab is hidden.
    refetchInterval: full ? LIVE_POLL_MS : false,
    refetchOnWindowFocus: full ? "always" : undefined,
  });

  if (!enabled) return null;

  const events = query.data?.events || [];
  const provenance = query.data?.provenance;
  const visibleEvents = full || all ? events : events.slice(0, RECENT_LIMIT);
  const latestEvent = events[0];
  const oldestEvent = events.at(-1);

  return (
    <section aria-label="Order activity" className={full ? "bg-white px-5 py-4" : "rounded-xl bg-white p-3"}>
      <div className="flex items-center gap-1.5">
        <ActivityLogIcon />
        <p className="text-[8px] font-medium uppercase tracking-[0.25em] text-black/60">Activity</p>
        {full && (
          <span
            data-testid="activity-live-indicator"
            className="ml-auto flex items-center gap-1.5 text-[10px] font-medium text-black/55"
          >
            <span aria-hidden className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        )}
      </div>

      {query.isLoading ? (
        <div className="mt-3 flex gap-2 text-[11px]"><Spinner size="sm" />Loading activity</div>
      ) : query.isError ? (
        <p className="mt-3 text-[11px] text-black/50">Could not load activity for this order.</p>
      ) : (
        <>
          {provenance && (
            <div className="mt-3 grid gap-px overflow-hidden rounded-lg bg-black/[0.06] sm:grid-cols-3">
              <div className="bg-[#FAFAF8] p-2.5">
                <p className="text-[8px] uppercase tracking-[.2em] text-black/45">Origin</p>
                <div className="mt-1"><Chip variant="caption" color="cyan">{humanize(provenance.origin_source)}</Chip></div>
                <p className="mt-1 text-[10px] text-black/45">Created {timestamp(provenance.created_at)}</p>
              </div>
              <div className="bg-[#FAFAF8] p-2.5">
                <p className="text-[8px] uppercase tracking-[.2em] text-black/45">Latest activity</p>
                <div className="mt-1">
                  <Chip variant="caption" color={eventChipColor(latestEvent)}>
                    {latestEvent?.summary || "No recorded activity"}
                  </Chip>
                </div>
                {latestEvent && (
                  <p className="mt-1 text-[10px] text-black/45">
                    {latestEvent.actor_display_name} · {timeAgo(latestEvent.occurred_at)}
                  </p>
                )}
              </div>
              <div className="bg-[#FAFAF8] p-2.5">
                <p className="text-[8px] uppercase tracking-[.2em] text-black/45">History</p>
                <div className="mt-1">
                  <Chip variant="caption" color="purple">
                    {events.length} event{events.length === 1 ? "" : "s"}
                  </Chip>
                </div>
                <p className="mt-1 text-[10px] text-black/45">
                  Tracking since {timestamp(oldestEvent?.occurred_at || provenance.created_at)}
                </p>
              </div>
            </div>
          )}

          <ol className="mt-1">{visibleEvents.map((event) => (full ? <FullEventRow key={event.id} event={event} /> : <EventRow key={event.id} event={event} />))}</ol>
          {!full && events.length > RECENT_LIMIT && (
            <button type="button" onClick={() => setAll(!all)} className="mt-3 text-[11px] font-medium underline">
              {all ? "Show recent activity" : "View all activity"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
