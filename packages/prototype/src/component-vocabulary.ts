// Screens are generated one at a time and each one's CSS is scoped to its own
// section, so nothing about a component's *look* carries between them: a room
// ends up with `.metric-card` on one screen and `.summary-card` on the next,
// styled differently, or -- worse -- one screen wrapping its figures in cards
// and the next leaving them bare. The shared layout fixed the app shell; this
// does the same job for what sits inside it, by handing the next generation a
// short description of the components a screen in this room already uses.
//
// Deliberately a summary, not the stylesheet: the instruction has a hard
// character budget it shares with the user's own words, and the model needs
// enough to match a look, not enough to copy a file.

// The declarations that decide whether two components read as the same
// component. Layout plumbing (display, flex-direction, grid-template) is
// per-screen by nature and left out -- it is noise here, and a screen that
// copied it would fight its own composition.
const VISUAL_PROPERTIES = [
  "background",
  "background-color",
  "border",
  "border-radius",
  "box-shadow",
  "padding",
  "color",
  "font-size",
  "font-weight",
] as const;

// A component that draws a surface -- a card, a panel, a badge. These are what
// go missing when a screen is written cold (bare numbers instead of stat
// cards), so they lead the list and survive the budget.
const CONTAINER_PROPERTIES = new Set([
  "background",
  "background-color",
  "border",
  "border-radius",
  "box-shadow",
]);

export type ComponentVocabularyEntry = {
  className: string;
  declarations: string[];
};

const DEFAULT_MAX_COMPONENTS = 14;
const DEFAULT_MAX_DECLARATIONS = 5;
const DEFAULT_MAX_CHARS = 900;

// Every `selector { declarations }` rule. Matching the whole rule (rather than
// anchoring on the previous rule's `}`) is what lets consecutive rules both
// match -- an anchored pattern consumes the brace the next rule would need.
const CSS_RULE = /([^{}]+)\{([^{}]*)\}/g;

// A lone class selector: `.metric-card`, never `.a .b` or `.row > .cell`.
// Those style a component's insides, which follow from the component itself.
const SINGLE_CLASS_SELECTOR = /^\.([a-z][a-z0-9_-]*)$/i;

function declarationsFor(body: string, maxDeclarations: number): string[] {
  const kept: string[] = [];
  for (const raw of body.split(";")) {
    const [property, ...rest] = raw.split(":");
    if (rest.length === 0) continue;
    const name = property.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (!value) continue;
    if (!(VISUAL_PROPERTIES as readonly string[]).includes(name)) continue;
    kept.push(`${name}: ${value}`);
    if (kept.length === maxDeclarations) break;
  }
  return kept;
}

// Pulls the reusable components out of one screen's stylesheet. Order is
// container-first, then source order, so truncation drops the least
// structural entries rather than an arbitrary tail.
export function extractComponentVocabulary(
  styles: string,
  options: { maxComponents?: number; maxDeclarations?: number } = {},
): ComponentVocabularyEntry[] {
  const maxComponents = options.maxComponents ?? DEFAULT_MAX_COMPONENTS;
  const maxDeclarations = options.maxDeclarations ?? DEFAULT_MAX_DECLARATIONS;
  // At-rule bodies are dropped wholesale: a responsive override of a component
  // is not a second component, and `@media (...) { .card { ... } }` would
  // otherwise surface `.card`'s narrow-screen padding as its real look.
  const withoutAtRules = styles.replace(/@[a-z-]+[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/gi, " ");

  const seen = new Set<string>();
  const entries: ComponentVocabularyEntry[] = [];
  for (const match of withoutAtRules.matchAll(CSS_RULE)) {
    const selector = SINGLE_CLASS_SELECTOR.exec((match[1] ?? "").trim());
    if (!selector) continue;
    const className = selector[1];
    if (seen.has(className)) continue;
    const declarations = declarationsFor(match[2] ?? "", maxDeclarations);
    if (declarations.length === 0) continue;
    seen.add(className);
    entries.push({ className, declarations });
  }

  const isContainer = (entry: ComponentVocabularyEntry) =>
    entry.declarations.some((declaration) =>
      CONTAINER_PROPERTIES.has(declaration.split(":")[0].trim()),
    );
  return [
    ...entries.filter(isContainer),
    ...entries.filter((entry) => !isContainer(entry)),
  ].slice(0, maxComponents);
}

// The untrusted-data block naming the room's established components. The
// closing carve-out matters as much as the list: reuse is the default so
// screens match, but a request for a variation, an alternative or a new look
// has to win -- otherwise "show me three takes on this dashboard" would come
// back as the same screen three times.
export function formatComponentVocabulary(
  sourceScreenName: string,
  entries: readonly ComponentVocabularyEntry[],
  options: { maxChars?: number } = {},
): string {
  if (entries.length === 0) return "";
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const header =
    `EXISTING COMPONENTS (untrusted data), already used by "${sourceScreenName}" in this room. ` +
    "Reuse these class names and this look for the same kind of element so the room's screens match. " +
    "If this request asks for a variation, an alternative, or a different look, follow the request instead:";
  if (header.length > maxChars) return "";

  const lines: string[] = [header];
  let length = header.length;
  for (const entry of entries) {
    const line = `- .${entry.className} { ${entry.declarations.join("; ")} }`;
    if (length + 1 + line.length > maxChars) break;
    lines.push(line);
    length += 1 + line.length;
  }
  return lines.join("\n");
}
