import { z } from "zod";
import { compileScreen, extractLinks } from "@meld/screen-runtime";
import { ScreenFilesSchema, ScreenSourceSchema, MAX_SCREEN_SOURCE_BYTES } from "@meld/screen-runtime/source";
import { applyTweak, FIELDS, inspectElement } from "@meld/screen-runtime/edit";
import type { SourceRequest, SourceReply, SourceSuccess } from "./source-protocol-types";

const id = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const op = z.enum(["compile", "inspect", "tweak", "links"]);
const identity = z.object({ id, op });
const src = z.string().min(1).max(155);
const tweak = z.object({ field: z.enum(FIELDS), value: z.string().max(MAX_SCREEN_SOURCE_BYTES) }).strict();
const requestSchema = z.discriminatedUnion("op", [
  z.object({ id, op: z.literal("compile"), source: ScreenSourceSchema, tagElements: z.boolean() }).strict(),
  z.object({ id, op: z.literal("inspect"), files: ScreenFilesSchema, src }).strict(),
  z.object({ id, op: z.literal("tweak"), files: ScreenFilesSchema, src, tweak }).strict(),
  z.object({ id, op: z.literal("links"), files: ScreenFilesSchema }).strict(),
]);

// Parser implementations stay inside this worker-only module.
export function perform(req: SourceRequest): SourceSuccess {
  switch (req.op) {
    case "compile": return { id: req.id, op: req.op, result: compileScreen(req.source, { tagElements: req.tagElements }) };
    case "inspect": return { id: req.id, op: req.op, result: inspectElement(req.files, req.src) };
    case "tweak": return { id: req.id, op: req.op, result: applyTweak(req.files, req.src, req.tweak) };
    case "links": return { id: req.id, op: req.op, result: extractLinks(req.files) };
  }
}
export function handleSourceRequest(data: unknown): SourceReply | null {
  const who = identity.safeParse(data);
  if (!who.success) {
    const identifiable = z.object({ id }).safeParse(data);
    if (!identifiable.success) return null;
    // Malformed operations have no valid discriminant. A fallback error still
    // settles the matching ID: other pending operations reject the mismatch.
    return { id: identifiable.data.id, op: "compile", error: "Invalid worker operation" };
  }
  const request = requestSchema.safeParse(data);
  if (!request.success) return { ...who.data, error: request.error.issues[0]?.message ?? "Invalid screen editor request" };
  try { return perform(request.data); }
  catch (error) { return { ...who.data, error: error instanceof Error ? error.message : String(error) }; }
}
