import { DurableObject } from "cloudflare:workers";
import { DurableObjectSqliteSyncWrapper, type TLSocketRoom } from "@tldraw/sync-core";
import type { TLRecord } from "@tldraw/tlschema";
import { connectCanvasSession, createCanvasSocketRoom, type CanvasSessionMeta } from "./canvas-room-core";
import type { Env } from "./env";
import { CANVAS_HEADER, type CanvasConnect } from "./router";

export class CanvasRoom extends DurableObject<Env> {
  private room: TLSocketRoom<TLRecord, CanvasSessionMeta> | undefined;

  async fetch(request: Request): Promise<Response> {
    const connect = JSON.parse(request.headers.get(CANVAS_HEADER) ?? "null") as CanvasConnect | null;
    if (!connect) return new Response("Bad Request", { status: 400 });
    this.room ??= createCanvasSocketRoom(new DurableObjectSqliteSyncWrapper(this.ctx.storage));
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept(); // not hibernatable: TLSocketRoom keeps sessions in memory
    connectCanvasSession(this.room, { sessionId: connect.sessionId, socket: server, claims: connect.claims });
    return new Response(null, { status: 101, webSocket: client });
  }
}
