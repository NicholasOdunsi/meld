// The device form factor a screen is designed for. The model declares it per
// screen so the canvas frame is created at the right size instead of a fixed
// phone-portrait box the user has to expand by hand.
export const FORM_FACTORS = ["mobile", "tablet", "desktop"] as const;
export type FormFactor = (typeof FORM_FACTORS)[number];

export const DEFAULT_FORM_FACTOR: FormFactor = "desktop";

export type FrameSize = { w: number; h: number };

// Canvas frame dimensions per form factor. `mobile` matches the historical seed
// default (390x844), so a genuinely mobile screen never needs a resize.
export const FORM_FACTOR_SIZES: Readonly<Record<FormFactor, FrameSize>> = {
  mobile: { w: 390, h: 844 },
  tablet: { w: 834, h: 1112 },
  desktop: { w: 1280, h: 832 },
};

export function isFormFactor(value: unknown): value is FormFactor {
  return (
    typeof value === "string" &&
    (FORM_FACTORS as readonly string[]).includes(value)
  );
}

// The frame size for a screen's form factor, falling back to the default when it
// is absent or unrecognized (legacy rows, or a value we don't understand).
export function frameSizeForFormFactor(
  formFactor: string | null | undefined,
): FrameSize {
  return FORM_FACTOR_SIZES[
    isFormFactor(formFactor) ? formFactor : DEFAULT_FORM_FACTOR
  ];
}
