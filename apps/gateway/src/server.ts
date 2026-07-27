import Fastify from "fastify";

export function buildServer() {
  const server = Fastify({ logger: true });
  server.get("/health", async () => ({ status: "ok" }));
  return server;
}
