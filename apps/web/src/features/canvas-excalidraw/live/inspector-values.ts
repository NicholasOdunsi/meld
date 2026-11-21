import type { Field, Inspection } from "@meld/screen-runtime/edit/types";
import type { Computed } from "./live-messages";

export const WEIGHTS = [
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extra bold" },
] as const;

export const FAMILIES = [
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" },
] as const;

export type FieldView = { editable: boolean; value: string | null; auto: boolean; hidden: boolean };

const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CH = String.raw`(\d+(?:\.\d+)?)`;
const RGB = new RegExp(String.raw`^rgba?\(\s*${CH}\s*[, ]\s*${CH}\s*[, ]\s*${CH}\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$`, "i");

export function rgbToHex(css: string): string | null {
  const m = RGB.exec(css.trim());
  if (!m) return null;
  if (m[4] !== undefined && Number.parseFloat(m[4]) === 0) return null;
  const channel = (s: string) => Math.min(255, Math.round(Number(s))).toString(16).padStart(2, "0");
  return `#${channel(m[1]!)}${channel(m[2]!)}${channel(m[3]!)}`;
}

const MONO = new Set(["ui-monospace", "monospace", "menlo", "consolas", "courier", "courier new", "sf mono", "sfmono-regular", "monaco"]);
const SERIF = new Set(["ui-serif", "serif", "georgia", "times", "times new roman", "cambria", "garamond"]);

export function familyKey(stack: string): "sans" | "serif" | "mono" {
  const first = firstFontName(stack).toLowerCase();
  if (MONO.has(first)) return "mono";
  if (SERIF.has(first)) return "serif";
  return "sans";
}

export function firstFontName(stack: string): string {
  const first = stack.split(",")[0] ?? "";
  return first.trim().replace(/^["']|["']$/g, "").trim();
}

const GENERIC_FAMILIES = new Set([
  "ui-monospace", "ui-sans-serif", "ui-serif", "ui-rounded", "system-ui", "-apple-system", "blinkmacsystemfont",
  "sans-serif", "serif", "monospace",
]);
const SYSTEM_NAME = { sans: "System sans", serif: "System serif", mono: "System mono" } as const;

// The first real font in a stack, or a friendly name when the stack only holds generic keywords.
export function displayFontName(stack: string): string {
  for (const part of stack.split(",")) {
    const name = part.trim().replace(/^["']|["']$/g, "").trim();
    if (name && !GENERIC_FAMILIES.has(name.toLowerCase())) return name;
  }
  return SYSTEM_NAME[familyKey(stack)];
}

export function nearestWeight(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "400";
  let best: string = WEIGHTS[0].value;
  for (const w of WEIGHTS) {
    if (Math.abs(Number(w.value) - n) < Math.abs(Number(best) - n)) best = w.value;
  }
  return best;
}

type NumericField = "fontSize" | "padding" | "gap" | "borderRadius" | "width" | "height";
type ColourField = "color" | "backgroundColor";

const plain = (v: string | null): string | null => (v !== null && PLAIN_NUMBER.test(v) ? v : null);

export function displayValues(
  inspection: NonNullable<Inspection>,
  computed: Computed | null,
): Record<Field, FieldView> {
  const view = (field: Field, value: string | null, extra: Partial<FieldView> = {}): FieldView => ({
    editable: inspection[field].editable,
    value,
    auto: false,
    hidden: false,
    ...extra,
  });
  const numeric = (field: NumericField): FieldView => {
    const source = plain(inspection[field].value);
    const value = (computed ? plain(computed[field]) : null) ?? source;
    const auto = (field === "width" || field === "height") && source === null;
    return view(field, value, { auto });
  };
  const colour = (field: ColourField): FieldView => {
    const source = inspection[field].value;
    const value = computed ? rgbToHex(computed[field]) : source !== null && HEX.test(source) ? source : null;
    return view(field, value);
  };

  const text = inspection.text;
  const sourceWeight = inspection.fontWeight.value;
  const sourceFamily = inspection.fontFamily.value;
  const layoutChildren = computed !== null && /flex|grid/.test(computed.display);

  return {
    text: view("text", text.value, { hidden: !text.editable && text.value === null }),
    color: colour("color"),
    backgroundColor: colour("backgroundColor"),
    fontSize: numeric("fontSize"),
    fontWeight: view(
      "fontWeight",
      computed ? nearestWeight(computed.fontWeight) : plain(sourceWeight) ? nearestWeight(sourceWeight!) : null,
    ),
    fontFamily: view(
      "fontFamily",
      computed ? familyKey(computed.fontFamily) : sourceFamily !== null ? familyKey(sourceFamily) : null,
    ),
    padding: numeric("padding"),
    gap: { ...numeric("gap"), hidden: !layoutChildren },
    borderRadius: numeric("borderRadius"),
    width: numeric("width"),
    height: numeric("height"),
  };
}
