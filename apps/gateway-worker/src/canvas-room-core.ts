import type { CanvasSessionClaims } from "@meld/device-auth";
import {
  SQLiteSyncStorage,
  TLSocketRoom,
  type TLSyncSqliteWrapper,
  type WebSocketMinimal,
} from "@tldraw/sync-core";
import { createTLSchema, type TLRecord } from "@tldraw/tlschema";

export type CanvasSessionMeta = Omit<
  CanvasSessionClaims,
  "version" | "expiresAt" | "nonce"
>;

export function createCanvasSocketRoom(
  sql: TLSyncSqliteWrapper,
): TLSocketRoom<TLRecord, CanvasSessionMeta> {
  return new TLSocketRoom<TLRecord, CanvasSessionMeta>({
    schema: createTLSchema(),
    storage: new SQLiteSyncStorage<TLRecord>({ sql }),
  });
}

export function connectCanvasSession(
  room: TLSocketRoom<TLRecord, CanvasSessionMeta>,
  input: {
    sessionId: string;
    socket: WebSocketMinimal;
    claims: CanvasSessionClaims;
  },
): void {
  const { claims } = input;
  room.handleSocketConnect({
    sessionId: input.sessionId,
    socket: input.socket,
    isReadonly: claims.access === "view",
    meta: {
      workspaceId: claims.workspaceId,
      roomId: claims.roomId,
      userId: claims.userId,
      userName: claims.userName,
      access: claims.access,
      clientVersion: claims.clientVersion,
    },
  });
}
