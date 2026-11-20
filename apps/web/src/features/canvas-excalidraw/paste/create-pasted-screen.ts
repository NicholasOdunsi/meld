import { frameSizeForFormFactor, type FormFactor } from "@meld/prototype";
import type { ScreenSource } from "@meld/screen-runtime/source";
import type { CreateCanvasScreenResult } from "@/features/design/canvas-screen-source";
import type { Viewport } from "../chrome/zoom";
import { boardScreenId } from "../board-screen-id";
import type { LiveSource } from "../live/live-source";
import { sleepingPlaceholder } from "../live/placeholder";
import type { ScreenStore } from "../screen-store";
import { centredPosition } from "./placement";

export type PasteInput = { name: string; source: ScreenSource; formFactor: FormFactor };
export type PasteDeps = {
  roomId: string;
  view: Viewport;
  store: Pick<ScreenStore, "set">;
  create: (input: { roomId: string; name: string; source: ScreenSource; formFactor: FormFactor }) => Promise<CreateCanvasScreenResult>;
  addFrame: (frame: { screenId: string; x: number; y: number; width: number; height: number }) => void;
  wake: (boardScreenId: string, preloaded: LiveSource) => void;
};

// Save first, so nothing lands on the board that the screen store doesn't
// have. The placeholder is the picture until the live run's snapshot arrives.
export async function createPastedScreen(
  deps: PasteDeps,
  input: PasteInput,
): Promise<{ status: "created"; boardScreenId: string } | { status: "error" }> {
  const created = await deps.create({ roomId: deps.roomId, name: input.name, source: input.source, formFactor: input.formFactor });
  if (created.status !== "created") return { status: "error" };
  const id = boardScreenId(created.screenId);
  deps.store.set({ id, rev: 1, html: sleepingPlaceholder(input.name) });
  const size = frameSizeForFormFactor(input.formFactor);
  deps.addFrame({ screenId: id, ...centredPosition(deps.view, size), width: size.w, height: size.h });
  deps.wake(id, { source: input.source, snapshot: true });
  return { status: "created", boardScreenId: id };
}
