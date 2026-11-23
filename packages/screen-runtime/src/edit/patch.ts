import { FIELDS, type Field, type FieldState, type Tweak } from "./types";

export type Patch = { from: number; to: number; value: string };
// `make` is null for a field the inspector shows but cannot change (text set by the code, or
// too many text runs): it is read-only and `value` is what the source shows statically.
// `runs` lists an element's text runs when it has several; `make` then takes the run's index.
export type Binding = {
  value: string | null;
  make: ((input: string, index?: number) => Patch | null) | null;
  runs?: string[];
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
        FIELDS.map((field) => {
          const binding = bindings[field];
          const state: FieldState = {
            editable: (binding?.make ?? null) !== null,
            value: binding?.value ?? null,
          };
          if (binding?.runs) state.runs = [...binding.runs];
          return [field, state];
        }),
      ) as Record<Field, FieldState>,
    patch: ({ field, value, index }) => {
      // Only text has runs to choose from.
      if (index !== undefined && field !== "text") return null;
      return bindings[field]?.make?.(value, index) ?? null;
    },
  };
}
