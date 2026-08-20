const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * The compact age printed on the ticket and on a tile ("2h", "6d"). Deliberately
 * not `Intl.RelativeTimeFormat`: this is metadata set in Pixelify at 11px, where
 * "6 days ago" does not fit and does not need to.
 */
export function formatRelativeTime(iso: string, now: Date): string {
  const elapsed = now.getTime() - new Date(iso).getTime();

  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 2 * WEEK) return `${Math.floor(elapsed / DAY)}d`;
  return `${Math.floor(elapsed / WEEK)}w`;
}
