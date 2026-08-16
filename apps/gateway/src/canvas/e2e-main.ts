import { rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import {
  TLDRAW_TRIAL_VERSION,
  mintCanvasSessionTicket,
} from "@meld/device-auth";
import { createTLSchema } from "@tldraw/tlschema";
import { CanvasRoomManager } from "./canvas-room-manager";
import { registerCanvasRoutes } from "./register-canvas-routes";

export const CANVAS_E2E_WORKSPACE_ID =
  "00000000-0000-4000-8000-000000000001";
export const CANVAS_E2E_ROOM_ID =
  "40000000-0000-4000-8000-000000000001";
export const CANVAS_E2E_SECRET =
  "canvas-trial-e2e-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
export const CANVAS_E2E_SCHEMA = createTLSchema().serialize();
export const CANVAS_E2E_PROTOCOL_VERSION = 8;
export const CANVAS_E2E_TLDRAW_VERSION = TLDRAW_TRIAL_VERSION;

interface TrialLease {
  key: string;
  release(): Promise<void>;
}

/**
 * The browser harness deliberately avoids a hosted database. This lock has
 * the same single-process semantics as the production factory and makes a
 * duplicate room owner fail closed during the trial run.
 */
function createInMemoryAuthority() {
  const held = new Set<string>();
  return {
    async acquire(
      workspaceId: string,
      roomId: string,
    ): Promise<TrialLease | null> {
      const key = `${workspaceId}:${roomId}`;
      if (held.has(key)) return null;
      held.add(key);
      let released = false;
      return {
        key,
        async release() {
          if (released) return;
          released = true;
          held.delete(key);
        },
      };
    },
  };
}

export interface CanvasTrialGateway {
  baseUrl: string;
  dataDir: string;
  secret: string;
  manager: CanvasRoomManager;
  close(): Promise<void>;
}

export async function startCanvasTrialGateway(input: {
  port?: number;
  dataDir?: string;
  secret?: string;
} = {}): Promise<CanvasTrialGateway> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Canvas trial harness refuses NODE_ENV=production");
  }
  const secret = input.secret ?? process.env.MELD_CANVAS_SESSION_SECRET;
  const testSecretAllowed =
    process.env.MELD_CANVAS_E2E_ALLOW_TEST_SECRET === "true";
  if (!secret && !testSecretAllowed) {
    throw new Error(
      "Canvas trial harness requires MELD_CANVAS_SESSION_SECRET or MELD_CANVAS_E2E_ALLOW_TEST_SECRET=true",
    );
  }
  const resolvedSecret = secret ?? CANVAS_E2E_SECRET;
  if (Buffer.byteLength(resolvedSecret, "utf8") < 32) {
    throw new Error("Canvas trial harness secret must be at least 32 bytes");
  }
  const dataDir = input.dataDir ?? mkdtempSync(join(tmpdir(), "meld-canvas-trial-"));
  const manager = new CanvasRoomManager({
    dataDir,
    authority: createInMemoryAuthority(),
    idleEvictionMs: 60_000,
  });
  const server = Fastify({ logger: false });
  await server.register(websocket, { options: { maxPayload: 2 * 1024 * 1024 } });
  await registerCanvasRoutes(server, {
    enabled: true,
    sessionSecret: resolvedSecret,
    roomManager: manager,
  });
  server.get("/health", async () => ({ status: "ok", tldraw: TLDRAW_TRIAL_VERSION }));
  const baseUrl = await server.listen({
    host: "127.0.0.1",
    port: input.port ?? 0,
  });

  let closed = false;
  return {
    baseUrl,
    dataDir,
    secret: resolvedSecret,
    manager,
    async close() {
      if (closed) return;
      closed = true;
      manager.beginShutdown();
      await manager.closeAll();
      await server.close();
      if (!input.dataDir) rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

if (process.argv[1]?.endsWith("e2e-main.ts")) {
  const port = Number(process.env.MELD_CANVAS_E2E_PORT ?? 18787);
  const dataDir = process.env.MELD_CANVAS_DATA_DIR;
  void startCanvasTrialGateway({ port, dataDir }).then((runtime) => {
    process.stdout.write(`${runtime.baseUrl}\n`);
    const stop = async () => {
      await runtime.close();
      process.exit(0);
    };
    process.once("SIGINT", () => void stop());
    process.once("SIGTERM", () => void stop());
  });
}

export function mintCanvasE2ETicket(input: {
  userId: string;
  userName: string;
  access: "edit" | "view";
  workspaceId?: string;
  roomId?: string;
}): string {
  return mintCanvasSessionTicket(
    {
      workspaceId: input.workspaceId ?? CANVAS_E2E_WORKSPACE_ID,
      roomId: input.roomId ?? CANVAS_E2E_ROOM_ID,
      userId: input.userId,
      userName: input.userName,
      access: input.access,
    },
    CANVAS_E2E_SECRET,
  );
}
