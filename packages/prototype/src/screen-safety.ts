import type { DesignScreenPayload } from "./screen-payload";

export type ScreenSafetyRule =
  | "forbidden-element"
  | "remote-url"
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
] as const;

// Any scheme-qualified or protocol-relative URL. data: is the sole exception:
// images and fonts must be inlined.
const REMOTE_URL = /(?:\b[a-z][a-z0-9+.-]*:)?\/\/[^\s"')]+/gi;
const DATA_URL = /^data:/i;

const SCRIPT_RULES: ReadonlyArray<{ rule: ScreenSafetyRule; pattern: RegExp }> = [
  { rule: "module-import", pattern: /\bimport\s*[(]|\bimportScripts\s*\(/ },
  {
    rule: "worker",
    pattern: /\bnew\s+(?:Shared)?Worker\s*\(|navigator\s*\.\s*serviceWorker/,
  },
  {
    rule: "navigation-api",
    pattern:
      /\b(?:top|parent|window|document|self)?\s*\.?\s*location\s*(?:=|\.\s*(?:href|assign|replace))|\bwindow\s*\.\s*open\s*\(|\bhistory\s*\.\s*(?:pushState|replaceState)\s*\(/,
  },
];

function findRemoteUrls(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(REMOTE_URL)) {
    if (DATA_URL.test(match[0])) continue;
    found.push(match[0]);
  }
  return found;
}

export function findScreenSafetyViolations(
  payload: DesignScreenPayload,
): ScreenSafetyFinding[] {
  const findings: ScreenSafetyFinding[] = [];

  for (const element of FORBIDDEN_ELEMENTS) {
    if (new RegExp(`<\\s*${element}\\b`, "i").test(payload.markup)) {
      findings.push({
        rule: "forbidden-element",
        detail: `<${element}> is not allowed in a screen`,
      });
    }
  }

  for (const url of [
    ...findRemoteUrls(payload.markup),
    ...findRemoteUrls(payload.styles),
  ]) {
    findings.push({ rule: "remote-url", detail: `remote reference: ${url}` });
  }

  if (/@import\b/i.test(payload.styles)) {
    findings.push({ rule: "remote-url", detail: "@import is not allowed in styles" });
  }

  if (payload.script) {
    for (const { rule, pattern } of SCRIPT_RULES) {
      if (pattern.test(payload.script)) {
        findings.push({ rule, detail: `script uses ${pattern.source}` });
      }
    }
  }

  return findings;
}
