import type { IconResolver } from "@meld/prototype";
import iconNodes from "lucide-static/icon-nodes.json";

// Lucide ships each icon as an array of [tagName, attributes] child nodes.
type LucideNode = [string, Record<string, string | number>];

function nodeToMarkup([tag, attrs]: LucideNode): string {
  const serialized = Object.entries(attrs)
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ");
  return `<${tag}${serialized ? ` ${serialized}` : ""}/>`;
}

const table = iconNodes as unknown as Record<string, LucideNode[]>;

/** Resolves a kebab-case Lucide icon name to its inner SVG markup, or null. */
export const lucideIconResolver: IconResolver = (name) => {
  const nodes = table[name];
  return nodes ? nodes.map(nodeToMarkup).join("") : null;
};
