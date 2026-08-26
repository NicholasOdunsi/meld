export type ConformanceFinding = {
  rule: "component-override" | "token-color";
  detail: string;
};

export type ConformanceResult = {
  styles: string;
  findings: ConformanceFinding[];
  /** R1 strips plus R2 rewrites -- what the person is told was corrected. */
  corrections: number;
};

// The declarations that decide how a component LOOKS. A screen may place a
// design-system component -- margin, width, grid-area, flex -- but may not
// restyle it, because the component stylesheet is the design system's job.
// This is the same visual/layout line `component-vocabulary.ts` draws for a
// different purpose; the list is duplicated rather than shared so neither
// file's meaning drifts when the other's does.
//
// Deliberately exact, not prefix-matched: `border-top` is left alone. Under-
// enforcing is the safe direction -- a missed override is a cosmetic drift, a
// wrongly stripped declaration is a broken screen.
const VISUAL_PROPERTIES = new Set([
  "background",
  "background-color",
  "border",
  "border-radius",
  "box-shadow",
  "color",
  "font-size",
  "font-weight",
  "padding",
]);

// Every `selector { declarations }` rule. Matching the whole rule (rather than
// anchoring on the previous rule's `}`) is what lets consecutive rules both
// match. Nested rules inside `@media { ... }` match too, and the at-rule's own
// braces are left untouched because this rewrites in place rather than
// rebuilding the stylesheet.
const CSS_RULE = /([^{}]+)\{([^{}]*)\}/g;

const DS_CLASS = /\.ds-[a-z0-9_-]+/i;

type Declaration = { property: string; value: string; raw: string };

function parseDeclarations(body: string): Declaration[] {
  const declarations: Declaration[] = [];
  for (const raw of body.split(";")) {
    const [property, ...rest] = raw.split(":");
    if (rest.length === 0) continue;
    const value = rest.join(":").trim();
    if (!value) continue;
    declarations.push({
      property: property.trim().toLowerCase(),
      value,
      raw,
    });
  }
  return declarations;
}

// `--ds-color-<name>: <value>;` as compiled by `compileTokenCss`.
const TOKEN_DECLARATION = /--ds-color-([a-z][a-z0-9-]*)\s*:\s*([^;]+);/gi;

// The two notations this pass can compare with confidence. `hsl()`, named
// colours and `color-mix()` are deliberately absent: a conversion this pass
// got subtly wrong would change a design silently, and leaving them is only a
// missed opportunity.
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\([0-9.,%\s/]+\)/g;

/**
 * One comparable spelling for a colour, or null when this pass cannot compare
 * it. `#ABC`, `#aabbcc` and `rgb(170, 187, 204)` all normalise to `170,187,204`.
 */
function normalizeColor(value: string): string | null {
  const trimmed = value.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3,8})$/.exec(trimmed);
  if (hex) {
    const digits = hex[1];
    const full =
      digits.length === 3 || digits.length === 4
        ? digits
            .split("")
            .map((digit) => digit + digit)
            .join("")
        : digits;
    if (full.length !== 6 && full.length !== 8) return null;
    const channels = [0, 2, 4].map((start) =>
      Number.parseInt(full.slice(start, start + 2), 16),
    );
    return channels.join(",");
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(trimmed);
  if (rgb) {
    const parts = rgb[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => Number.parseFloat(part));
    if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
      return null;
    }
    return parts.map((part) => Math.round(part)).join(",");
  }

  return null;
}

/** Normalised colour -> the custom property holding it. */
function tokenColorIndex(tokenCss: string): Map<string, string> {
  const index = new Map<string, string>();
  for (const match of tokenCss.matchAll(TOKEN_DECLARATION)) {
    const normalized = normalizeColor(match[2] ?? "");
    // First writer wins: two tokens holding the same colour is a design
    // decision, and rewriting to whichever came last would be arbitrary.
    if (normalized && !index.has(normalized)) {
      index.set(normalized, `--ds-color-${match[1]}`);
    }
  }
  return index;
}

export function enforceDesignSystem(input: {
  styles: string;
  tokenCss: string;
}): ConformanceResult {
  const findings: ConformanceFinding[] = [];
  let corrections = 0;
  const tokens = tokenColorIndex(input.tokenCss);

  const mapColors = (selector: string, value: string): string =>
    value.replace(COLOR_LITERAL, (literal) => {
      const normalized = normalizeColor(literal);
      if (!normalized) return literal;
      const token = tokens.get(normalized);
      if (!token) {
        // Only report unmatched colours if there are tokens to match against
        if (tokens.size > 0) {
          findings.push({
            rule: "token-color",
            detail: `${selector} uses ${literal}, which matches no token`,
          });
        }
        return literal;
      }
      corrections += 1;
      return `var(${token})`;
    });

  const styles = input.styles.replace(
    CSS_RULE,
    (whole, rawSelector: string, body: string) => {
      const selector = rawSelector.trim();
      const declarations = parseDeclarations(body);
      const isComponent = DS_CLASS.test(selector);

      const kept: Declaration[] = [];
      for (const declaration of declarations) {
        if (isComponent && VISUAL_PROPERTIES.has(declaration.property)) {
          findings.push({
            rule: "component-override",
            detail: `${selector} overrides ${declaration.property}`,
          });
          corrections += 1;
          continue;
        }
        kept.push({
          ...declaration,
          value: mapColors(selector, declaration.value),
        });
      }

      const unchanged =
        kept.length === declarations.length &&
        kept.every(
          (declaration, index) =>
            declaration.value === declarations[index]?.value,
        );
      if (unchanged) return whole;
      if (kept.length === 0) return "";
      return `${selector} { ${kept
        .map((declaration) => `${declaration.property}: ${declaration.value}`)
        .join("; ")}; }`;
    },
  );

  return { styles, findings, corrections };
}
