import { createElement, type ReactElement } from "react";

// The inspector surface (pill, dock, and in later tasks the panel) is an owner-approved custom,
// non-Astryx surface so it can match the approved mock exactly (see
// docs/superpowers/plans/2026-11-22-inspector-v2.md). Every literal colour, size, radius and
// shadow of it lives in THIS file as CSS variables; components and other stylesheets only ever
// reference `var(--orion-i-*)`. The board is always dark, so there is one set of values.
// The board root carries INSPECTOR_CLASS (the Shapes popover opens in a portal, so it gets the variables too), and <InspectorThemeStyle /> injects the sheet once.
export const INSPECTOR_CLASS = "orion-inspector";

// Where the pill may sit on the board (pixels): its gap under the frame, its margin to the board's
// edges, and what it keeps clear of (the tool dock on the left, the zoom control at the bottom).
// The same numbers feed the CSS variables below, so the sheet and the placement maths agree.
export const PILL_LAYOUT = { gap: 12, margin: 12, leftInset: 76, bottomInset: 60 } as const;

// The dropdown list opened from a field (pixels): its tallest size, and its gap to the field. The same
// numbers feed the CSS variables below and the placement maths (when to open upward), so they cannot drift.
export const MENU_LAYOUT = { maxHeight: 240, gap: 4 } as const;

// The side panel shell (pixels): its width. The same number feeds the CSS variable below and the
// LayoutPanel that hosts it, so the two cannot drift.
export const PANEL_LAYOUT = { width: 296 } as const;

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
  "--orion-i-pill-offset": `${PILL_LAYOUT.gap}px`,
  "--orion-i-pill-divider-h": "20px",
  "--orion-i-pill-divider-margin": "4px",
  "--orion-i-pill-text-pad": "10px",
  // The tool dock down the left edge.
  "--orion-i-dock-radius": "18px",
  "--orion-i-dock-pad": "8px 6px",
  "--orion-i-dock-gap": "6px",
  "--orion-i-dock-btn": "36px",
  "--orion-i-dock-fg": "#cfcfcf",
  // The side panel body: surface, section titles, the rows of fields.
  "--orion-i-panel-bg": "#1c1c1c",
  "--orion-i-panel-divider": "#2a2a2a",
  "--orion-i-section-fg": "#e4e4e4",
  "--orion-i-section-size": "12.5px",
  "--orion-i-section-weight": "600",
  "--orion-i-section-chevron": "#8a8a8a",
  "--orion-i-section-pad": "12px 0 6px",
  "--orion-i-section-head-gap": "10px",
  "--orion-i-row-gap": "8px",
  // The side panel shell: a fixed-width column with the Tweak | Code control and Close on top.
  "--orion-i-shell-width": `${PANEL_LAYOUT.width}px`,
  "--orion-i-shell-border": "1px solid #2c2c2c",
  "--orion-i-shell-pad": "12px 14px",
  "--orion-i-shell-head-gap": "12px",
  // The segmented control (Tweak | Code, and the file pills in the Code tab).
  "--orion-i-seg-track": "#262626",
  "--orion-i-seg-active": "#3a3a3a",
  "--orion-i-seg-fg": "#8d8d8d",
  "--orion-i-seg-active-fg": "#ffffff",
  "--orion-i-seg-radius": "10px",
  "--orion-i-seg-pad": "3px",
  "--orion-i-seg-tab-radius": "8px",
  "--orion-i-seg-tab-pad": "6px 14px",
  "--orion-i-seg-tab-weight": "500",
  "--orion-i-seg-small-radius": "8px",
  "--orion-i-seg-small-pad": "2px",
  "--orion-i-seg-small-tab-radius": "6px",
  "--orion-i-seg-small-tab-pad": "4px 10px",
  "--orion-i-seg-small-size": "12px",
  // A quiet square icon button (Close, Copy, Download).
  "--orion-i-iconbtn": "30px",
  "--orion-i-iconbtn-radius": "8px",
  "--orion-i-iconbtn-fg": "#a0a0a0",
  // The Code tab: its top bar, the editor's host and the diagnostics under it.
  "--orion-i-mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
  "--orion-i-code-gap": "8px",
  "--orion-i-code-min-h": "280px",
  "--orion-i-code-issue-size": "11.5px",
  "--orion-i-code-issue-pad": "6px 10px",
  // One look for EVERY kind of field (text, number, dropdown, colour).
  "--orion-i-field-h": "34px",
  "--orion-i-field-radius": "9px",
  "--orion-i-field-bg": "#2a2a2a",
  "--orion-i-field-fg": "#ececec",
  "--orion-i-field-label": "#8c8c8c",
  "--orion-i-field-muted": "#7f7f7f",
  "--orion-i-field-pad": "0 10px",
  "--orion-i-field-gap": "8px",
  "--orion-i-field-size": "13px",
  "--orion-i-field-small": "12px",
  "--orion-i-field-label-min": "14px",
  "--orion-i-error": "#f2736b",
  "--orion-i-pending-opacity": "0.6",
  "--orion-i-swatch": "16px",
  "--orion-i-swatch-border": "1px solid rgba(255, 255, 255, 0.25)",
  // The dropdown list opened from a field.
  "--orion-i-menu-radius": "12px",
  "--orion-i-menu-pad": "4px",
  "--orion-i-menu-item-h": "30px",
  "--orion-i-menu-max-h": `${MENU_LAYOUT.maxHeight}px`,
  "--orion-i-menu-gap": `${MENU_LAYOUT.gap}px`,
  "--orion-i-menu-z": "2147483000",
  // The colour popup: the same surface as the pill, a grid of round swatches, a Hex box in the field look.
  "--orion-i-pop-radius": "12px",
  "--orion-i-pop-pad": "12px",
  "--orion-i-pop-gap": "10px",
  "--orion-i-pop-row-gap": "8px",
  "--orion-i-pop-swatch": "18px",
  "--orion-i-pop-ring": "0 0 0 2px #262626, 0 0 0 4px #8c8c8c",
  "--orion-i-pop-ring-current": "0 0 0 2px #262626, 0 0 0 4px #e8e8e8",
} as const;

