export type Screen = { id: string; rev: number; html: string };

export type ScreenStore = {
  get(id: string): Screen | undefined;
  set(screen: Screen): boolean;
  all(): Screen[];
  clear(): void;
  subscribe(listener: () => void): () => void;
};

export function createScreenStore(): ScreenStore {
  const screens = new Map<string, Screen>();
  const listeners = new Set<() => void>();
  return {
    get: (id) => screens.get(id),
    set(screen) {
      const existing = screens.get(screen.id);
      if (existing && existing.rev >= screen.rev) return false;
      screens.set(screen.id, screen);
      listeners.forEach((listener) => listener());
      return true;
    },
    all: () => [...screens.values()],
    clear() {
      if (screens.size === 0) return;
      screens.clear();
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
