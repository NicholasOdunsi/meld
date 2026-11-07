import { describe, expect, it } from "vitest";
import { inferTarget } from "./infer-target";

const none = { screenName: null, roomFormFactors: [] as ("mobile" | "tablet" | "desktop")[] };

describe("inferTarget", () => {
  it.each([
    ["Build the mobile sign in screen", "mobile", "login"],
    ["iPad onboarding flow", "tablet", "onboarding"],
    ["Mac app settings window", "desktop_app", "settings"],
    ["Marketing website landing page", "web", "landing"],
    ["Pricing plans page", null, "pricing"],
    ["Create account form on iPhone", "mobile", "signup"],
    ["Something nice", null, null],
  ] as const)("%s", (instruction, device, screenType) => {
    expect(inferTarget({ instruction, ...none })).toEqual({ device, screenType });
  });

  it("falls back to the room's most common form factor and reads the screen name", () => {
    expect(inferTarget({ instruction: "Make it nicer", screenName: "Dashboard", roomFormFactors: ["desktop", "mobile", "desktop"] }))
      .toEqual({ device: "web", screenType: "dashboard" });
    expect(inferTarget({ instruction: "x", screenName: null, roomFormFactors: ["mobile"] }).device).toBe("mobile");
  });

  it("does not take 'dashboard' as a device hint", () => {
    expect(inferTarget({ instruction: "dashboard", ...none }).device).toBeNull();
  });
});
