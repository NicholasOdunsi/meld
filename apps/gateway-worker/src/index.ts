import { authenticateDevice, createTaskRepository, DeviceAuthenticationError } from "@meld/gateway/core";
import { createSupabase, type Env } from "./env";
import { CANVAS_HEADER, DEVICE_HEADER, route } from "./router";

export { DeviceHub } from "./device-hub";
export { CanvasRoom } from "./canvas-room";

function withHeader(request: Request, name: string, value: unknown): Request {
  const headers = new Headers(request.headers);
  headers.set(name, JSON.stringify(value));
  return new Request(request, { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const repository = createTaskRepository(createSupabase(env));
    return route(request, {
      canvasSecret: env.MELD_CANVAS_SESSION_SECRET,
      async authenticate(authorization) {
        try {
          return await authenticateDevice(authorization ?? undefined, repository);
        } catch (error) {
          if (error instanceof DeviceAuthenticationError) return null;
          throw error;
        }
      },
      forwardToHub: (req, device) =>
        env.DEVICE_HUB.get(env.DEVICE_HUB.idFromName("hub")).fetch(withHeader(req, DEVICE_HEADER, device)),
      forwardToCanvas: (req, connect) =>
        env.CANVAS_ROOM.get(env.CANVAS_ROOM.idFromName(`${connect.claims.workspaceId}:${connect.claims.roomId}`))
          .fetch(withHeader(req, CANVAS_HEADER, connect)),
    });
  },

  // Daily keep-alive so the free Supabase project never pauses for inactivity.
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await createTaskRepository(createSupabase(env)).getAiTaskLeaseSeconds();
  },
} satisfies ExportedHandler<Env>;
