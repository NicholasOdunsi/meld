import {
  CANVAS_SESSION_LIFETIME_SECONDS,
  mintCanvasSessionTicket,
} from "@meld/device-auth";
import { z } from "zod";

import { getRoomPageData } from "@/features/rooms/queries";
import { isCanvasGatewayUrl } from "@/features/canvas/canvas-session";
import { isWorkspaceFakeEnabled } from "@/features/workspaces/e2e-gate";
import { createClient } from "@/lib/supabase/server";

const CanvasSessionRequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
    roomId: z.string().uuid(),
  })
  .strict();

const INVALID_REQUEST = "Invalid canvas session request.";
const AUTHENTICATION_REQUIRED = "Authentication required.";
const CANVAS_TRIAL_UNAVAILABLE = "Canvas trial unavailable.";
const ROOM_NOT_FOUND = "Room not found.";
const ROOM_ACCESS_REQUIRED = "Room access required.";
const CANVAS_CONFIGURATION_UNAVAILABLE =
  "Canvas trial configuration unavailable.";
function jsonError(
  message: string,
  status: number,
  headers?: Headers,
): Response {
  return Response.json(
    { error: message },
    headers ? { status, headers } : { status },
  );
}

function trialIsAvailable(): boolean {
  return (
    process.env.MELD_USER_FLOW_TRIAL_ENABLED === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

export async function POST(request: Request) {
  // The trial is intentionally unavailable in production until the tldraw
  // procurement and production durability gates have been cleared.
  if (!trialIsAvailable()) {
    return jsonError(CANVAS_TRIAL_UNAVAILABLE, 404);
  }

  const responseHeaders = new Headers();
  responseHeaders.set("cache-control", "no-store");
  const useFakeWorkspace = isWorkspaceFakeEnabled();
  let isAuthenticated = false;
  if (useFakeWorkspace) {
    const { getFakeUser } = await import("@/features/workspaces/e2e-fake");
    isAuthenticated = (await getFakeUser()) !== null;
  } else {
    const supabase = await createClient(responseHeaders);
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    isAuthenticated = !claimsError && Boolean(claimsData?.claims?.sub);
  }

  if (!isAuthenticated) {
    return jsonError(
      AUTHENTICATION_REQUIRED,
      401,
      responseHeaders,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(INVALID_REQUEST, 400, responseHeaders);
  }

  const parsed = CanvasSessionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(INVALID_REQUEST, 400, responseHeaders);
  }

  const room = await getRoomPageData({
    workspaceId: parsed.data.workspaceId,
    roomId: parsed.data.roomId,
    includeMessages: false,
  });

  if (!room) {
    return jsonError(ROOM_NOT_FOUND, 404, responseHeaders);
  }

  const participant = room.participants.find(
    (candidate) => candidate.userId === room.currentUser.id,
  );
  const access =
    room.room.ownerId === room.currentUser.id ||
    room.isCurrentUserWorkspaceAdmin ||
    participant?.access === "edit"
      ? "edit"
      : participant?.access === "view"
        ? "view"
        : null;

  if (!access) {
    return jsonError(ROOM_ACCESS_REQUIRED, 403, responseHeaders);
  }

  const secret = process.env.MELD_CANVAS_SESSION_SECRET;
  const gatewayUrl = process.env.MELD_CANVAS_WS_URL?.trim();
  if (
    !secret ||
    secret.trim().length === 0 ||
    secret.length < 32 ||
    !gatewayUrl ||
    !isCanvasGatewayUrl(gatewayUrl)
  ) {
    return jsonError(
      CANVAS_CONFIGURATION_UNAVAILABLE,
      503,
      responseHeaders,
    );
  }

  const now = new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  let ticket: string;
  try {
    ticket = mintCanvasSessionTicket(
      {
        workspaceId: room.room.workspaceId,
        roomId: room.room.id,
        userId: room.currentUser.id,
        userName: room.currentUser.name,
        access,
      },
      secret,
      now,
    );
  } catch {
    // Treat malformed secrets as unavailable trial configuration rather than
    // exposing a server error or a package implementation detail.
    return jsonError(
      CANVAS_CONFIGURATION_UNAVAILABLE,
      503,
      responseHeaders,
    );
  }

  return Response.json(
    {
      ticket,
      gatewayUrl,
      access,
      expiresAt: issuedAt + CANVAS_SESSION_LIFETIME_SECONDS,
    },
    { status: 201, headers: responseHeaders },
  );
}
