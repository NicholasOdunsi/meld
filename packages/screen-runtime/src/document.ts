import type { CompiledScreen } from "./compile";
import { FRAME_BRIDGE_SOURCE } from "./runtime/bridge";
import { MODULE_LOADER_SOURCE } from "./runtime/loader";

/**
 * Prevent JavaScript strings and comments from ending their HTML script element.
 * `<!--` is also neutralised: followed by `<script`, it would put the parser in
 * the double-escaped state where the real closing tag no longer ends the element.
 */
export function inlineScript(js: string): string {
  return js.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "\\x3C!--");
}

/**
 * A quiet scrollbar for everything that scrolls inside a screen: a thin bar whose track and corner
 * have no background at all, and a rounded translucent grey thumb that reads on dark and light
 * screens (a little stronger on hover). Also used for the sleeping picture of a screen.
 *
 * Only the `::-webkit-scrollbar` family is used (Chromium and WebKit, the Mac app, both honour it).
 * Do NOT add `scrollbar-color` or `scrollbar-width` here: Chromium then ignores every
 * `::-webkit-scrollbar` rule on that element, and the track would come back. A screen that sets
 * either itself (or its own `::-webkit-scrollbar` rules, which come later) still wins.
 */
export const SCREEN_SCROLLBAR_DEFAULTS: readonly string[] = [
  "::-webkit-scrollbar{width:8px;height:8px}",
  "::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}",
  "::-webkit-scrollbar-thumb{background-color:rgba(128,128,128,.45);border:2px solid transparent;border-radius:8px;background-clip:padding-box}",
  "::-webkit-scrollbar-thumb:hover{background-color:rgba(128,128,128,.7)}",
];

/**
 * The stylesheet every live screen document starts with, before the screen's own styles so a
 * screen can override any of it. Add new screen-wide defaults here (one rule per entry).
 * - No page margin.
 * - Body scrolling stays inside the screen. Do not contain the root html element: WebKit can
 *   then refuse native wheel scrolling inside the board's transformed iframe. The host iframe
 *   wheel guard also stops leftover root scrolling from panning the board.
 * - A quiet scrollbar (see SCREEN_SCROLLBAR_DEFAULTS).
 */
export const SCREEN_DOCUMENT_DEFAULTS: readonly string[] = [
  "html,body{margin:0}",
  "body{overscroll-behavior:contain}",
  ...SCREEN_SCROLLBAR_DEFAULTS,
];

/** Assemble a srcdoc document using the embedding application's CSP policy. */
export function assembleScreenDocument(
  screen: CompiledScreen,
  env: { csp: string; runtimeBundle: string },
): string {
  const csp = env.csp.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const styles = [...SCREEN_DOCUMENT_DEFAULTS, ...screen.styles]
    .map((css) => `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`).join("");
  const bootstrap = [env.runtimeBundle, FRAME_BRIDGE_SOURCE, MODULE_LOADER_SOURCE]
    .map((js) => `<script>${inlineScript(js)}</script>`).join("");
  // HTML scripts stay separate classic scripts: top-level const/let/class are
  // shared between them (inline handlers can call them) and a throwing script
  // doesn't stop the later ones. Errors reach the bridge's window error listener.
  const scripts = screen.kind === "html"
    ? [...screen.scripts, "window.__orionReady()"]
    : [`try{${screen.scripts.join("\n")}\nwindow.__orionReady()}catch(error){window.__orionReport(error)}`];
  return '<!doctype html>'
    + `<meta http-equiv="Content-Security-Policy" content="${csp}">`
    + '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + styles + bootstrap
    + `<body>${screen.html}${scripts.map((js) => `<script>${inlineScript(js)}</script>`).join("")}</body>`;
}
