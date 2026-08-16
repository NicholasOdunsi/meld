import type { DesignScreenBatch } from "./screen-payload";

/**
 * Returns an icon's INNER svg markup (its <path>/<circle>… children) for a
 * known kebab-case Lucide name, or null when the name is unknown. Injected so
 * this module carries no icon-library dependency, which keeps the icon data
 * out of the web bundle — only the connector wires in the real resolver.
 */
export type IconResolver = (name: string) => string | null;

// Lucide's canonical presentation attributes. stroke="currentColor" is what
// makes an icon inherit the surrounding text color, so it themes for free via
// the design system's --ds-* variables. No xmlns: inline HTML svg needs none,
// and it keeps every http:// string out of prototype markup.
const SVG_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"';

// Shown when a name does not resolve, so an unknown icon leaves a deliberate
// mark at the requested size instead of a broken box (the "tofu" glyph).
const FALLBACK_INNER = '<circle cx="12" cy="12" r="9"></circle>';

// A placeholder is an EMPTY <svg> carrying data-icon: either <svg …></svg> or
// self-closing <svg …/>. Matching only the empty form means a real inline
// <svg> with children is never touched.
const ICON_PLACEHOLDER = /<svg\b([^>]*?)\s*(?:\/>|>\s*<\/svg>)/gi;

function readAttr(attrs: string, name: string): string | null {
  const match = attrs.match(
    new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"|\\b${name}\\s*=\\s*'([^']*)'`, "i"),
  );
  return match ? (match[1] ?? match[2] ?? null) : null;
}

function buildSvg(inner: string, attrs: string): string {
  const width = readAttr(attrs, "width") ?? "24";
  const height = readAttr(attrs, "height") ?? "24";
  const className = readAttr(attrs, "class");
  const cls = className ? ` class="${className}"` : "";
  return `<svg width="${width}" height="${height}" ${SVG_ATTRS}${cls}>${inner}</svg>`;
}

/**
 * Replaces every `<svg data-icon="NAME">` placeholder in a markup fragment
 * with real inline SVG. Unknown names get a neutral fallback glyph. Non-icon
 * markup — including a real inline <svg> with children — is left byte-for-byte
 * unchanged.
 */
export function substituteScreenIcons(
  markup: string,
  resolveIcon: IconResolver,
): string {
  return markup.replace(ICON_PLACEHOLDER, (whole, attrs: string) => {
    const name = readAttr(attrs, "data-icon");
    if (name === null) return whole; // an empty <svg> that is not a placeholder
    const inner = resolveIcon(name) ?? FALLBACK_INNER;
    return buildSvg(inner, attrs);
  });
}

/**
 * Runs substituteScreenIcons over every screen's markup and every created
 * layout's shellMarkup in a batch, returning a new batch. reuse-only and
 * layout-less screens keep their layout unchanged.
 */
export function substituteBatchIcons(
  batch: DesignScreenBatch,
  resolveIcon: IconResolver,
): DesignScreenBatch {
  return {
    ...batch,
    screens: batch.screens.map((screen) => {
      const markup = substituteScreenIcons(screen.markup, resolveIcon);
      const create = screen.layout?.create;
      if (!create) return { ...screen, markup };
      return {
        ...screen,
        markup,
        layout: {
          ...screen.layout!,
          create: {
            ...create,
            shellMarkup: substituteScreenIcons(create.shellMarkup, resolveIcon),
          },
        },
      };
    }),
  };
}
