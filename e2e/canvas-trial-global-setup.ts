const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "40000000-0000-4000-8000-000000000001";

export default async function canvasTrialGlobalSetup() {
  const appBaseUrl =
    `http://127.0.0.1:${process.env.MELD_CANVAS_E2E_APP_PORT ?? 18788}`;
  const cookie = [
    "meld-e2e-user-id=10000000-0000-4000-8000-000000000001",
    "meld-e2e-user-email=owner@example.com",
    "meld-e2e-user-name=Owner Example",
  ].join("; ");
  const roomUrl = new URL(
    `/${WORKSPACE_ID}/rooms/${ROOM_ID}?tab=user-flows`,
    appBaseUrl,
  );

  const response = await fetch(roomUrl, {
    headers: { cookie },
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    throw new Error(`Canvas trial warm-up failed with HTTP ${response.status}.`);
  }
}
