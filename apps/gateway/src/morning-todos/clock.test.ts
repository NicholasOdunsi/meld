import { describe, expect, it } from "vitest";
import { isMorningWindow, localClock } from "./clock";

describe("localClock", () => {
  it("reads the hour and date in the owner's zone", () => {
    // 05:30 UTC on 10 Nov = 06:30 in Lagos (UTC+1)
    expect(localClock(new Date("2026-11-10T05:30:00Z"), "Africa/Lagos")).toEqual({ hour: 6, date: "2026-11-10" });
  });
  it("rolls the date across midnight", () => {
    // 23:30 UTC 9 Nov = 08:30 10 Nov in Tokyo
    expect(localClock(new Date("2026-11-09T23:30:00Z"), "Asia/Tokyo")).toEqual({ hour: 8, date: "2026-11-10" });
  });
  it("falls back to London for a missing or bad zone", () => {
    expect(localClock(new Date("2026-07-01T05:00:00Z"), null)).toEqual({ hour: 6, date: "2026-07-01" });
    expect(localClock(new Date("2026-07-01T05:00:00Z"), "Mars/Olympus")).toEqual({ hour: 6, date: "2026-07-01" });
  });
  it("follows daylight saving", () => {
    expect(localClock(new Date("2026-01-15T06:00:00Z"), "Europe/London").hour).toBe(6);
    expect(localClock(new Date("2026-07-15T06:00:00Z"), "Europe/London").hour).toBe(7);
  });
});

describe("isMorningWindow", () => {
  it("is open from 6 to 9 inclusive", () => {
    expect([5, 6, 9, 10].map(isMorningWindow)).toEqual([false, true, true, false]);
  });
});
