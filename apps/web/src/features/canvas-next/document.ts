import { z } from "zod";

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_OBJECTS = 5000;
export const MAX_STROKE_POINTS = 10000;
const id = z.string().min(1).max(128);
const finite = z.number().finite();
const point = z.object({ x: finite, y: finite }).strict();
const bounds = { id, x: finite, y: finite, width: finite.positive(), height: finite.positive() };
export const CanvasDocumentSchema = z.object({
  version: z.literal(1),
  objects: z.array(z.discriminatedUnion("kind", [
    z.object({ ...bounds, kind: z.literal("rectangle") }).strict(),
    z.object({ ...bounds, kind: z.literal("text"), text: z.string().max(32000) }).strict(),
    z.object({ ...bounds, kind: z.literal("stroke"), points: z.array(point).min(1).max(MAX_STROKE_POINTS) }).strict(),
    z.object({ ...bounds, kind: z.literal("image"), assetId: id }).strict(),
    z.object({ ...bounds, kind: z.literal("html-frame"), screenId: id }).strict(),
  ])).max(MAX_OBJECTS),
}).strict().refine(doc => new Set(doc.objects.map(object => object.id)).size === doc.objects.length, {
  message: "Canvas object IDs must be unique",
});
export type Point = z.infer<typeof point>;
export type CanvasDocument = z.infer<typeof CanvasDocumentSchema>;
export type CanvasObject = CanvasDocument["objects"][number];
export function decodeCanvasDocument(raw: string): CanvasDocument {
  if (new TextEncoder().encode(raw).byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error("Canvas file exceeds 8 MiB");
  }
  return CanvasDocumentSchema.parse(JSON.parse(raw));
}
