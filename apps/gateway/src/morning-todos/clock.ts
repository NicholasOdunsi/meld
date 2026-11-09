export const FALLBACK_TIME_ZONE = "Europe/London";

function validZone(zone: string | null): string {
  if (!zone) return FALLBACK_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return zone;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

export function localClock(now: Date, timeZone: string | null): { hour: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: validZone(timeZone),
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { hour: Number(get("hour")), date: `${get("year")}-${get("month")}-${get("day")}` };
}

export function isMorningWindow(hour: number): boolean {
  return hour >= 6 && hour <= 9;
}
