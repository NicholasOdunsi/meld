// Kept out of code-theme.ts so the panel can ask without pulling CodeMirror into the main bundle.
const CSS_RGB =
  /rgba?\(\s*(\d+)[, ]+(\d+)[, ]+(\d+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/i;

/** Dark/light for an opaque colour; null for transparent or unreadable colours. */
function opaqueBrightness(css: string): number | null {
  const m = CSS_RGB.exec(css);
  if (!m) return null;
  const alpha =
    m[4] === undefined
      ? 1
      : m[4].endsWith("%")
        ? parseFloat(m[4]) / 100
        : parseFloat(m[4]);
  if (!(alpha > 0)) return null;
  return 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3];
}

/** Unknown or fully transparent colours count as dark (the app default). */
export function isDarkBackground(css: string): boolean {
  const brightness = opaqueBrightness(css);
  return brightness === null || brightness < 128;
}

/** Whether the page behind the editor is dark; undefined without a document (server render). */
export function pageIsDark(): boolean | undefined {
  if (typeof document === "undefined") return undefined;
  for (const el of [document.body, document.documentElement]) {
    const brightness = opaqueBrightness(getComputedStyle(el).backgroundColor);
    if (brightness !== null) return brightness < 128;
  }
  return true;
}
