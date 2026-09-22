import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import { motion, useReducedMotion } from "framer-motion";
import type { DateRange } from "react-day-picker";
import { Link } from "react-router-dom";
import { CaretDown, Funnel } from "@phosphor-icons/react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Chip } from "@/components/base/badges/chip";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/ios-spinner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  activityActionColor,
  activityActionLabel,
  activityOrderLink,
  activityTableLabel,
  groupActivityEventsByDay,
  type ActivityAction,
  type ActivityEvent,
  type ActivityLogResponse,
  type ActivityOrderTable,
  type ActivityStaffOption,
} from "@/lib/activityLogPresentation";

const ALL_ACTIONS: ActivityAction[] = [
  "confirmed",
  "cancelled",
  "created",
  "contacted",
  "reopened",
  "dismissed",
  "converted",
  "status_changed",
  "expired",
];

function dhakaToday(): Date {
  const dhakaMs = Date.now() + 6 * 60 * 60 * 1000;
  const date = new Date(dhakaMs);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function formatTaka(value: number) {
  return `৳${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("en-BD");
}

function formatDayLabel(dayKey: string) {
  const parsed = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dayKey;
  return parsed.toLocaleDateString("en-BD", { weekday: "short", day: "numeric", month: "short" });
}

function formatEventTime(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toLocaleTimeString("en-BD", { hour: "numeric", minute: "2-digit" }) : value;
}

function StaffFilter({
  staff,
  selectedUserIds,
  onChange,
}: {
  staff: ActivityStaffOption[];
  selectedUserIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (userId: string) => {
    onChange(selectedUserIds.includes(userId)
      ? selectedUserIds.filter((id) => id !== userId)
      : [...selectedUserIds, userId]);
  };
  const label = selectedUserIds.length === 0
    ? "All staff"
    : selectedUserIds.length === 1
      ? staff.find((member) => member.user_id === selectedUserIds[0])?.display_name || "1 staff member"
      : `${selectedUserIds.length} staff members`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Filter staff"
          className="flex h-8 items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-[11px] font-medium text-black transition-colors hover:border-black/25"
        >
          <Funnel size={14} weight="light" />
          <span>{label}</span>
          <CaretDown size={12} weight="light" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 border-black/10 bg-white p-2">
        <button
          type="button"
          onClick={() => onChange([])}
          className={cn(
            "w-full rounded-md px-2 py-1.5 text-left text-[11px] font-medium transition-colors",
            selectedUserIds.length === 0 ? "bg-black/[0.06] text-black" : "text-black/60 hover:bg-black/[0.04] hover:text-black",
          )}
        >
          All staff
        </button>
        <div className="my-1 border-t border-black/[0.06]" />
        <div className="max-h-60 space-y-0.5 overflow-y-auto">
          {staff.map((member) => (
            <label
              key={member.user_id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-black/75 hover:bg-black/[0.04]"
            >
              <Checkbox
                aria-label={member.display_name}
                checked={selectedUserIds.includes(member.user_id)}
                onCheckedChange={() => toggle(member.user_id)}
              />
              <span className="min-w-0 truncate">
                {member.display_name}{!member.is_active ? " · Former staff" : ""}
              </span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ActionFilter({
  actionCounts,
  selectedActions,
  onChange,
}: {
  actionCounts: Partial<Record<ActivityAction, number>>;
  selectedActions: ActivityAction[];
  onChange: (actions: ActivityAction[]) => void;
}) {
  const toggle = (action: ActivityAction) => {
    onChange(selectedActions.includes(action)
      ? selectedActions.filter((entry) => entry !== action)
      : [...selectedActions, action]);
  };
  const visibleActions = ALL_ACTIONS.filter((action) => (actionCounts[action] || 0) > 0 || selectedActions.includes(action));
  const label = selectedActions.length === 0
    ? "All actions"
    : selectedActions.length === 1
      ? activityActionLabel(selectedActions[0])
      : `${selectedActions.length} actions`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Filter actions"
          className="flex h-8 items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-[11px] font-medium text-black transition-colors hover:border-black/25"
        >
          <span>{label}</span>
          <CaretDown size={12} weight="light" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 border-black/10 bg-white p-2">
        <button
          type="button"
          onClick={() => onChange([])}
          className={cn(
            "w-full rounded-md px-2 py-1.5 text-left text-[11px] font-medium transition-colors",
            selectedActions.length === 0 ? "bg-black/[0.06] text-black" : "text-black/60 hover:bg-black/[0.04] hover:text-black",
          )}
        >
          All actions
        </button>
        <div className="my-1 border-t border-black/[0.06]" />
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {visibleActions.map((action) => (
            <label
              key={action}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[11px] text-black/75 hover:bg-black/[0.04]"
            >
              <span className="flex items-center gap-2">
                <Checkbox
                  aria-label={activityActionLabel(action)}
                  checked={selectedActions.includes(action)}
                  onCheckedChange={() => toggle(action)}
                />
                {activityActionLabel(action)}
              </span>
              <span className="tabular-nums text-black/40">{formatNumber(actionCounts[action] || 0)}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SnapshotCard({
  label,
  value,
  description,
  testId,
  delay,
  reduceMotion,
}: {
  label: string;
  value: string;
  description: string;
  testId: string;
  delay: number;
  reduceMotion: boolean | null;
}) {
  return (
    <motion.div
      data-testid={testId}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : delay, duration: 0.35 }}
      className="min-h-[92px] rounded-2xl bg-black/[0.04] px-5 py-3"
    >
      <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">{label}</p>
      <p className="mt-1 text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{value}</p>
      <p className="mt-0.5 text-[11px] text-black/60">{description}</p>
    </motion.div>
  );
}

function ActivityRow({ event, index, reduceMotion }: { event: ActivityEvent; index: number; reduceMotion: boolean | null }) {
  const link = activityOrderLink(event);
  const body = (
    <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-black/[0.03]">
      <div className="flex min-w-0 items-center gap-2.5">
        <Chip variant="caption" color={activityActionColor(event.action)} className="shrink-0 tabular-nums">
          {activityActionLabel(event.action)}
        </Chip>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-black">
            {event.actor_display_name}
            <span className="font-normal text-black/45"> · {activityTableLabel(event.order_table)}</span>
          </p>
          <p className="truncate text-[10.5px] text-black/50">{event.order_label || "—"}</p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        {event.order_value !== null && (
          <p className="text-[11px] tabular-nums text-black/70">{formatTaka(event.order_value)}</p>
        )}
        <p className="text-[10px] tabular-nums text-black/45">{formatEventTime(event.occurred_at)}</p>
      </div>
    </div>
  );

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.015, 0.2), duration: 0.2 }}
    >
      {link ? <Link to={link}>{body}</Link> : body}
    </motion.div>
  );
}

export default function ActivityLog() {
  const reduceMotion = useReducedMotion();
  const defaultRange = useMemo<DateRange>(() => {
    const today = dhakaToday();
    return { from: startOfMonth(today), to: today };
  }, []);
  const [dateRange, setDateRange] = useState<DateRange | null>(defaultRange);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [tableFilter, setTableFilter] = useState<"all" | ActivityOrderTable>("all");
  const [selectedActions, setSelectedActions] = useState<ActivityAction[]>([]);
  const [page, setPage] = useState(0);
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  const from = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
  const to = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;
  const selectedStaffKey = selectedUserIds.join(",");
  const selectedActionsKey = selectedActions.join(",");

  // Reset only the page cursor on a filter change. The list itself is left
  // alone — placeholderData below keeps the previous results on screen until
  // the new filter's data arrives, so switching tabs updates in place instead
  // of blanking the whole page back to a loading spinner.
  useEffect(() => {
    setPage(0);
  }, [from, to, selectedStaffKey, tableFilter, selectedActionsKey]);

  const activityQuery = useQuery({
    queryKey: ["activity-log", from, to, selectedStaffKey, tableFilter, selectedActionsKey, page],
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ActivityLogResponse> => {
      const params = new URLSearchParams();
      if (from && to) {
        params.set("from", from);
        params.set("to", to);
      }
      if (selectedUserIds.length > 0) params.set("users", selectedUserIds.join(","));
      if (tableFilter !== "all") params.set("table", tableFilter);
      if (selectedActions.length > 0) params.set("action", selectedActions.join(","));
      if (page > 0) params.set("page", String(page));
      const queryString = params.toString();
      const response = await apiFetch(`/api/reports/activity${queryString ? `?${queryString}` : ""}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Could not load activity log");
      return body as ActivityLogResponse;
    },
  });

  useEffect(() => {
    if (!activityQuery.data) return;
    setEvents((current) => (page === 0 ? activityQuery.data!.events : [...current, ...activityQuery.data!.events]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityQuery.data]);

  // Keeps the header, filters, and counts on screen if a later background
  // refetch (e.g. a flaky connection while switching tabs) fails, instead of
  // the page reverting to a bare error/blank state after data was showing.
  const [lastGoodData, setLastGoodData] = useState<ActivityLogResponse | null>(null);
  useEffect(() => {
    if (activityQuery.data) setLastGoodData(activityQuery.data);
  }, [activityQuery.data]);

  const dayGroups = useMemo(() => groupActivityEventsByDay(events), [events]);

  if (activityQuery.isLoading && events.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-96px)] items-center justify-center bg-[#FAFAF8]">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" className="text-black" />
          <span className="text-sm font-medium text-black/60">Loading activity log</span>
        </div>
      </div>
    );
  }

  if (activityQuery.isError && events.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-96px)] items-center justify-center bg-[#FAFAF8]">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-medium text-black/60">Could not load activity log</p>
          <Button type="button" variant="outline" size="sm" onClick={() => activityQuery.refetch()}>Try again</Button>
        </div>
      </div>
    );
  }

  const data = activityQuery.data ?? lastGoodData;
  if (!data) return null;
  const isBackgroundRefreshing = activityQuery.isFetching && activityQuery.isPlaceholderData;

  const counts = data.action_counts;
  const confirmedCount = counts.confirmed || 0;
  const cancelledCount = counts.cancelled || 0;
  const cartFollowUps = (counts.contacted || 0) + (counts.dismissed || 0) + (counts.reopened || 0) + (counts.converted || 0);

  return (
    <div className="min-h-full space-y-6 bg-[#FAFAF8] p-1 lg:p-2">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-4"
      >
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-sf-display text-[22px] font-bold tracking-tight text-black">Activity Log</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-black/60">Who confirmed, cancelled, or followed up on every order, using Asia/Dhaka dates.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data.available_staff.length > 1 && (
              <StaffFilter
                staff={data.available_staff}
                selectedUserIds={selectedUserIds}
                onChange={setSelectedUserIds}
              />
            )}
            <ActionFilter
              actionCounts={counts}
              selectedActions={selectedActions}
              onChange={setSelectedActions}
            />
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <button
              type="button"
              aria-label="Refresh activity log"
              onClick={() => activityQuery.refetch()}
              disabled={activityQuery.isFetching}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-black/50 transition-colors hover:bg-black/[0.05] hover:text-black disabled:opacity-40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={activityQuery.isFetching ? "animate-spin" : ""}><path opacity="0.5" d="M3.46447 3.46447C2 4.92893 2 7.28595 2 12C2 16.714 2 19.0711 3.46447 20.5355C4.92893 22 7.28595 22 12 22C16.714 22 19.0711 22 20.5355 20.5355C22 19.0711 22 16.714 22 12C22 7.28595 22 4.92893 20.5355 3.46447C19.0711 2 16.714 2 12 2C7.28595 2 4.92893 2 3.46447 3.46447Z" fill="currentColor" /><path d="M12.0096 5.25C8.62406 5.25 5.83333 7.79988 5.46058 11.0833H5.00002C4.69658 11.0833 4.42304 11.2662 4.30701 11.5466C4.19099 11.8269 4.25534 12.1496 4.47005 12.364L5.63832 13.5307C5.93113 13.8231 6.40544 13.8231 6.69825 13.5307L7.86651 12.364C8.08122 12.1496 8.14558 11.8269 8.02955 11.5466C7.91353 11.2662 7.63998 11.0833 7.33654 11.0833H6.97332C7.33642 8.63219 9.45215 6.75 12.0096 6.75C13.541 6.75 14.9136 7.42409 15.8479 8.49347C16.1204 8.80539 16.5942 8.83733 16.9061 8.56479C17.2181 8.29226 17.25 7.81846 16.9775 7.50653C15.7702 6.12471 13.9916 5.25 12.0096 5.25Z" fill="currentColor" /><path d="M18.3618 10.4693C18.069 10.1769 17.5947 10.1769 17.3018 10.4693L16.1336 11.636C15.9189 11.8504 15.8545 12.1731 15.9705 12.4534C16.0866 12.7338 16.3601 12.9167 16.6636 12.9167H17.0268C16.6637 15.3678 14.548 17.25 11.9905 17.25C10.4591 17.25 9.08654 16.5759 8.15222 15.5065C7.87968 15.1946 7.40589 15.1627 7.09396 15.4352C6.78203 15.7077 6.7501 16.1815 7.02263 16.4935C8.22995 17.8753 10.0085 18.75 11.9905 18.75C15.376 18.75 18.1668 16.2001 18.5395 12.9167H19.0001C19.3035 12.9167 19.5771 12.7338 19.6931 12.4534C19.8091 12.1731 19.7448 11.8504 19.53 11.636L18.3618 10.4693Z" fill="currentColor" /></svg>
            </button>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SnapshotCard
            label="Total events"
            value={formatNumber(data.total)}
            description="Matching the current filters"
            testId="activity-log-summary-total"
            delay={0.02}
            reduceMotion={reduceMotion}
          />
          <SnapshotCard
            label="Confirmed"
            value={formatNumber(confirmedCount)}
            description="Orders confirmed by staff"
            testId="activity-log-summary-confirmed"
            delay={0.06}
            reduceMotion={reduceMotion}
          />
          <SnapshotCard
            label="Cancelled"
            value={formatNumber(cancelledCount)}
            description="Orders cancelled by staff"
            testId="activity-log-summary-cancelled"
            delay={0.1}
            reduceMotion={reduceMotion}
          />
          <SnapshotCard
            label="Cart follow-ups"
            value={formatNumber(cartFollowUps)}
            description="Contacted, dismissed, or converted"
            testId="activity-log-summary-cart-followups"
            delay={0.14}
            reduceMotion={reduceMotion}
          />
        </div>

        <div className="flex items-center border-b border-black/10 pb-3">
          <SegmentedControl
            aria-label="Filter by order type"
            selectedKeys={new Set([tableFilter])}
            onSelectionChange={(keys) => {
              const next = [...keys][0];
              if (next) setTableFilter(next as "all" | ActivityOrderTable);
            }}
          >
            <SegmentedControlItem id="all">All</SegmentedControlItem>
            <SegmentedControlItem id="orders">Orders</SegmentedControlItem>
            <SegmentedControlItem id="social_inbox_orders">Inbox orders</SegmentedControlItem>
            <SegmentedControlItem id="abandoned_checkouts">Abandoned carts</SegmentedControlItem>
          </SegmentedControl>
        </div>
      </motion.div>

      {events.length === 0 ? (
        <div className="border-y border-black/[0.08] py-12 text-center text-[12px] text-black/60">
          No staff activity is recorded for this range yet.
        </div>
      ) : (
        <motion.section
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: isBackgroundRefreshing ? 0.5 : 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.1, duration: 0.2 }}
          aria-label="Activity feed"
        >
          <div className="space-y-5">
            {dayGroups.map((group) => (
              <div key={group.dayKey}>
                <div className="flex items-center gap-2.5 pb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/50">{formatDayLabel(group.dayKey)}</p>
                  <div className="h-px flex-1 bg-black/[0.06]" />
                </div>
                <div className="overflow-hidden rounded-2xl bg-black/[0.04]">
                  {group.events.map((event, index) => (
                    <ActivityRow key={event.id} event={event} index={index} reduceMotion={reduceMotion} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {data.has_more && (
            <div className="flex justify-center pt-5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={activityQuery.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                {activityQuery.isFetching ? <Spinner size="sm" /> : "Load more"}
              </Button>
            </div>
          )}
        </motion.section>
      )}
    </div>
  );
}
