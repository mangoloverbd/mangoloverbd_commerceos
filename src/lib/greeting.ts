/**
 * Time-of-day greetings computed in Dhaka time (UTC+6), matching the
 * dashboard's existing `dhakaToday()` convention (no timezone library).
 * There is deliberately no "Good night" — merchants working late hours
 * still get "Good evening".
 */

export function dhakaHour(now: Date = new Date()): number {
  return new Date(now.getTime() + 6 * 60 * 60 * 1000).getUTCHours();
}

export function getDhakaGreeting(now: Date = new Date()): string {
  const hour = dhakaHour(now);
  if (hour >= 4 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}
