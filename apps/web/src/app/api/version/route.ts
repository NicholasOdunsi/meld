// The deployment serving this request. Open Orion windows compare it with the
// one they loaded and reload themselves after a deploy.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { id: process.env.VERCEL_DEPLOYMENT_ID ?? "local" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
