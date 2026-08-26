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

export function enforceDesignSystem(input: {
  styles: string;
  tokenCss: string;
}): ConformanceResult {
  const findings: ConformanceFinding[] = [];
  let corrections = 0;

  const styles = input.styles.replace(
    CSS_RULE,
    (whole, rawSelector: string, body: string) => {
      const selector = rawSelector.trim();
      if (!DS_CLASS.test(selector)) return whole;

      const declarations = parseDeclarations(body);
      const kept = declarations.filter((declaration) => {
        if (!VISUAL_PROPERTIES.has(declaration.property)) return true;
        findings.push({
          rule: "component-override",
          detail: `${selector} overrides ${declaration.property}`,
        });
        corrections += 1;
        return false;
      });

      if (kept.length === declarations.length) return whole;
      if (kept.length === 0) return "";
      return `${selector} { ${kept
        .map((declaration) => `${declaration.property}: ${declaration.value}`)
        .join("; ")}; }`;
    },
  );

  return { styles, findings, corrections };
}
