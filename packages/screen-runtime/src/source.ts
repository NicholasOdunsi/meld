import { z } from "zod";

export const SCREEN_KINDS = ["html", "react"] as const;
export type ScreenKind = (typeof SCREEN_KINDS)[number];
export const MAX_SCREEN_FILES = 20;
export const MAX_SCREEN_SOURCE_BYTES = 262_144;
export const SCREEN_PATH = /^[A-Za-z0-9_][A-Za-z0-9_./-]{0,119}$/;

const PathSchema = z.string().regex(SCREEN_PATH).refine((path) => !path.includes(".."), "Paths cannot contain ..");

export const ScreenFilesSchema = z
  .record(PathSchema, z.string())
  .refine((files) => {
    const count = Object.keys(files).length;
    return count >= 1 && count <= MAX_SCREEN_FILES;
  }, "A screen has 1 to 20 files")
  .refine(
    (files) => new TextEncoder().encode(JSON.stringify(files)).length <= MAX_SCREEN_SOURCE_BYTES,
    "A screen's files are at most 256 KB",
  );

export const ScreenSourceSchema = z
  .object({ kind: z.enum(SCREEN_KINDS), files: ScreenFilesSchema, entry: z.string() })
  .strict()
  .refine((source) => Object.hasOwn(source.files, source.entry), {
    message: "The entry must be one of the files",
    path: ["entry"],
  });

export type ScreenSource = z.infer<typeof ScreenSourceSchema>;
