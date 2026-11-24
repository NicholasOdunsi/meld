import { once } from "node:events";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { EngineClient } from "./engine-client";

type RecordedFrame = Record<string, unknown> & { _tag?: string; requestId?: number; tag?: string };
function frames(name: string): RecordedFrame[] {
  return readFileSync(new URL(`./fixtures/${name}.jsonl`, import.meta.url), "utf8").trim().split("\n")
    .map((line) => JSON.parse(line).frame);
}

const closeHandlers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(closeHandlers.splice(0).map((close) => close()));
});

async function harness(receive: (frame: RecordedFrame, socket: WebSocket) => void, expired = false) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const requests: RecordedFrame[] = [];
  const connections: URL[] = [];
  const port = (server.address() as AddressInfo).port;
  server.on("connection", (socket, request) => {
    connections.push(new URL(request.url!, `ws://127.0.0.1:${port}`));
    socket.on("message", (raw) => {
      const frame = JSON.parse(raw.toString()) as RecordedFrame;
      requests.push(frame);
      receive(frame, socket);
    });
  });
  const handle = { url: `http://127.0.0.1:${port}`, port, pid: 1, sessionToken: "session" };
  const getHandle = vi.fn(async () => handle);
  const refreshSession = vi.fn(async () => ({ ...handle, sessionToken: "renewed" }));
  const ticket = vi.fn<typeof fetch>().mockImplementation(async (_, init) => {
    if (expired && new Headers(init?.headers).get("authorization") === "Bearer session") return new Response(null, { status: 401 });
    return Response.json({ ticket: "ticket" });
  });
  const client = new EngineClient({ getHandle, refreshSession, fetch: ticket });
  closeHandlers.push(async () => {
    client.close();
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { client, requests, connections, ticket, refreshSession };
}

describe("EngineClient", () => {
  it("mints a scoped socket ticket and ignores an exit with a different request ID", async () => {
    const fixture = frames("build-turn");
    const request = fixture.find((frame) => frame.tag === "projects.mutate")!;
    const response = fixture.find((frame) => frame._tag === "Exit" && frame.requestId === request.id)!;
    const { client, requests, connections, ticket } = await harness((frame, socket) => {
      socket.send(JSON.stringify({ ...response, requestId: Number(frame.id) + 10, exit: { _tag: "Success", value: "wrong" } }));
      socket.send(JSON.stringify({ ...response, requestId: frame.id }));
    });
    const output = await client.linkFolder(request.payload as Parameters<EngineClient["linkFolder"]>[0]);
    expect(output).toEqual((response.exit as { value: unknown }).value);
    expect(requests[0]).toMatchObject({ _tag: "Request", tag: request.tag, payload: request.payload });
    expect(ticket).toHaveBeenCalledWith(expect.stringMatching(/\/api\/auth\/websocket-ticket$/), expect.objectContaining({
      method: "POST", body: "{}", headers: { Authorization: "Bearer session", "Content-Type": "application/json" },
    }));
    expect(connections[0]?.searchParams.get("wsTicket")).toBe("ticket");
    expect(connections[0]?.searchParams.get("orchestrationProtocol")).toBe("2");
  });

  it("consumes a recorded chunk, acknowledges it and interrupts on return", async () => {
    const fixture = frames("build-turn");
    const chunk = fixture.find((frame) => frame._tag === "Chunk")!;
    const { client, requests } = await harness((frame, socket) => {
      if (frame._tag === "Request") socket.send(JSON.stringify({ ...chunk, requestId: frame.id }));
      if (frame._tag === "Ack") socket.send(JSON.stringify({ ...chunk, requestId: frame.requestId }));
    });
    const stream = client.subscribeThread("thread", 4);
    const values = chunk.values as unknown[];
    for (const value of values) expect((await stream.next()).value).toEqual(value);
    expect((await stream.next()).value).toEqual(values[0]);
    await stream.return(undefined);
    await vi.waitFor(() => expect(requests.at(-1)).toMatchObject({ _tag: "Interrupt", requestId: requests[0]?.id }));
    expect(requests[0]?.payload).toEqual({ threadId: "thread", afterSequence: 4 });
    expect(requests[1]).toMatchObject({ _tag: "Ack", requestId: requests[0]?.id });
  });

  it("renews an expired session and does not expose a malformed frame", async () => {
    const { client, refreshSession, ticket } = await harness((_, socket) => socket.send("secret-invalid-frame"), true);
    await expect(client.probe()).rejects.toThrow("invalid RPC frame");
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(ticket).toHaveBeenCalledTimes(2);
  });

  it("reconnects after a disconnect without retrying the interrupted request", async () => {
    let received = 0;
    const { client, connections } = await harness((frame, socket) => {
      if (++received === 1) socket.close();
      else socket.send(JSON.stringify({ _tag: "Exit", requestId: frame.id, exit: { _tag: "Success", value: {} } }));
    });
    await expect(client.probe()).rejects.toThrow("Disconnected");
    await expect(client.probe()).resolves.toEqual({});
    expect(connections).toHaveLength(2);
  });

  it("always starts a supervised worktree and publishes privately", async () => {
    const { client, requests } = await harness((frame, socket) => {
      socket.send(JSON.stringify({ _tag: "Exit", requestId: frame.id, exit: { _tag: "Success", value: {} } }));
    });
    await client.startBuild({
      branch: "orion/demo", baseRef: "main", commandId: "command", threadId: "thread",
      projectId: "project", title: "Demo", modelSelection: { instanceId: "claudeAgent", model: "haiku" }, prompt: "Edit README",
    });
    await client.createRepo({ cwd: "/tmp/orion", repository: "orion-test" });
    expect(requests[0]?.payload).toMatchObject({
      runtimeMode: "approval-required", workspaceStrategy: { type: "worktree", branch: "orion/demo", baseRef: "main" },
    });
    expect(requests[1]?.payload).toMatchObject({ provider: "github", visibility: "private" });
  });
});
