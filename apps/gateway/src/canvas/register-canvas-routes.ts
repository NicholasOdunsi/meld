import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { CanvasSessionClaims } from "@meld/device-auth";
import { verifyCanvasSessionTicket } from "@meld/device-auth";
import type { SqliteCanvasRoom } from "./sqlite-canvas-room";
import {
  CanvasRoomManagerError,
  type CanvasRoomEvidence,
  type CanvasRoomManager,
} from "./canvas-room-manager";

interface CanvasQuery {
  ticket?: string;
  sessionId?: string;
}

interface CanvasRouteParams {
  roomId: string;
}

interface CanvasMarkerBody {
  label?: string;
}

export interface RegisterCanvasRoutesOptions {
  enabled: boolean;
  sessionSecret?: string;
  roomManager: CanvasRoomManager;
}

declare module "fastify" {
  interface FastifyRequest {
    canvasClaims?: CanvasSessionClaims;
    canvasRoom?: SqliteCanvasRoom;
  }
}

function requestId(request: FastifyRequest): string {
  return String(request.id);
}

function reportReject(
  server: FastifyInstance,
  request: FastifyRequest,
  roomId: string,
  reason: string,
): void {
  server.log.warn(
    { reason, roomId, requestId: requestId(request) },
    "Canvas request rejected",
  );
}

function sendUnauthorized(
  server: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  roomId: string,
  reason: string,
): void {
  reportReject(server, request, roomId, reason);
  void reply.code(401).send({ error: "Unauthorized" });
}

function authorizationTicket(request: FastifyRequest): string | null {
  const value = request.headers.authorization;
  if (typeof value !== "string" || !value.startsWith("Canvas ")) {
    return null;
  }
  const ticket = value.slice("Canvas ".length);
  return ticket.length > 0 ? ticket : null;
}

function verifyRequestTicket(
  request: FastifyRequest,
  roomId: string,
  secret: string,
  ticket: string | null,
): CanvasSessionClaims {
  if (!ticket) throw new Error("missing_ticket");
  return verifyCanvasSessionTicket(ticket, secret, roomId);
}

function params(request: FastifyRequest): CanvasRouteParams {
  return request.params as CanvasRouteParams;
}

function query(request: FastifyRequest): CanvasQuery {
  return request.query as CanvasQuery;
}

function isManagerError(error: unknown): error is CanvasRoomManagerError {
  return error instanceof CanvasRoomManagerError;
}

function evidenceResponse(evidence: CanvasRoomEvidence) {
  return {
    roomId: evidence.roomId,
    activeSessions: evidence.activeSessions,
    documentClock: evidence.documentClock,
    clientAuditCount: evidence.clientAuditCount,
    serverAuditCount: evidence.serverAuditCount,
    auditEvents: evidence.auditEvents,
    auditFailures: evidence.auditFailures,
  };
}

