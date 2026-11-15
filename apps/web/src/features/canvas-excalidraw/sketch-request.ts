import { z } from "zod";

export const SketchShapeSchema = z
  .object({
    type: z.string().min(1).max(40),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite(),
    height: z.number().finite(),
    text: z.string().max(500).optional(),
  })
  .strict();

export const SketchRequestSchema = z
  .object({
    width: z.number().int().min(100).max(4000),
    height: z.number().int().min(100).max(4000),
    geometry: z.array(SketchShapeSchema).max(500),
    imageDataUrl: z
      .string()
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
      .max(4_000_000)
      .optional(),
  })
  .strict();

export type SketchShape = z.infer<typeof SketchShapeSchema>;
export type SketchRequest = z.infer<typeof SketchRequestSchema>;
