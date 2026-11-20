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

/** Assemble a srcdoc document using the embedding application's CSP policy. */
export function assembleScreenDocument(
  screen: CompiledScreen,
  env: { csp: string; runtimeBundle: string },
): string {
  const csp = env.csp.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const styles = ["html,body{margin:0}", ...screen.styles]
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
