// Kept separate from e2e-fake.ts so that backend.ts can read the gate
// without statically importing the fake -- and pulling its in-memory store
// into the real bundle. Mirrors rooms/e2e-gate.ts.
export function isWorkspaceFakeEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.MELD_E2E_FAKE_WORKSPACES === "true"
  );
}
