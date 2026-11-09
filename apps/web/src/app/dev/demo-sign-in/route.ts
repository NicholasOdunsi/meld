import {
  E2E_OWNER_ID,
  E2E_WORKSPACE_ID,
  isWorkspaceFakeEnabled,
} from "@/features/workspaces/e2e-fake";

const DEMO_EMAIL = "owner@example.com";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

// Local preview only (apps/mac/scripts/preview.sh): signs the Orion Preview
// app in as the demo owner of the built-in demo data. It does nothing unless
// demo mode is on, which is impossible in production (see e2e-gate.ts).
export async function GET(request: Request) {
  if (!isWorkspaceFakeEnabled()) {
    return new Response("Not found", { status: 404 });
  }
  const url = new URL(request.url);
  const next = url.searchParams.get("next");
  const target =
    next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : `/${E2E_WORKSPACE_ID}`;
  const headers = new Headers({ Location: target });
  for (const [name, value] of [
    ["meld-e2e-user-id", E2E_OWNER_ID],
    ["meld-e2e-user-email", DEMO_EMAIL],
  ]) {
    headers.append(
      "Set-Cookie",
      `${name}=${value}; Path=/; Max-Age=${THIRTY_DAYS}; SameSite=Lax`,
    );
  }
  return new Response(null, { status: 307, headers });
}
