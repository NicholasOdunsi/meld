import { z } from "zod";
import { compileScreen, type CompileResult } from "@meld/screen-runtime";
import { ScreenSourceSchema, type ScreenSource } from "@meld/screen-runtime/source";

export type CompileRequest = { id: number; source: ScreenSource; tagElements: boolean };
export type CompileResponse = { id: number; result: CompileResult };

const RequestSchema = z.object({ id: z.number().int().nonnegative(), source: z.unknown(), tagElements: z.boolean() }).strict();

export function handleCompileRequest(data: unknown): CompileResponse | null {
  const request = RequestSchema.safeParse(data);
  if (!request.success) return null;
  const { id, tagElements } = request.data;
  const source = ScreenSourceSchema.safeParse(request.data.source);
  if (!source.success) {
    return { id, result: { ok: false, errors: [{ file: "", message: source.error.issues[0]?.message ?? "This screen's files are not valid" }] } };
  }
  try {
    return { id, result: compileScreen(source.data, { tagElements }) };
  } catch (error) {
    return { id, result: { ok: false, errors: [{ file: "", message: error instanceof Error ? error.message : String(error) }] } };
  }
}
