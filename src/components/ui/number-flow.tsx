import NumberFlow, { type Format } from "@number-flow/react";
import { useEffect, useState } from "react";

const DEFAULT_FORMAT: Format = { maximumFractionDigits: 0 };

type MetricNumberFlowProps = {
  /** Numeric amount to display. Animates only when this value changes. */
  value: number;
  /** Symbol rendered before the number (default ৳). */
  prefix?: string;
  /** Text rendered after the number, e.g. "%". */
  suffix?: string;
  /** Number format (default: no decimals). */
  format?: Format;
  className?: string;
};

/**
 * Rolling-number display for P&L metrics. Unlike the per-character text
 * effect, this never replays on remount or navigation — it tweens only
 * when `value` actually changes. Grouping matches `fmtBDT` (en-BD, no
 * decimals) so numbers look identical at rest.
 */
export function MetricNumberFlow({ value, prefix = "৳", suffix, format = DEFAULT_FORMAT, className }: MetricNumberFlowProps) {
  const [animationEnabled, setAnimationEnabled] = useState(false);

  useEffect(() => {
    setAnimationEnabled(true);
  }, []);

  return (
    <NumberFlow
      animated={animationEnabled}
      value={value}
      prefix={prefix}
      suffix={suffix}
      locales="en-BD"
      format={format}
      className={className}
    />
  );
}
