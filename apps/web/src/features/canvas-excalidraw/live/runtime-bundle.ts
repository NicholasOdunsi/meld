// The vendored React/Lucide/clsx/Tailwind runtime (Plan 1, Task B8), served
// from apps/web/public. It is inlined into every live document so the frame
// never fetches anything (FRAME_CSP blocks the network anyway).
export const RUNTIME_BUNDLE_URL = "/screen-runtime/runtime.js";

let cached: Promise<string> | null = null;

export function loadRuntimeBundle(fetcher: typeof fetch = fetch): Promise<string> {
  cached ??= fetcher(RUNTIME_BUNDLE_URL)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Could not load the screen runtime (${response.status})`);
      return response.text();
    })
    .catch((error: unknown) => {
      cached = null;
      throw error;
    });
  return cached;
}

export function resetRuntimeBundleForTests(): void {
  cached = null;
}
