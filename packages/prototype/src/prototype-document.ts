import type { DesignScreenPayload } from "./screen-payload";

export type PrototypeScreen = DesignScreenPayload & {
  id: string;
  name: string;
};

export type PrototypeDocumentInput = {
  screens: PrototypeScreen[];
  startScreenId: string;
  tokenCss: string;
};

// Belt to the sandbox attribute's braces. connect-src 'none' stops fetch, XHR,
// WebSocket, and EventSource; img-src data: stops beacons; form-action and
// base-uri close the two navigation tricks that do not need script.
export const PROTOTYPE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "script-src-attr 'none'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "object-src 'none'",
].join("; ");

// @keyframes and @font-face are invalid inside a style rule, so they cannot ride
// the nesting block that scopes everything else to one screen.
const HOISTED_AT_RULE = /@(?:keyframes|font-face)\b/gi;

// Within-sandbox integrity fix: a <style> element is also raw text,
// so </style in content breaks the HTML structure.
function neutralizeStyleClose(css: string): string {
  return css.replace(/<\/(style)/gi, "<\\/$1");
}

function splitHoistedAtRules(styles: string): { hoisted: string; scoped: string } {
  // Strip CSS comments before scanning, so a comment mentioning @keyframes
  // or @font-face doesn't corrupt the hoisting.
  styles = styles.replace(/\/\*[\s\S]*?\*\//g, "");

  const hoisted: string[] = [];
  let scoped = "";
  let cursor = 0;

  HOISTED_AT_RULE.lastIndex = 0;
  for (let match = HOISTED_AT_RULE.exec(styles); match; match = HOISTED_AT_RULE.exec(styles)) {
    const start = match.index;
    const open = styles.indexOf("{", start);
    if (open === -1) break;

    let depth = 0;
    let end = open;
    for (; end < styles.length; end += 1) {
      if (styles[end] === "{") depth += 1;
      else if (styles[end] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }

    scoped += styles.slice(cursor, start);
    hoisted.push(styles.slice(start, end + 1));
    cursor = end + 1;
    HOISTED_AT_RULE.lastIndex = cursor;
  }

  scoped += styles.slice(cursor);
  return { hoisted: hoisted.join("\n"), scoped: scoped.trim() };
}

// The route table is data, not code. Escaping `<` means a label can never close
// the block it lives in.
function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

const HARNESS = `
(function () {
  var routes = JSON.parse(document.getElementById("meld-routes").textContent);
  var screens = Array.prototype.slice.call(
    document.querySelectorAll("[data-meld-screen]")
  );

  function show(id) {
    var next = null;
    screens.some(function (screen) {
      if (screen.getAttribute("data-meld-screen") === id) {
        next = screen;
        return true;
      }
      return false;
    });
    if (!next) return false;
    screens.forEach(function (screen) {
      screen.hidden = screen !== next;
    });
    document.body.setAttribute("data-meld-current", id);
    return true;
  }

  document.addEventListener("click", function (event) {
    var node = event.target;
    while (node && node !== document.body && !node.hasAttribute("data-meld-action")) {
      node = node.parentElement;
    }
    if (!node || node === document.body) return;
    event.preventDefault();

    var action = node.getAttribute("data-meld-action");
    var screenEl = node;
    while (screenEl && screenEl !== document.body && !screenEl.hasAttribute("data-meld-screen")) {
      screenEl = screenEl.parentElement;
    }
    var screenId = screenEl && screenEl.getAttribute
      ? screenEl.getAttribute("data-meld-screen")
      : null;
    var table = screenId && routes[screenId] ? routes[screenId] : {};
    var target = Object.prototype.hasOwnProperty.call(table, action)
      ? table[action]
      : null;
    if (target === null || !show(target)) {
      document.body.setAttribute("data-meld-unresolved", action);
      return;
    }
    document.body.removeAttribute("data-meld-unresolved");
  });

  show(document.body.getAttribute("data-meld-start"));
})();
`.trim();

export function buildPrototypeDocument(input: PrototypeDocumentInput): string {
  if (!input.screens.some((screen) => screen.id === input.startScreenId)) {
    throw new Error(`Unknown start screen: ${input.startScreenId}`);
  }

  const routes: Record<string, Record<string, string | null>> = {};
  for (const screen of input.screens) {
    routes[screen.id] = {};
    for (const action of screen.actions) {
      routes[screen.id][action.id] = action.targetScreenId;
    }
  }

  const hoisted: string[] = [];
  const scoped: string[] = [];
  for (const screen of input.screens) {
    const split = splitHoistedAtRules(screen.styles);
    if (split.hoisted) hoisted.push(split.hoisted);
    if (split.scoped) {
      scoped.push(`[data-meld-screen="${screen.id}"] { ${split.scoped} }`);
    }
  }

  const sections = input.screens.map((screen) => {
    const hidden = screen.id === input.startScreenId ? "" : " hidden";
    return `<section data-meld-screen="${screen.id}" aria-label="${escapeAttribute(
      screen.name,
    )}"${hidden}>${screen.markup}</section>`;
  });

  // screen.script is intentionally ignored. Only this fixed routing harness is
  // executable, even when a legacy caller bypasses the validated entry point.
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${PROTOTYPE_CSP}">`,
    `<style>${neutralizeStyleClose(input.tokenCss)}</style>`,
    hoisted.length ? `<style>${neutralizeStyleClose(hoisted.join("\n"))}</style>` : "",
    scoped.length ? `<style>${neutralizeStyleClose(scoped.join("\n"))}</style>` : "",
    "</head>",
    `<body data-meld-start="${input.startScreenId}">`,
    ...sections,
    `<script type="application/json" id="meld-routes">${embedJson(routes)}</script>`,
    `<script>${HARNESS}</script>`,
    "</body>",
    "</html>",
  ]
    .filter(Boolean)
    .join("\n");
}
