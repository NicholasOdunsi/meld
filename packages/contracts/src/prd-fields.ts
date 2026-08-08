import { PRDDocumentSchema, type PRDDocument } from "./prd";

export type PrdFieldName = keyof PRDDocument;

const FIELD_SHAPE = PRDDocumentSchema.shape;

export const PRD_FIELD_NAMES = Object.keys(
  FIELD_SHAPE,
) as readonly PrdFieldName[];

export function isPrdFieldName(value: string): value is PrdFieldName {
  return Object.hasOwn(FIELD_SHAPE, value);
}

export function parsePrdFieldValue(
  field: PrdFieldName,
  value: unknown,
): { ok: true; value: unknown } | { ok: false } {
  const result = FIELD_SHAPE[field].safeParse(value);
  return result.success ? { ok: true, value: result.data } : { ok: false };
}
