// A project's chat tabs are its rooms. These helpers are pure so the sidebar,
// the tab strip, and the server agree on order and naming without a database.

export const MAIN_TAB_NAME = "Main";
export const NEW_TAB_BASE_NAME = "New chat";

export type ProjectTabRoom = {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
};

// Oldest first, so the first room a project ever had (its "Main") stays the
// leftmost tab. Ties fall back to id so the order never flickers.
export function orderProjectTabs<T extends ProjectTabRoom>(
  rooms: readonly T[],
  projectId: string,
): T[] {
  return rooms
    .filter((room) => room.projectId === projectId)
    .toSorted((a, b) =>
      a.createdAt === b.createdAt
        ? a.id.localeCompare(b.id)
        : a.createdAt.localeCompare(b.createdAt),
    );
}

// "New chat", then "New chat 2", "New chat 3", … — the first name not taken.
export function nextTabName(existingNames: readonly string[]): string {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  if (!taken.has(NEW_TAB_BASE_NAME.toLowerCase())) return NEW_TAB_BASE_NAME;
  for (let n = 2; ; n += 1) {
    const candidate = `${NEW_TAB_BASE_NAME} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
