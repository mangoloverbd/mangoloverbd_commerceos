import type { ReactNode } from "react";

const MOBILE_PNL_ORDER = [
  "revenue",
  "net-profit",
  "ad-spend",
  "shipping",
  "cog",
] as const;

export type MobilePnlMetric = {
  key: (typeof MOBILE_PNL_ORDER)[number];
  label: string;
};

type MobilePnlLayoutProps = {
  metrics: readonly MobilePnlMetric[];
  renderMetric: (metric: MobilePnlMetric) => ReactNode;
};

export function MobilePnlLayout({ metrics, renderMetric }: MobilePnlLayoutProps) {
  const metricsByKey = new Map(metrics.map((metric) => [metric.key, metric]));
  const getMetric = (key: MobilePnlMetric["key"]) => metricsByKey.get(key);

  return (
    <div
      data-testid="mobile-pnl"
      data-order={MOBILE_PNL_ORDER.join(",")}
      className="relative z-10 grid gap-3 md:hidden"
    >
      {getMetric("revenue") && (
        <div className="mobile-pnl-revenue">
          {renderMetric(getMetric("revenue")!)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {(["net-profit", "ad-spend", "shipping", "cog"] as const).map((key) => {
          const metric = getMetric(key);
          if (!metric) return null;
          return (
            <div key={key} className="mobile-pnl-supporting min-w-0">
              {renderMetric(metric)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
