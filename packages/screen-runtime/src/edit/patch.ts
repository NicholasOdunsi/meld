import { FIELDS, type Field, type FieldState, type Tweak } from "./types";

export type Patch = { from: number; to: number; value: string };
// `make` is null for a field the inspector shows but cannot change (text set by the code, or
// several text runs): it is read-only and `value` is what the source shows statically.
export type Binding = {
  value: string | null;
  make: ((input: string) => Patch | null) | null;
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
            editable: (bindings[field]?.make ?? null) !== null,
            value: bindings[field]?.value ?? null,
          },
        ]),
      ) as Record<Field, FieldState>,
    patch: ({ field, value }) => bindings[field]?.make?.(value) ?? null,
  };
}
