import { z } from "zod";
import {
  parsePrdFieldValue,
  type PrdFieldName,
} from "./prd-fields";

export const PrdSectionRevisionEnvelopeSchema = z
  .object({ value: z.unknown() })
  .strict();

export function parsePrdSectionRevision(
  field: PrdFieldName,
  result: unknown,
): { ok: true; value: unknown } | { ok: false } {
  const envelope = PrdSectionRevisionEnvelopeSchema.safeParse(result);
  if (!envelope.success) return { ok: false };
  return parsePrdFieldValue(field, envelope.data.value);
}
