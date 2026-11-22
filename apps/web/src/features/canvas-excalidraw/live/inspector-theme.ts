import { createElement, type ReactElement } from "react";

// The inspector surface (pill, dock, and in later tasks the panel) is an owner-approved custom,
// non-Astryx surface so it can match the approved mock exactly (see
// docs/superpowers/plans/2026-11-22-inspector-v2.md). Every literal colour, size, radius and
// shadow of it lives in THIS file as CSS variables; components and other stylesheets only ever
// reference `var(--orion-i-*)`. The board is always dark, so there is one set of values.
// The board root carries INSPECTOR_CLASS (the Shapes popover opens in a portal, so it gets the variables too), and <InspectorThemeStyle /> injects the sheet once.
export const INSPECTOR_CLASS = "orion-inspector";

export const INSPECTOR_VARS = {
  // The floating surface shared by the pill and the dock.
  "--orion-i-surface": "#262626",
  "--orion-i-border": "1px solid #3a3a3a",
  "--orion-i-shadow": "0 8px 24px rgba(0, 0, 0, 0.5)",
  "--orion-i-divider": "#3d3d3d",
  "--orion-i-focus": "#6965db",
  // Icon buttons (pill 34, dock 36).
  "--orion-i-btn-radius": "10px",
  "--orion-i-btn-fg": "#d6d6d6",
  "--orion-i-btn-hover": "#333333",
  "--orion-i-btn-active-bg": "#e8e8e8",
  "--orion-i-btn-active-fg": "#111111",
  "--orion-i-btn-disabled-fg": "#6b6b6b",
  // The pill under a screen.
  "--orion-i-pill-radius": "16px",
  "--orion-i-pill-pad": "5px",
  "--orion-i-pill-gap": "2px",
  "--orion-i-pill-btn": "34px",
  "--orion-i-pill-offset": "12px",
  "--orion-i-pill-divider-h": "20px",
  "--orion-i-pill-divider-margin": "4px",
  "--orion-i-pill-text-pad": "10px",
  // The tool dock down the left edge.
  "--orion-i-dock-radius": "18px",
  "--orion-i-dock-pad": "8px 6px",
  "--orion-i-dock-gap": "6px",
  "--orion-i-dock-btn": "36px",
  "--orion-i-dock-fg": "#cfcfcf",
} as const;

const toBlock = (vars: Readonly<Record<string, string>>) =>
  Object.entries(vars).map(([name, value]) => `${name}:${value};`).join("");

export const INSPECTOR_CSS = `
.${INSPECTOR_CLASS},.astryx-popover:has(.orion-shapes-menu){${toBlock(INSPECTOR_VARS)}}
.orion-pill{position:absolute;left:0;top:0;z-index:6;pointer-events:auto;display:flex;align-items:center;gap:var(--orion-i-pill-gap);padding:var(--orion-i-pill-pad);box-sizing:border-box;border-radius:var(--orion-i-pill-radius);background:var(--orion-i-surface);border:var(--orion-i-border);box-shadow:var(--orion-i-shadow)}
.orion-pill__btn{appearance:none;border:0;margin:0;padding:0;cursor:pointer;display:grid;place-items:center;flex:none;min-width:var(--orion-i-pill-btn);height:var(--orion-i-pill-btn);border-radius:var(--orion-i-btn-radius);background:transparent;color:var(--orion-i-btn-fg);font:inherit;line-height:1}
.orion-pill__btn--text{padding:0 var(--orion-i-pill-text-pad);font-size:inherit;font-weight:500}
.orion-pill__btn:hover{background:var(--orion-i-btn-hover)}
.orion-pill__btn:focus-visible{outline:2px solid var(--orion-i-focus);outline-offset:1px}
.orion-pill__btn[aria-pressed="true"]{background:var(--orion-i-btn-active-bg);color:var(--orion-i-btn-active-fg)}
.orion-pill__btn[aria-disabled="true"]{color:var(--orion-i-btn-disabled-fg);cursor:default}
.orion-pill__btn[aria-disabled="true"]:hover{background:transparent}
.orion-pill__divider{flex:none;border:0;width:1px;height:var(--orion-i-pill-divider-h);margin:0 var(--orion-i-pill-divider-margin);background:var(--orion-i-divider)}
`;

// One <style>, rendered once by the board root. Same markup on the server and the client.
export function InspectorThemeStyle(): ReactElement {
  return createElement("style", { "data-orion-inspector-theme": "", dangerouslySetInnerHTML: { __html: INSPECTOR_CSS } });
}
