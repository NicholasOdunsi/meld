import { verifyCanvasSessionTicket, type CanvasSessionClaims } from "@meld/device-auth";
import type { AuthenticatedDeviceIdentity } from "@meld/gateway/core";

export const DEVICE_HEADER = "x-orion-device";
export const CANVAS_HEADER = "x-orion-canvas";

export interface CanvasConnect { claims: CanvasSessionClaims; sessionId: string }

export interface RouterDeps {
  authenticate(authorization: string | null): Promise<AuthenticatedDeviceIdentity | null>;
  canvasSecret: string;
  forwardToHub(request: Request, device: AuthenticatedDeviceIdentity): Promise<Response>;
  forwardToCanvas(request: Request, connect: CanvasConnect): Promise<Response>;
  now?: () => Date;
}

const CANVAS_PATH = /^\/canvas\/([^/]+)$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function isUpgrade(request: Request): boolean {
  return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

export async function route(request: Request, deps: RouterDeps): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/health") return json({ status: "ok" });

  if (url.pathname === "/ws") {
    if (!isUpgrade(request)) return json({ error: "Upgrade Required" }, 426);
    const device = await deps.authenticate(request.headers.get("Authorization"));
    if (!device) return json({ error: "Unauthorized" }, 401);
    return deps.forwardToHub(request, device);
  }

  const canvas = CANVAS_PATH.exec(url.pathname);
  if (canvas) {
    if (!isUpgrade(request)) return json({ error: "Upgrade Required" }, 426);
    const roomId = decodeURIComponent(canvas[1]!);
    let claims: CanvasSessionClaims;
    try {
      claims = verifyCanvasSessionTicket(
        url.searchParams.get("ticket") ?? "", deps.canvasSecret, roomId, deps.now?.() ?? new Date());
    } catch {
      return json({ error: "Unauthorized" }, 401);
    }
    const sessionId = url.searchParams.get("sessionId") ?? "";
    if (sessionId.length < 1 || sessionId.length > 200) return json({ error: "Unauthorized" }, 401);
    return deps.forwardToCanvas(request, { claims, sessionId });
  }

  return json({ error: "Not Found" }, 404);
}
