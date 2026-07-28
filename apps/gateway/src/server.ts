import websocket from "@fastify/websocket";
import { MAX_WS_FRAME_BYTES } from "@meld/contracts";
import Fastify from "fastify";
import type { RawData } from "ws";
import {
  authenticateDevice,
  DeviceAuthenticationError,
  type AuthenticatedDeviceIdentity,
} from "./auth/device-auth";
import type { GatewayConfig } from "./config";
import type { TaskRepository } from "./tasks/task-repository";
import {
  DeviceSession,
  DeviceSessionRegistry,
} from "./ws/device-session";

declare module "fastify" {
  interface FastifyRequest {
    authenticatedDevice?: AuthenticatedDeviceIdentity;
  }
}

interface BuildServerOptions {
  config: GatewayConfig;
  repository: TaskRepository;
  registry: DeviceSessionRegistry;
  onMessage(
    session: DeviceSession,
    data: RawData,
  ): void | Promise<void>;
  onConnect(deviceId: string): void | Promise<void>;
}

export async function buildServer({
  config,
  repository,
  registry,
  onMessage,
  onConnect,
}: BuildServerOptions) {
  const server = Fastify({ logger: true });
  server.decorateRequest("authenticatedDevice");

  await server.register(websocket, {
    options: { maxPayload: MAX_WS_FRAME_BYTES },
  });

  server.get("/health", async () => ({ status: "ok" }));

  server.get(
    "/ws",
    {
      websocket: true,
      async preValidation(request, reply) {
        try {
          request.authenticatedDevice = await authenticateDevice(
            request.headers.authorization,
            repository,
          );
        } catch (error) {
          if (!(error instanceof DeviceAuthenticationError)) {
            throw error;
          }
          await reply.code(401).send({ error: "Unauthorized" });
        }
      },
    },
    async (socket, request) => {
      const device = request.authenticatedDevice;
      if (!device) {
        socket.close(1008, "Unauthenticated session");
        return;
      }

      const session = new DeviceSession(device, socket);
      socket.binaryType = "arraybuffer";
      registry.add(session);
      socket.once("close", () => {
        registry.remove(session);
      });
      socket.on("message", (data) => {
        void Promise.resolve(onMessage(session, data)).catch((error) => {
          server.log.error(
            { err: error },
            "Device message handler failed",
          );
          session.close(1011, "Device message handler failed");
        });
      });

      session.send({
        type: "session.accepted",
        heartbeatSeconds: config.heartbeatSeconds,
      });

      try {
        await onConnect(device.id);
      } catch (error) {
        server.log.error(
          { err: error },
          "Device connection handler failed",
        );
        session.close(1011, "Device connection handler failed");
      }
    },
  );

  return server;
}
