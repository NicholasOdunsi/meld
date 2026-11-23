import { parse, type DefaultTreeAdapterMap } from "parse5";

type HtmlNode = DefaultTreeAdapterMap["node"];

export type StrippedStylesheets = {
  html: string;
  /** The `href` of each removed `<link rel="stylesheet">`, in document order. Empty when it had none. */
  removed: string[];
};

// Screens run sandboxed with their styles inlined, so a linked stylesheet can
// never load. Cutting the tags out by source offset leaves the rest of the
// pasted markup byte-for-byte untouched.
export function stripExternalStylesheets(html: string): StrippedStylesheets {
  if (!/<link\b/i.test(html)) return { html, removed: [] };
  const cuts: { start: number; end: number; href: string }[] = [];
  function visit(node: HtmlNode) {
    if ("tagName" in node) {
      const isStylesheet = node.tagName === "link" && node.attrs.some((attr) => attr.name === "rel"
        && attr.value.toLowerCase().split(/\s+/).includes("stylesheet"));
      const location = node.sourceCodeLocation;
      if (isStylesheet && location) {
        cuts.push({ start: location.startOffset, end: location.endOffset, href: node.attrs.find((attr) => attr.name === "href")?.value ?? "" });
        return;
      }
      // Template children live in a separate document fragment in parse5.
      if ("content" in node) visit(node.content);
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  }
  visit(parse(html, { sourceCodeLocationInfo: true }));
  if (!cuts.length) return { html, removed: [] };
  let result = html;
  for (const cut of [...cuts].sort((a, b) => b.start - a.start)) result = result.slice(0, cut.start) + result.slice(cut.end);
  return { html: result, removed: cuts.sort((a, b) => a.start - b.start).map((cut) => cut.href) };
}
