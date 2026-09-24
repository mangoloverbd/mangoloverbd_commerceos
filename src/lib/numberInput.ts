import type { WheelEvent } from "react";

// Browsers step a focused number input on wheel/trackpad scroll, silently
// changing the value. Dropping focus lets the page scroll and keeps the value.
export function blurOnWheel(event: WheelEvent<HTMLInputElement>) {
  event.currentTarget.blur();
}