// Icon sizes (pixels) drawn inside fields and section titles, from the mock.
export const ICON_SIZE = { field: 15, chevron: 14, auto: 13, close: 16, bar: 16 } as const;

const toBlock = (vars: Readonly<Record<string, string>>) =>
  Object.entries(vars).map(([name, value]) => `${name}:${value};`).join("");

export const INSPECTOR_CSS = `
.${INSPECTOR_CLASS},.orion-i-scope,.astryx-popover:has(.orion-shapes-menu),.astryx-popover:has(.orion-i-pop){${toBlock(INSPECTOR_VARS)}}
.orion-pill{position:absolute;left:0;top:0;z-index:6;pointer-events:auto;display:flex;align-items:center;gap:var(--orion-i-pill-gap);padding:var(--orion-i-pill-pad);box-sizing:border-box;border-radius:var(--orion-i-pill-radius);background:var(--orion-i-surface);border:var(--orion-i-border);box-shadow:var(--orion-i-shadow)}
.orion-pill__btn{appearance:none;border:0;margin:0;padding:0;cursor:pointer;display:grid;place-items:center;flex:none;min-width:var(--orion-i-pill-btn);height:var(--orion-i-pill-btn);border-radius:var(--orion-i-btn-radius);background:transparent;color:var(--orion-i-btn-fg);font:inherit;line-height:1}
.orion-pill__btn--text{padding:0 var(--orion-i-pill-text-pad);font-size:inherit;font-weight:500}
.orion-pill__btn:hover{background:var(--orion-i-btn-hover)}
.orion-pill__btn:focus-visible{outline:2px solid var(--orion-i-focus);outline-offset:1px}
.orion-pill__btn[aria-pressed="true"]{background:var(--orion-i-btn-active-bg);color:var(--orion-i-btn-active-fg)}
.orion-pill__btn[aria-disabled="true"]{color:var(--orion-i-btn-disabled-fg);cursor:default}
.orion-pill__btn[aria-disabled="true"]:hover{background:transparent}
.orion-pill__divider{flex:none;border:0;width:1px;height:var(--orion-i-pill-divider-h);margin:0 var(--orion-i-pill-divider-margin);background:var(--orion-i-divider)}
.orion-panel{box-sizing:border-box;width:100%;height:100%;overflow-x:hidden;overflow-y:auto;background:var(--orion-i-panel-bg);border-left:var(--orion-i-shell-border);padding:var(--orion-i-shell-pad);color:var(--orion-i-field-fg);font-size:var(--orion-i-field-size);line-height:1.2}
.orion-panel__top{display:flex;align-items:center;justify-content:space-between;flex:none;margin-bottom:var(--orion-i-shell-head-gap)}
.orion-panel__top>.orion-i-iconbtn{margin-inline-start:auto}
.orion-seg{display:flex;align-items:center;background:var(--orion-i-seg-track);border-radius:var(--orion-i-seg-radius);padding:var(--orion-i-seg-pad);min-width:0}
.orion-seg__tab{appearance:none;border:0;margin:0;cursor:pointer;flex:none;padding:var(--orion-i-seg-tab-pad);border-radius:var(--orion-i-seg-tab-radius);background:transparent;color:var(--orion-i-seg-fg);font:inherit;font-weight:var(--orion-i-seg-tab-weight);line-height:1.2;white-space:nowrap}
.orion-seg__tab:hover{color:var(--orion-i-seg-active-fg)}
.orion-seg__tab:focus-visible{outline:2px solid var(--orion-i-focus);outline-offset:1px}
.orion-seg__tab[aria-selected="true"],.orion-seg__tab[aria-pressed="true"]{background:var(--orion-i-seg-active);color:var(--orion-i-seg-active-fg)}
.orion-seg__tab[aria-disabled="true"]{color:var(--orion-i-btn-disabled-fg);cursor:default}
.orion-seg--small{padding:var(--orion-i-seg-small-pad);border-radius:var(--orion-i-seg-small-radius);overflow-x:auto}
.orion-seg--small .orion-seg__tab{padding:var(--orion-i-seg-small-tab-pad);border-radius:var(--orion-i-seg-small-tab-radius);font-size:var(--orion-i-seg-small-size)}
.orion-i-iconbtn{appearance:none;border:0;margin:0;padding:0;cursor:pointer;display:grid;place-items:center;flex:none;width:var(--orion-i-iconbtn);height:var(--orion-i-iconbtn);border-radius:var(--orion-i-iconbtn-radius);background:transparent;color:var(--orion-i-iconbtn-fg)}
.orion-i-iconbtn:hover{background:var(--orion-i-btn-hover);color:var(--orion-i-field-fg)}
.orion-i-iconbtn:focus-visible{outline:2px solid var(--orion-i-focus);outline-offset:1px}
.orion-code{display:flex;flex-direction:column;gap:var(--orion-i-code-gap);min-width:0}
.orion-code__bar{display:flex;align-items:center;justify-content:space-between;gap:var(--orion-i-code-gap);min-width:0}
.orion-code__bar .orion-seg{flex:0 1 auto}
.orion-code__path{margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--orion-i-field-label);font-family:var(--orion-i-mono);font-size:var(--orion-i-field-small)}
.orion-code__actions{display:flex;align-items:center;flex:none;margin-inline-start:auto}
.orion-code__host{min-width:0;min-height:var(--orion-i-code-min-h);border-radius:var(--orion-i-field-radius);overflow:hidden}
.orion-code__issues{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;border-radius:var(--orion-i-field-radius);background:var(--orion-i-field-bg);font-family:var(--orion-i-mono);font-size:var(--orion-i-code-issue-size);line-height:1.4}
.orion-code__issue{padding:var(--orion-i-code-issue-pad);color:var(--orion-i-field-fg);overflow-wrap:anywhere}
.orion-code__issue:not(:first-child){border-top:1px solid var(--orion-i-panel-divider)}
.orion-code__issue-file{display:block;color:var(--orion-i-field-muted)}
.orion-i-body{display:flex;flex-direction:column;box-sizing:border-box;color:var(--orion-i-field-fg);font-size:var(--orion-i-field-size);line-height:1.2}
.orion-i-body[data-pending]{opacity:var(--orion-i-pending-opacity)}
/* Every section, the first included, starts with the divider: in the mock the line under the header is the first section's. */
.orion-i-section{border-top:1px solid var(--orion-i-panel-divider);padding:var(--orion-i-section-pad)}
.orion-i-section__head{display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--orion-i-section-head-gap)}
.orion-i-section__title{margin:0;color:var(--orion-i-section-fg);font-size:var(--orion-i-section-size);font-weight:var(--orion-i-section-weight);line-height:1.2}
.orion-i-section__toggle{appearance:none;border:0;margin:0;padding:2px;cursor:pointer;display:grid;place-items:center;background:transparent;color:var(--orion-i-section-chevron);border-radius:var(--orion-i-btn-radius)}
.orion-i-section__toggle:focus-visible{outline:2px solid var(--orion-i-focus);outline-offset:1px}
.orion-i-section__toggle svg{transition:transform 120ms}
.orion-i-section__toggle[aria-expanded="false"] svg{transform:rotate(-90deg)}
.orion-i-section__body[hidden]{display:none}
.orion-i-row{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:var(--orion-i-row-gap);margin-bottom:var(--orion-i-row-gap)}
.orion-i-row>*{min-width:0}
.orion-i-row>:has(>.orion-i-field){display:flex;width:100%}
.orion-i-cell{display:flex;flex-direction:column;gap:4px}
.orion-i-cell>.orion-i-field{flex:none}
.orion-i-field{position:relative;box-sizing:border-box;flex:1;min-width:0;height:var(--orion-i-field-h);display:flex;align-items:center;gap:var(--orion-i-field-gap);padding:var(--orion-i-field-pad);border-radius:var(--orion-i-field-radius);background:var(--orion-i-field-bg);color:var(--orion-i-field-fg);font-size:var(--orion-i-field-size)}
.orion-i-field:focus-within{outline:2px solid var(--orion-i-focus);outline-offset:0}
.orion-i-field[data-invalid]{outline:1px solid var(--orion-i-error)}
.orion-i-field[data-disabled]{cursor:default;color:var(--orion-i-field-muted)}
.orion-i-field__p{display:flex;align-items:center;justify-content:center;flex:none;min-width:var(--orion-i-field-label-min);color:var(--orion-i-field-label);font-size:var(--orion-i-field-small);font-weight:600}
.orion-i-field__e{display:flex;align-items:center;flex:none;color:var(--orion-i-field-label);font-size:var(--orion-i-field-small)}
.orion-i-input,.orion-i-hit{appearance:none;border:0;margin:0;padding:0;background:transparent;color:inherit;font:inherit;outline:0;min-width:0;flex:1;height:100%;text-align:start}
.orion-i-input{text-overflow:ellipsis}
.orion-i-input:disabled,.orion-i-hit:disabled{cursor:default}
.orion-i-hit{display:flex;align-items:center;gap:var(--orion-i-field-gap);cursor:pointer;white-space:nowrap}
.orion-i-hit::after{content:"";position:absolute;inset:0;border-radius:inherit}
.orion-i-hit__v{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.orion-i-hit__m{flex:none;color:var(--orion-i-field-muted);font-size:var(--orion-i-field-small)}
.orion-i-auto{display:flex;align-items:center}
.orion-i-swatch{display:block;width:var(--orion-i-swatch);height:var(--orion-i-swatch);box-sizing:border-box;border-radius:50%;border:var(--orion-i-swatch-border);background:transparent}
.orion-i-swatch[data-empty]{border-style:dashed}
.orion-i-note,.orion-i-error{margin:0;font-size:var(--orion-i-field-small);color:var(--orion-i-field-muted)}
.orion-i-error{color:var(--orion-i-error)}
.orion-i-menu:not([data-placed]){opacity:0}
.orion-i-menu{position:fixed;z-index:var(--orion-i-menu-z);box-sizing:border-box;margin:0;padding:var(--orion-i-menu-pad);list-style:none;overflow:auto;max-height:var(--orion-i-menu-max-h);border-radius:var(--orion-i-menu-radius);background:var(--orion-i-surface);border:var(--orion-i-border);box-shadow:var(--orion-i-shadow);color:var(--orion-i-field-fg);font-family:var(--font-family-body);font-size:var(--orion-i-field-size);outline:0}
.orion-i-menu__item{display:flex;align-items:center;height:var(--orion-i-menu-item-h);padding:var(--orion-i-field-pad);border-radius:var(--orion-i-field-radius);cursor:pointer;white-space:nowrap}
.orion-i-menu__item[data-active]{background:var(--orion-i-btn-hover)}
.orion-i-menu__item[aria-selected="true"]{background:var(--orion-i-field-bg)}
.astryx-popover:has(.orion-i-pop){background:var(--orion-i-surface) !important;padding:0 !important;border:var(--orion-i-border);border-radius:var(--orion-i-pop-radius);box-shadow:var(--orion-i-shadow);color:var(--orion-i-field-fg)}
.orion-i-pop{box-sizing:border-box;display:flex;flex-direction:column;gap:var(--orion-i-pop-gap);padding:var(--orion-i-pop-pad);color:var(--orion-i-field-fg);font-size:var(--orion-i-field-size)}
.orion-i-pop__row{display:flex;flex-wrap:wrap;gap:var(--orion-i-pop-row-gap)}
.orion-i-pop__group{display:flex;flex-direction:column;gap:var(--orion-i-pop-row-gap)}
.orion-i-pop__label{margin:0;font-size:var(--orion-i-field-small);color:var(--orion-i-field-muted)}
.orion-i-pop__sw{appearance:none;position:relative;border:0;margin:0;padding:0;cursor:pointer;flex:none;width:var(--orion-i-pop-swatch);height:var(--orion-i-pop-swatch);border-radius:50%;background:transparent;outline:0}
.orion-i-pop__sw::before{content:"";position:absolute;inset:0;box-sizing:border-box;border-radius:50%;background:var(--orion-i-pop-fill);filter:var(--orion-i-pop-filter);border:var(--orion-i-swatch-border)}
.orion-i-pop__sw:hover,.orion-i-pop__sw:focus-visible{box-shadow:var(--orion-i-pop-ring)}
.orion-i-pop__sw[aria-current="true"]{box-shadow:var(--orion-i-pop-ring-current)}
.orion-i-pop__none{appearance:none;border:0;margin:0;cursor:pointer;display:flex;align-items:center;gap:var(--orion-i-field-gap);height:var(--orion-i-field-h);padding:var(--orion-i-field-pad);border-radius:var(--orion-i-field-radius);background:transparent;color:var(--orion-i-field-fg);font:inherit;text-align:start}
.orion-i-pop__none:hover,.orion-i-pop__none:focus-visible{background:var(--orion-i-btn-hover);outline:0}
.orion-i-hex{appearance:none;border:0;margin:0;outline:0;box-sizing:border-box;width:100%;height:var(--orion-i-field-h);padding:var(--orion-i-field-pad);border-radius:var(--orion-i-field-radius);background:var(--orion-i-field-bg);color:var(--orion-i-field-fg);font:inherit;font-size:var(--orion-i-field-size)}
.orion-i-hex:focus{outline:2px solid var(--orion-i-focus);outline-offset:0}
.orion-i-hex[aria-invalid="true"]{outline:1px solid var(--orion-i-error)}
`;

// One <style>, rendered once by the board root. Same markup on the server and the client.
export function InspectorThemeStyle(): ReactElement {
  return createElement("style", { "data-orion-inspector-theme": "", dangerouslySetInnerHTML: { __html: INSPECTOR_CSS } });
}
