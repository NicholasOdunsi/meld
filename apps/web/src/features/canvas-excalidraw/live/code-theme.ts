import {
  bracketMatching,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
  EditorView,
} from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";

export type Palette = {
  bg: string;
  fg: string;
  gutter: string;
  line: string;
  selection: string;
  keyword: string;
  string: string;
  number: string;
  comment: string;
  tag: string;
  attribute: string;
  fn: string;
  type: string;
  property: string;
};

// VS Code Dark+ style on a near-black ground, and a GitHub-light style for light pages.
const darkPalette: Palette = {
  bg: "#171717",
  fg: "#d4d4d4",
  gutter: "#7a7a7a",
  line: "#1f1f1f",
  selection: "#264f78",
  keyword: "#c586c0",
  string: "#ce9178",
  number: "#b5cea8",
  comment: "#7a9a6b",
  tag: "#569cd6",
  attribute: "#9cdcfe",
  fn: "#dcdcaa",
  type: "#4ec9b0",
  property: "#9cdcfe",
};
const lightPalette: Palette = {
  bg: "#ffffff",
  fg: "#1f2328",
  gutter: "#6e7781",
  line: "#f6f8fa",
  selection: "#b6d7ff",
  keyword: "#cf222e",
  string: "#0a3069",
  number: "#0550ae",
  comment: "#57606a",
  tag: "#116329",
  attribute: "#0550ae",
  fn: "#8250df",
  type: "#953800",
  property: "#0550ae",
};
export const codeColours: { dark: Palette; light: Palette } = {
  dark: darkPalette,
  light: lightPalette,
};

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel(n >> 16) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
};
export function contrastRatio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
export { isDarkBackground } from "./page-dark";

export function codeExtensions(dark: boolean): Extension[] {
  const p = dark ? codeColours.dark : codeColours.light;
  return [
    EditorView.theme(
      {
        "&": {
          backgroundColor: p.bg,
          color: p.fg,
          fontSize: "12.5px",
          height: "100%",
        },
        ".cm-scroller": {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          lineHeight: "1.6",
        },
        ".cm-gutters": {
          backgroundColor: p.bg,
          color: p.gutter,
          border: "none",
        },
        ".cm-activeLine": { backgroundColor: p.line },
        ".cm-activeLineGutter": { backgroundColor: p.line, color: p.fg },
        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
          backgroundColor: p.selection,
        },
        ".cm-cursor": { borderLeftColor: p.fg },
      },
      { dark },
    ),
    syntaxHighlighting(
      HighlightStyle.define([
        {
          tag: [
            t.keyword,
            t.controlKeyword,
            t.moduleKeyword,
            t.definitionKeyword,
          ],
          color: p.keyword,
        },
        { tag: [t.string, t.special(t.string), t.regexp], color: p.string },
        { tag: [t.number, t.bool, t.null], color: p.number },
        {
          tag: [t.comment, t.lineComment, t.blockComment],
          color: p.comment,
          fontStyle: "italic",
        },
        { tag: [t.tagName, t.angleBracket], color: p.tag },
        { tag: t.attributeName, color: p.attribute },
        {
          tag: [t.function(t.variableName), t.function(t.propertyName)],
          color: p.fn,
        },
        { tag: [t.typeName, t.className], color: p.type },
        { tag: [t.propertyName, t.variableName], color: p.property },
      ]),
    ),
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    bracketMatching(),
  ];
}
