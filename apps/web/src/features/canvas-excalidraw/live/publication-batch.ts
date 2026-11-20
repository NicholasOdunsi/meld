// One synchronous ownership change can update registry aliases, controller IDs
// and scene links. Publish subscribers only after all three are consistent.
export function createPublicationBatch() {
  let depth = 0;
  const queued = new Set<() => void>();
  const notify = (listener: () => void) => {
    if (depth) queued.add(listener);
    else listener();
  };
  function batch(run: () => void) {
    depth++;
    try {
      run();
    } finally {
      if (--depth === 0) {
        const pending = [...queued];
        queued.clear();
        for (const listener of pending) {
          try {
            listener();
          } catch (error) {
            console.error(error);
          }
        }
      }
    }
  }
  return { batch, notify };
}
