// A leaf module: no Excalidraw import, so logic that only needs the id
// mapping stays testable without the editor bundle.
export function boardScreenId(designScreenId: string): string {
  return `ds-${designScreenId.toLowerCase()}`;
}
