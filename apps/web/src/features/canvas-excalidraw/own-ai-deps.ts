import { generateDesignScreen, getDesignScreenGeneration } from "@/features/design/design-screen-generation";
import { buildFramePreviewDoc } from "@/features/canvas/screen-preview-doc";
import { previewChromeCss, previewTheme } from "@/features/canvas-next/preview-theme";
import { listRoomTaskStatuses } from "@/features/rooms/actions";
import { loadRoomScreen } from "./load-screen";
import type { OwnAiDeps } from "./own-ai-generator";

// The real queue, status poll and screen reader for one room. Only wiring: the
// logic that uses these lives in own-ai-generator.ts and is tested there.
export function createRoomOwnAiDeps(roomId: string): OwnAiDeps {
  return {
    // No provider: the owner's default connected AI is used.
    start: (input) => generateDesignScreen({ roomId, name: input.name, instruction: input.instruction, layout: input.layout }),
    generation: async (taskId) => {
      const generation = await getDesignScreenGeneration(taskId);
      return generation ? { versionId: generation.versionId } : null;
    },
    taskStatus: async (taskId) => {
      const row = (await listRoomTaskStatuses(roomId)).find((status) => status.taskId === taskId);
      return row ? { status: row.status, provider: row.provider } : null;
    },
    loadDocument: async (screenId) => {
      const screen = await loadRoomScreen(roomId, screenId);
      if (!screen) return null;
      try {
        // Same theme the canvas preview copies into its isolated pages.
        return buildFramePreviewDoc(screen, previewTheme(getComputedStyle(document.body)), previewChromeCss);
      } catch {
        return null;
      }
    },
  };
}
