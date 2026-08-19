import { assembleValidatedPrototype } from "@meld/prototype";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";

// Builds the sandboxed HTML document for a built screen's live preview -- the
// same doc the canvas frame and the Agents-transcript thumbnail render.
// Deliberately tldraw-free (unlike screen-frame-overlay, which imports the
// editor) so consumers outside the canvas can render a preview without
// pulling the whole editor into their bundle/tests.
export function buildFramePreviewDoc(
  screen: CanvasScreen,
  tokenCss: string,
  componentCss = "",
): string | null {
  if (screen.state !== "built" || !screen.preview) return null;

  return assembleValidatedPrototype({
    screens: [
      {
        id: screen.id,
        name: screen.name,
        ...screen.preview,
        // `screen.preview` never carries a `layout` key -- this reader builds
        // it from just markup/styles/script/actions -- but its type
        // (DesignScreenPayload) allows one, and that slot means something
        // different there (the generator's wire-level reuse/create directive)
        // than it does here (the already-resolved shell). Setting it after the
        // spread puts the composer's actual shell, `screen.layout`, in place.
        layout: screen.layout,
      },
    ],
    startScreenId: screen.id,
    tokenCss,
    componentCss,
  });
}
