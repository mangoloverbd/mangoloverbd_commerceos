import { useState } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useOrgName } from "@/hooks/useOrgName";
import { useUserRole } from "@/hooks/useUserRole";
import { AskEdithBar } from "@/components/home/AskEdithBar";
import { AttentionCards } from "@/components/home/AttentionCards";
import { DottedGlobe } from "@/components/home/DottedGlobe";
import { HomeMetricStrip } from "@/components/home/HomeMetricStrip";
import { HomeScopeControls, type HomeChannel } from "@/components/home/HomeScopeControls";
import { QuickActions } from "@/components/home/QuickActions";
import type { HomeSummary } from "@/components/home/types";

const REFRESH_MS = 30_000;

function dhakaToday(): Date {
  const local = new Date(Date.now() + 6 * 60 * 60 * 1000);
  return new Date(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

// null is the picker's "All Time".
function summaryUrl(range: DateRange | null, channel: HomeChannel) {
  const params = new URLSearchParams();
  if (!range?.from) params.set("range", "all");
  else {
    params.set("from", format(range.from, "yyyy-MM-dd"));
    params.set("to", format(range.to ?? range.from, "yyyy-MM-dd"));
  }
  if (channel !== "all") params.set("channel", channel);
  return `/api/home/summary?${params}`;
}

function CardSkeletons() {
  return (
    <div aria-hidden="true" className="grid grid-cols-3 gap-5 px-5 pb-5 max-[1200px]:grid-cols-1 max-md:px-4">
      {[0, 1, 2].map((index) => (
        <div key={index} className="min-h-[440px] animate-pulse rounded-[26px] border border-[#ECEAE4] bg-white/70" />
      ))}
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { orgName } = useOrgName();
  const { isAdmin } = useUserRole();
  const [range, setRange] = useState<DateRange | null>(() => {
    const today = dhakaToday();
    return { from: today, to: today };
  });
  const [channel, setChannel] = useState<HomeChannel>("all");
  const url = summaryUrl(range, channel);
  const { data, isError } = useQuery({
    queryKey: [url],
    // Keep the last numbers on screen while a new period or channel loads.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await apiFetch(url);
      if (!res.ok) throw new Error("Failed to load Home");
      return (await res.json()) as HomeSummary;
    },
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    staleTime: REFRESH_MS,
  });

  // Only a real name makes the greeting personal; an email prefix doesn't.
  const fullName = typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  const greeting = fullName ? `Hey ${fullName.split(/\s+/)[0]}!` : "Hey there!";

  return (
    <div data-testid="home-page" className="relative min-h-full overflow-hidden bg-[#FAFAF8] font-sans text-[#111110]">
      <HomeMetricStrip
        metrics={data?.metrics}
        liveCount={data?.live.count ?? null}
        isAdmin={isAdmin}
        scope={<HomeScopeControls range={range} onRangeChange={setRange} channel={channel} onChannelChange={setChannel} />}
      />

      <section className="relative -mt-20 flex min-h-[640px] flex-col items-center justify-center px-4 pb-20 pt-10 max-md:mt-0 max-md:min-h-[520px]">
        <DottedGlobe visitors={data?.live.visitors ?? []} />
        <h1 className="relative z-[2] text-center text-[40px] font-medium leading-[1.2] tracking-[-0.02em] text-[#8C8A84] max-md:text-[28px]">
          {greeting}
          <span className="block text-[#111110]">Let's keep {orgName || "Mango Lover BD"} growing.</span>
        </h1>
        <AskEdithBar />
        <QuickActions actions={data?.quick_actions ?? []} />
        {isError && !data && (
          <p role="status" className="relative z-[2] mt-6 text-[13px] text-[#8C8A84]">
            Today's numbers couldn't load. They'll retry in a moment.
          </p>
        )}
      </section>

      {data ? <AttentionCards cards={data.attention} /> : <CardSkeletons />}
    </div>
  );
}
