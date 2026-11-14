import { fakeGeneratedScreen } from "@/features/canvas-excalidraw/fixtures";
import { GenerateError, generateScreen } from "@/features/canvas-excalidraw/generate-screen";
import { buildSketchPrompt } from "@/features/canvas-excalidraw/sketch-prompt";
import { SketchRequestSchema } from "@/features/canvas-excalidraw/sketch-request";
import { isWorkspaceFakeEnabled } from "@/features/workspaces/e2e-gate";

const MODEL = "deepseek-flash";

// Development-only. The production path will go through the existing
// generation task queue (delivery stage 2).
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return Response.json({ error: "Not found" }, { status: 404 });
  const parsed = SketchRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (isWorkspaceFakeEnabled()) return Response.json(fakeGeneratedScreen());
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return Response.json({ error: "DEEPSEEK_API_KEY is not set" }, { status: 503 });
  try {
    return Response.json(
      await generateScreen({
        prompt: buildSketchPrompt(parsed.data),
        imageDataUrl: parsed.data.imageDataUrl,
        apiKey,
        model: process.env.DEEPSEEK_TEXT_MODEL || MODEL,
      }),
    );
  } catch (error) {
    return Response.json({ error: error instanceof GenerateError ? error.code : "failed" }, { status: 502 });
  }
}
