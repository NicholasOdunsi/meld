import type { DesignProfile } from "@meld/contracts";

export const MAX_COMPONENT_CSS_TOTAL_BYTES = 49152;
const encoder = new TextEncoder();

// Meld assembles the shared component stylesheet from the (already sanitized)
// per-component css. Model authors each component's css; Meld only concatenates.
export function compileComponentCss(profile: DesignProfile): string {
  const blocks: string[] = [];
  let used = 0;
  for (const component of profile.components) {
    if (!component.css) continue;
    const block = `/* ds:${component.name} */\n${component.css}`;
    const size = encoder.encode(block).length + 1;
    if (used + size > MAX_COMPONENT_CSS_TOTAL_BYTES) break;
    blocks.push(block);
    used += size;
  }
  return blocks.join("\n");
}
