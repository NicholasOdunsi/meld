"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  // Mount state never changes after the initial client render, so there
  // is nothing to notify; useSyncExternalStore only needs a no-op.
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

// False during server render and the pre-hydration client pass, true once
// mounted. useSyncExternalStore (rather than useState + useEffect) is the
// React-recommended way to express this, since it doesn't call setState
// from inside an effect.
export function useIsMounted() {
  return useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
}
