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

// // or \\ or a mix: browsers normalize backslashes to forward slashes when
// resolving special-scheme URLs, so \\evil.test still reaches a remote host.
const REMOTE_URL = /(?:\b[a-z][a-z0-9+.-]*:)?[/\\]{2}[^\s"')]+/gi;

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
      const match = payload.script.match(pattern);
      if (match) {
        findings.push({ rule, detail: `script uses ${match[0]}` });
      }
    }
  }

  return findings;
}
