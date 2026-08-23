import type { DesignScreenPayload } from "./screen-payload";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";

export type ScreenSafetyRule =
  | "forbidden-element"
  | "remote-url"
  | "script-execution"
  | "module-import"
  | "worker"
  | "navigation-api";

export type ScreenSafetyFinding = {
  rule: ScreenSafetyRule;
  detail: string;
};

// A screen is a fragment, not a document: none of these belong in one, and the
// alternative to rejecting them is trusting a text scan to neutralise them.
// Rejecting is the whole point — this never rewrites a screen.
const FORBIDDEN_ELEMENTS = [
  "base",
  "meta",
  "link",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "form",
  "script",
  // SVG SMIL can mutate navigation and resource attributes after validation.
  // Reject the full declarative animation family instead of attempting to
  // reason about attributeName/values/timing combinations.
  "set",
  "animate",
  "animatecolor",
  "animatemotion",
  "animatetransform",
  "discard",
  "mpath",
] as const;

// Scheme-qualified URLs need only one slash because browsers normalize forms
// such as https:/evil.test. Scheme-less remote URLs still require //, \\, or a
// mix; browsers normalize backslashes to forward slashes for special schemes.
const REMOTE_URL =
  /(?:\b[a-z][a-z0-9+.-]*:[/\\]{1,2}|[/\\]{2})[^\s"')]+/gi;

/**
 * The one host a generated screen may load an image from.
 *
 * Everything else stays refused. Without this a screen could never show a real
 * photograph -- the model fell back to gradients, because a listing card with
 * no image is the only thing it could legally produce.
 *
 * Deliberately narrow: one host, https only, and only `<img src>`. CSS
 * `url()`, `srcset`, `poster` and every other resource attribute remain shut,
 * so this widens the surface by exactly one attribute on one element.
 */
const ALLOWED_IMAGE_HOSTS = new Set(["images.unsplash.com"]);

/**
 * True only for an https URL whose host *is* an allowed host.
 *
 * Parsed rather than string-matched, because the attacks here are all about
 * what a parser considers the host: `https://images.unsplash.com@evil.test/x`
 * puts the allowed name in the credentials and the real host after the `@`,
 * and `https://images.unsplash.com.evil.test/x` merely starts with it. A
 * substring or `startsWith` check waves both through; `URL.hostname` does not.
 */
function isAllowedImageSource(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // Relative or malformed: not a remote reference, so not this rule's call.
    return false;
  }
  if (url.protocol !== "https:") return false;
  // Credentials have no legitimate use here and are the classic host spoof.
  if (url.username !== "" || url.password !== "") return false;
  return ALLOWED_IMAGE_HOSTS.has(url.hostname.toLowerCase());
}

const NAVIGATION_ATTRIBUTES = new Set(["action", "formaction", "href", "ping"]);
const RESOURCE_ATTRIBUTES = new Set(["poster", "src", "xlink:href"]);

