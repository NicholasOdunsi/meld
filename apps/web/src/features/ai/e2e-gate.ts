// Kept separate from e2e-fake.ts so callers can read the gate without
// statically importing the fake -- and pulling its in-memory store into
// the real bundle. Mirrors workspaces/e2e-gate.ts.
export function isDeviceFakeEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.MELD_E2E_FAKE_DEVICES === "true"
  );
}
