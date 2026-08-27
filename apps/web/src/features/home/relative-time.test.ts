import { expect, it } from "vitest";
import { formatRelativeTime } from "./relative-time";

const NOW = new Date("2026-08-20T12:00:00.000Z");

it("counts minutes under an hour", () => {
  expect(formatRelativeTime("2026-08-20T11:30:00.000Z", NOW)).toBe("30m");
});

it("counts hours under a day", () => {
  expect(formatRelativeTime("2026-08-20T08:00:00.000Z", NOW)).toBe("4h");
});

it("counts days under a fortnight", () => {
  expect(formatRelativeTime("2026-08-14T12:00:00.000Z", NOW)).toBe("6d");
});

it("counts weeks beyond that", () => {
  expect(formatRelativeTime("2026-08-01T12:00:00.000Z", NOW)).toBe("2w");
});

it("reads as now within the minute", () => {
  expect(formatRelativeTime("2026-08-20T11:59:40.000Z", NOW)).toBe("now");
});
