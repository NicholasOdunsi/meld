import type { Field, Tweak } from "./types";

const weights = [
  "thin",
  "extralight",
  "light",
  "normal",
  "medium",
  "semibold",
  "bold",
  "extrabold",
  "black",
];
export const FAMILY_STACKS = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;
export type FamilyKey = keyof typeof FAMILY_STACKS;
export function familyKeyOf(stack: string): FamilyKey | null {
  const clean = stack.trim();
  return (
    (Object.keys(FAMILY_STACKS) as FamilyKey[]).find(
      (k) => FAMILY_STACKS[k] === clean,
    ) ?? null
  );
}
const decimal = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const length = (value: string): string | null => {
  const number = value.endsWith("px") ? value.slice(0, -2) : value;
  if (!decimal.test(number) || !Number.isFinite(Number(number))) return null;
  // Keep decimal spelling: Number#toString switches to exponent notation for
  // small/large values, which would no longer match our utility grammar.
  const [integer, fraction = ""] = number.split(".");
  const whole = integer.replace(/^0+/, "") || "0";
  const tail = fraction.replace(/0+$/, "");
  return `${whole}${tail ? "." + tail : ""}px`;
};
const hex = (value: string): string | null => {
  if (/^#[\da-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(value))
    return `#${[...value.slice(1)]
      .map((c) => c + c)
      .join("")
      .toLowerCase()}`;
  return null;
};

/** Validate the complete input; never accept CSS fragments or executable values. */
export function cssValue({ field, value }: Tweak): string | null {
  if (field === "text") return null;
  if (field === "color" || field === "backgroundColor")
    return /^#[\da-f]{6}$/i.test(value) ? hex(value) : null;
  if (field === "fontFamily")
    return Object.hasOwn(FAMILY_STACKS, value)
      ? FAMILY_STACKS[value as FamilyKey]
      : null;
  if (field === "fontWeight") return /^(?:[1-9]00)$/.test(value) ? value : null;
  return length(value);
}

const palette =
  "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";
const namedColor = new RegExp(
  `^(?:transparent|current|inherit|black|white|${palette}-(?:50|[1-9]00|950))$`,
);
const sizes = /^(?:xs|sm|base|lg|xl|[2-9]xl)$/;
const spacing = /^(?:\d+(?:\.\d+)?|px)$/;
const radii = /^(?:none|xs|sm|md|lg|xl|[2-4]xl|full)$/;

type Recognized = { field: Field; value: string };
function recognize(token: string): Recognized | null {
  const opacity = /^([^/]+)\/(\d+(?:\.\d+)?)$/.exec(token);
  if (opacity && Number(opacity[2]) <= 100) {
    const base = recognize(opacity[1]);
    if (base?.field === "color" || base?.field === "backgroundColor") {
      return { field: base.field, value: token };
    }
  }
  // Colons inside typed arbitrary values are allowed, but variants never are.
  const bracket = token.indexOf("[");
  if (token.slice(0, bracket < 0 ? undefined : bracket).includes(":"))
    return null;
  const match = /^(text|bg|p|gap|rounded|w|h)-(.+)$/.exec(token);
  if (!match) {
    if (token === "rounded") return { field: "borderRadius", value: token };
    const weight = /^font-(.+)$/.exec(token);
    if (!weight) return null;
    if (weight[1] === "sans" || weight[1] === "serif" || weight[1] === "mono")
      return { field: "fontFamily", value: weight[1] };
    const index = weights.indexOf(weight[1]);
    return index < 0
      ? null
      : { field: "fontWeight", value: String((index + 1) * 100) };
  }
  const [, prefix, suffix] = match;
  const arbitrary = /^\[(.*)\]$/.exec(suffix);
  if (arbitrary) {
    let value = arbitrary[1];
    if (prefix === "text" || prefix === "bg") {
      const typed = /^(color|length):(.*)$/.exec(value);
      if (typed) value = typed[2];
      const color = !typed || typed[1] === "color" ? hex(value) : null;
      if (color)
        return {
          field: prefix === "text" ? "color" : "backgroundColor",
          value: color,
        };
      if (
        prefix === "text" &&
        (!typed || typed[1] === "length") &&
        value.endsWith("px")
      ) {
        const size = length(value);
        if (size) return { field: "fontSize", value: size.slice(0, -2) };
      }
      return null;
    }
    if (!value.endsWith("px")) return null;
    const pixels = length(value);
    if (!pixels) return null;
    const field = (
      {
        p: "padding",
        gap: "gap",
        rounded: "borderRadius",
        w: "width",
        h: "height",
      } as const
    )[prefix as "p" | "gap" | "rounded" | "w" | "h"];
    return { field, value: pixels.slice(0, -2) };
  }
  if (prefix === "text") {
    if (sizes.test(suffix)) return { field: "fontSize", value: token };
    if (namedColor.test(suffix)) return { field: "color", value: token };
  } else if (prefix === "bg") {
    if (namedColor.test(suffix))
      return { field: "backgroundColor", value: token };
  } else if (prefix === "rounded") {
    if (radii.test(suffix)) return { field: "borderRadius", value: token };
  } else if (prefix === "p" || prefix === "gap") {
    if (spacing.test(suffix))
      return { field: prefix === "p" ? "padding" : "gap", value: token };
  } else if (
    (prefix === "w" || prefix === "h") &&
    (spacing.test(suffix) ||
      /^(?:auto|full|screen|min|max|fit|svw|lvw|dvw|svh|lvh|dvh|\d+\/\d+)$/.test(
        suffix,
      ))
  ) {
    return { field: prefix === "w" ? "width" : "height", value: token };
  }
  return null;
}

/** Recognize only base utilities whose property and value are unambiguous. */
export function utilityField(token: string): Field | null {
  return recognize(token)?.field ?? null;
}

/** Important base utilities override literal styles, so adapters must decline those fields. */
export function utilityBlocked(className: string, field: Field): boolean {
  return (className.match(/\S+/g) ?? []).some((token) => {
    if (!token.startsWith("!") && !token.endsWith("!")) return false;
    const base = token.replace(/^!/, "").replace(/!$/, "");
    const bracket = base.indexOf("[");
    // A responsive/interaction variant does not own the base property.
    if (base.slice(0, bracket < 0 ? undefined : bracket).includes(":"))
      return false;
    if (utilityField(base) === field) return true;
    // Unknown important values still defeat inline fallback. Infer the family
    // conservatively instead of claiming a change the cascade cannot apply.
    if (field === "width") return base.startsWith("w-");
    if (field === "height") return base.startsWith("h-");
    if (field === "padding") return /^p[xytrblse]?-/.test(base);
    if (field === "gap") return /^gap(?:-[xy])?-/.test(base);
    if (field === "borderRadius") return /^rounded(?:-|$)/.test(base);
    if (field === "fontWeight" || field === "fontFamily") {
      const known = utilityField(base);
      // A known utility of the other field does not own this one.
      return known === null ? base.startsWith("font-") : false;
    }
    if (field === "backgroundColor") return base.startsWith("bg-");
    if (field === "color" || field === "fontSize") {
      const known = utilityField(base);
      if (known !== null) return known === field;
      if (base.startsWith("text-[color:")) return field === "color";
      if (base.startsWith("text-[length:")) return field === "fontSize";
      return base.startsWith("text-");
    }
    return false;
  });
}

/** Return the last recognized base utility, in the input units used by Tweak. */
export function utilityValue(className: string, field: Field): string | null {
  let value: string | null = null;
  for (const token of className.match(/\S+/g) ?? []) {
    const found = recognize(token);
    if (found?.field === field) value = found.value;
  }
  return value;
}

export function changeUtility(className: string, tweak: Tweak): string | null {
  const value = cssValue(tweak);
  if (value === null) return null;
  const replacement =
    tweak.field === "fontFamily"
      ? `font-${tweak.value}`
      : tweak.field === "fontWeight"
        ? `font-${weights[Number(value) / 100 - 1]}`
        : `${({ color: "text", backgroundColor: "bg", fontSize: "text", padding: "p", gap: "gap", borderRadius: "rounded", width: "w", height: "h" } as Partial<Record<Field, string>>)[tweak.field]}-[${value}]`;
  let replaced = false;
  const result = className.replace(/\S+/g, (token) => {
    if (utilityField(token) !== tweak.field) return token;
    if (replaced) return "";
    replaced = true;
    return replacement;
  });
  return replaced ? result : null;
}
