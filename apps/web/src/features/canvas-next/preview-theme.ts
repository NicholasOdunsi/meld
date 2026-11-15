// Copy the active app theme into the isolated preview; never redefine the app palette.
const tokens = ["--color-text-primary", "--color-text-secondary", "--color-background-body",
  "--color-background-surface", "--color-background-muted", "--color-accent", "--color-on-accent",
  "--spacing-3", "--spacing-6", "--spacing-8", "--spacing-12", "--font-family-body",
  "--font-size-5xl", "--radius-full", "--radius-container"];
export function previewTheme(style: Pick<CSSStyleDeclaration, "getPropertyValue">): string {
  return `body { ${tokens.map(token => `${token}: ${style.getPropertyValue(token).trim()};`).join(" ")} }`;
}
export const previewChromeCss = `
html, body { margin: var(--spacing-0, 0); height: 100%; }
*, *::before, *::after { box-sizing: border-box; }
#meld-screen-picker { display: none; }
`;
