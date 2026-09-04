import NumberFlow from "@number-flow/react";

type MetricNumberFlowProps = {
  /** Numeric amount to display. Animates only when this value changes. */
  value: number;
  /** Symbol rendered before the number (default ৳). */
  prefix?: string;
  className?: string;
};

/**
 * Rolling-number display for P&L metrics. Unlike the per-character text
 * effect, this never replays on remount or navigation — it tweens only
 * when `value` actually changes. Grouping matches `fmtBDT` (en-BD, no
 * decimals) so numbers look identical at rest.
 */
export function MetricNumberFlow({ value, prefix = "৳", className }: MetricNumberFlowProps) {
  return (
    <NumberFlow
      value={value}
      prefix={prefix}
      locales="en-BD"
      format={{ maximumFractionDigits: 0 }}
      className={className}
    />
  );
}
