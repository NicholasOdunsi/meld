import { FIELDS, type Field, type FieldState, type Tweak } from "./types";

export type Patch = { from: number; to: number; value: string };
export type Binding = {
  value: string | null;
  make: (input: string) => Patch | null;
};
export type Bindings = Record<Field, Binding | null>;
export type EditableNode = {
  inspect(): Record<Field, FieldState>;
  patch(tweak: Tweak): Patch | null;
};
export function spliceAt(source: string, patch: Patch): string {
  return source.slice(0, patch.from) + patch.value + source.slice(patch.to);
}
export function emptyBindings(): Bindings {
  return Object.fromEntries(FIELDS.map((field) => [field, null])) as Bindings;
}
export function descriptor(bindings: Bindings): EditableNode {
  return {
    inspect: () =>
      Object.fromEntries(
        FIELDS.map((field) => [
          field,
          {
            editable: bindings[field] !== null,
            value: bindings[field]?.value ?? null,
          },
        ]),
      ) as Record<Field, FieldState>,
    patch: ({ field, value }) => bindings[field]?.make(value) ?? null,
  };
}