const SCRIPT_RULES: ReadonlyArray<{ rule: ScreenSafetyRule; pattern: RegExp }> = [
  { rule: "module-import", pattern: /\bimport\s*\(|\bimport\s+["'{*A-Za-z_$]|\bimportScripts\s*\(/ },
  {
    rule: "worker",
    pattern: /\bnew\s+(?:Shared)?Worker\s*\(|navigator\s*\.\s*serviceWorker/,
  },
  {
    rule: "navigation-api",
    pattern: new RegExp(
      [
        "\\blocation\\s*(?:=[^=]|\\.\\s*(?:href|assign|replace)\\b|\\[\\s*[\"'](?:href|assign|replace)[\"']\\s*\\])",
        "\\b(?:window|top|parent|self|globalThis)\\s*\\[\\s*[\"']location[\"']\\s*\\]",
        "\\b(?:window|top|parent|self|globalThis)\\s*(?:\\.\\s*open|\\[\\s*[\"']open[\"']\\s*\\])\\s*\\(",
        "\\bhistory\\s*(?:\\.\\s*(?:pushState|replaceState)|\\[\\s*[\"'](?:pushState|replaceState)[\"']\\s*\\])\\s*\\(",
      ].join("|"),
    ),
  },
];

function findRemoteUrls(source: string): string[] {
  const withoutData = source.replace(/data:[^\s"')]+/gi, "");
  const found: string[] = [];
  for (const match of withoutData.matchAll(REMOTE_URL)) {
    found.push(match[0]);
  }
  return found;
}

function attributeName(
  attribute: DefaultTreeAdapterTypes.Element["attrs"][number],
): string {
  return attribute.prefix
    ? `${attribute.prefix}:${attribute.name}`
    : attribute.name;
}

function inspectCss(
  source: string,
  location: string,
  findings: ScreenSafetyFinding[],
): void {
  if (/@import\b/i.test(source)) {
    findings.push({
      rule: "remote-url",
      detail: `@import is not allowed in ${location}`,
    });
  }

  const cssUrl = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
  for (const match of source.matchAll(cssUrl)) {
    const value = match[2]?.trim() ?? "";
    if (!value.toLowerCase().startsWith("data:")) {
      findings.push({
        rule: "remote-url",
        detail: `${location} contains non-data URL: ${value}`,
      });
    }
  }

  for (const url of findRemoteUrls(source)) {
    findings.push({
      rule: "remote-url",
      detail: `${location} contains remote reference: ${url}`,
    });
  }
}

function inspectMarkup(
  markup: string,
  findings: ScreenSafetyFinding[],
): void {
  const fragment = parseFragment(markup);

  function visit(node: DefaultTreeAdapterTypes.Node): void {
    if ("tagName" in node) {
      const tagName = node.tagName.toLowerCase();
      if ((FORBIDDEN_ELEMENTS as readonly string[]).includes(tagName)) {
        findings.push({
          rule: "forbidden-element",
          detail: `<${tagName}> is not allowed in a screen`,
        });
      }

      for (const attribute of node.attrs) {
        const name = attributeName(attribute).toLowerCase();
        const value = attribute.value.trim();

        if (NAVIGATION_ATTRIBUTES.has(name)) {
          findings.push({
            rule: "remote-url",
            detail: `${name} navigation is not allowed: ${value}`,
          });
          continue;
        }
        if (name === "srcset") {
          // A data URL's comma is indistinguishable from a candidate separator
          // without a full srcset parser. Rejecting srcset entirely is the safe
          // conservative policy; a plain data: src remains available.
          findings.push({
            rule: "remote-url",
            detail: "srcset is not allowed; use one data: src",
          });
          continue;
        }
        if (
          RESOURCE_ATTRIBUTES.has(name) &&
          !value.toLowerCase().startsWith("data:")
        ) {
          // The single exception: an <img src> pointing at an allowed image
          // host. Scoped to `img` specifically rather than to `src` generally,
          // so no other element inherits it.
          const isAllowedPhoto =
            tagName === "img" &&
            name === "src" &&
            isAllowedImageSource(value);
          if (!isAllowedPhoto) {
            findings.push({
              rule: "remote-url",
              detail: `${name} must use a data: URL`,
            });
            continue;
          }
          continue;
        }
        if (name === "style") {
          inspectCss(value, "style attribute", findings);
          continue;
        }
        if (name.startsWith("on")) {
          findings.push({
            rule: "script-execution",
            detail: `${name} inline handler is not allowed`,
          });
        }
      }
    }

    if ("childNodes" in node) {
      for (const child of node.childNodes) visit(child);
    }
    if ("content" in node) visit(node.content);
  }

  visit(fragment);
}

export function findScreenSafetyViolations(
  payload: DesignScreenPayload,
): ScreenSafetyFinding[] {
  const findings: ScreenSafetyFinding[] = [];

  inspectMarkup(payload.markup, findings);
  inspectCss(payload.styles, "styles", findings);

  if (payload.script !== null && payload.script.length > 0) {
    findings.push({
      rule: "script-execution",
      detail: "generated screen scripts are not allowed",
    });
    for (const { rule, pattern } of SCRIPT_RULES) {
      const match = payload.script.match(pattern);
      if (match) {
        findings.push({ rule, detail: `script uses ${match[0]}` });
      }
    }
  }

  return findings;
}
