import type { PluginObj, types as BabelTypes } from "@babel/core";

// A nested frame would run its own scripts without the loop guard
// (`<iframe srcdoc>`), and CSP already blocks every other use of these tags
// (network frames via frame-src, object/embed via default-src). Honest limit:
// frames created at runtime (document.createElement / React.createElement)
// are not seen here; the inherited CSP still applies to them.
export const EMBEDDED_FRAME_TAGS: ReadonlySet<string> = new Set(["iframe", "frame", "frameset", "object", "embed"]);

export function embeddedFrameMessage(tag: string): string {
  return `Embedded frames are not supported: <${tag}>`;
}

export function embeddedFramesPlugin(found: Set<string>) {
  return ({ types: t }: { types: typeof BabelTypes }): PluginObj => ({
    name: "orion-embedded-frames",
    visitor: {
      JSXOpeningElement(path) {
        const { name } = path.node;
        if (t.isJSXIdentifier(name) && EMBEDDED_FRAME_TAGS.has(name.name)) found.add(name.name);
      },
    },
  });
}