export async function registerCanvasRoutes(
  server: FastifyInstance,
  options: RegisterCanvasRoutesOptions,
): Promise<void> {
  if (!options.enabled) return;
  if (!options.sessionSecret) {
    throw new Error("Canvas session secret is required when enabled");
  }

  server.decorateRequest("canvasClaims");
  server.decorateRequest("canvasRoom");

  server.get<{
    Params: CanvasRouteParams;
    Querystring: CanvasQuery;
  }>(
    "/canvas/:roomId",
    {
      websocket: true,
      logLevel: "silent",
      async preValidation(request, reply) {
        const roomId = params(request).roomId;
        const suppliedTicket = query(request).ticket;
        let claims: CanvasSessionClaims;
        try {
          claims = verifyRequestTicket(
            request,
            roomId,
            options.sessionSecret!,
            typeof suppliedTicket === "string" ? suppliedTicket : null,
          );
        } catch (error) {
          sendUnauthorized(
            server,
            request,
            reply,
            roomId,
            error instanceof Error && error.message === "Expired canvas session ticket"
              ? "expired_ticket"
              : "invalid_ticket",
          );
          return;
        }

        const sessionId = query(request).sessionId;
        if (
          typeof sessionId !== "string" ||
          sessionId.length < 1 ||
          sessionId.length > 200
        ) {
          sendUnauthorized(server, request, reply, roomId, "invalid_session_id");
          return;
        }

        try {
          request.canvasClaims = claims;
          request.canvasRoom = await options.roomManager.getOrCreate(
            claims.organizationId,
            claims.roomId,
          );
        } catch (error) {
          if (isManagerError(error) && error.code === "room_authority_unavailable") {
            reportReject(server, request, roomId, error.code);
            await reply.code(503).send({ error: "Canvas room unavailable" });
            return;
          }
          if (isManagerError(error) && error.code === "canvas_capacity_reached") {
            reportReject(server, request, roomId, error.code);
            await reply.code(503).send({ error: "Canvas capacity reached" });
            return;
          }
          throw error;
        }
      },
    },
    (socket, request) => {
      const room = request.canvasRoom;
      const claims = request.canvasClaims;
      const sessionId = query(request).sessionId;
      if (!room || !claims || !sessionId) {
        socket.close(1008, "Unauthenticated session");
        return;
      }
      try {
        // Keep this synchronous. TLSocketRoom must attach listeners before the
        // first sync frame can arrive from the client.
        options.roomManager.connectExisting({
          sessionId,
          socket: socket as never,
          organizationId: claims.organizationId,
          roomId: claims.roomId,
          meta: {
            organizationId: claims.organizationId,
            roomId: claims.roomId,
            userId: claims.userId,
            userName: claims.userName,
            access: claims.access,
            clientVersion: claims.clientVersion,
          },
        });
      } catch (error) {
        reportReject(server, request, claims.roomId, "room_connect_failed");
        socket.close(1011, "Canvas connection failed");
        void error;
      }
    },
  );

  server.post<{
    Params: CanvasRouteParams;
    Body: CanvasMarkerBody;
  }>(
    "/canvas/:roomId/trial/server-marker",
    { logLevel: "silent" },
    async (request, reply) => {
    const roomId = params(request).roomId;
    let claims: CanvasSessionClaims;
    try {
      claims = verifyRequestTicket(
        request,
        roomId,
        options.sessionSecret!,
        authorizationTicket(request),
      );
    } catch {
      sendUnauthorized(server, request, reply, roomId, "invalid_ticket");
      return;
    }
    if (claims.access !== "edit") {
      reportReject(server, request, roomId, "viewer_mutation");
      return reply.code(403).send({ error: "Editor access required" });
    }
    const body = (request.body ?? {}) as CanvasMarkerBody;
    const label =
      typeof body.label === "string" && body.label.trim().length > 0
        ? body.label.slice(0, 200)
        : "Gateway server marker";
    try {
      const marker = await options.roomManager.insertServerMarker(
        claims.organizationId,
        claims.roomId,
        label,
      );
      return reply.code(201).send(marker);
    } catch (error) {
      if (isManagerError(error)) {
        reportReject(server, request, roomId, error.code);
        return reply.code(503).send({ error: "Canvas room unavailable" });
      }
      throw error;
    }
    },
  );

  server.get<{ Params: CanvasRouteParams }>(
    "/canvas/:roomId/trial/evidence",
    { logLevel: "silent" },
    async (request, reply) => {
      const roomId = params(request).roomId;
      let claims: CanvasSessionClaims;
      try {
        claims = verifyRequestTicket(
          request,
          roomId,
          options.sessionSecret!,
          authorizationTicket(request),
        );
      } catch {
        sendUnauthorized(server, request, reply, roomId, "invalid_ticket");
        return;
      }
      if (claims.access !== "edit") {
        reportReject(server, request, roomId, "viewer_evidence");
        return reply.code(403).send({ error: "Editor access required" });
      }
      const evidence = options.roomManager.evidence(
        claims.organizationId,
        claims.roomId,
      );
      if (!evidence) return reply.code(404).send({ error: "Canvas room not found" });
      return reply.send(evidenceResponse(evidence));
    },
  );
}
