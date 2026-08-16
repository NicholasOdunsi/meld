import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORM_FACTOR,
  FORM_FACTOR_SIZES,
  frameSizeForFormFactor,
  isFormFactor,
} from "./form-factor";

describe("form-factor", () => {
  it("maps each form factor to its preset size", () => {
    expect(frameSizeForFormFactor("mobile")).toEqual({ w: 390, h: 844 });
    expect(frameSizeForFormFactor("tablet")).toEqual({ w: 834, h: 1112 });
    expect(frameSizeForFormFactor("desktop")).toEqual({ w: 1280, h: 832 });
  });

  it("falls back to the default for absent or unknown values", () => {
    const fallback = FORM_FACTOR_SIZES[DEFAULT_FORM_FACTOR];
    expect(frameSizeForFormFactor(null)).toEqual(fallback);
    expect(frameSizeForFormFactor(undefined)).toEqual(fallback);
    expect(frameSizeForFormFactor("watch")).toEqual(fallback);
    expect(DEFAULT_FORM_FACTOR).toBe("desktop");
  });

  it("recognizes valid form factors", () => {
    expect(isFormFactor("mobile")).toBe(true);
    expect(isFormFactor("desktop")).toBe(true);
    expect(isFormFactor("watch")).toBe(false);
    expect(isFormFactor(null)).toBe(false);
  });
});
