export function isDiscoveryFakeEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.MELD_E2E_FAKE_DISCOVERY === "true" &&
    process.env.MELD_E2E_FAKE_WORKSPACES === "true"
  );
}
