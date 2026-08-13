import type { DesignScreenAction } from "./screen-payload";

export type PrototypeScreen = {
  id: string;
  name: string;
  markup: string;
  styles: string;
  script: string | null;
  actions: DesignScreenAction[];
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

function splitHoistedAtRules(styles: string): { hoisted: string; scoped: string } {
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
    var found = false;
    screens.forEach(function (screen) {
      var match = screen.getAttribute("data-meld-screen") === id;
      screen.hidden = !match;
      if (match) found = true;
    });
    if (found) document.body.setAttribute("data-meld-current", id);
    return found;
  }

  document.addEventListener("click", function (event) {
    var node = event.target;
    while (node && node !== document.body && !node.hasAttribute("data-meld-action")) {
      node = node.parentElement;
    }
    if (!node || node === document.body) return;
    event.preventDefault();

    var action = node.getAttribute("data-meld-action");
    var target = Object.prototype.hasOwnProperty.call(routes, action)
      ? routes[action]
      : null;
    if (target === null) {
      document.body.setAttribute("data-meld-unresolved", action);
      return;
    }
    document.body.removeAttribute("data-meld-unresolved");
    show(target);
  });

  show(document.body.getAttribute("data-meld-start"));
})();
`.trim();

export function buildPrototypeDocument(input: PrototypeDocumentInput): string {
  if (!input.screens.some((screen) => screen.id === input.startScreenId)) {
    throw new Error(`Unknown start screen: ${input.startScreenId}`);
  }

  const routes: Record<string, string | null> = {};
  for (const screen of input.screens) {
    for (const action of screen.actions) {
      routes[action.id] = action.targetScreenId;
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

  // One screen's script throwing must not stop the others from wiring up.
  const scripts = input.screens
    .filter((screen) => screen.script)
    .map((screen) => `try { ${screen.script} } catch (error) { /* screen ${screen.id} */ }`);

  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${PROTOTYPE_CSP}">`,
    `<style>${input.tokenCss}</style>`,
    hoisted.length ? `<style>${hoisted.join("\n")}</style>` : "",
    scoped.length ? `<style>${scoped.join("\n")}</style>` : "",
    "</head>",
    `<body data-meld-start="${input.startScreenId}">`,
    ...sections,
    `<script type="application/json" id="meld-routes">${embedJson(routes)}</script>`,
    `<script>${HARNESS}</script>`,
    scripts.length ? `<script>${scripts.join("\n")}</script>` : "",
    "</body>",
    "</html>",
  ]
    .filter(Boolean)
    .join("\n");
}
