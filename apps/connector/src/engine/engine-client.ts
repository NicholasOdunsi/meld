import { randomBytes } from "node:crypto";
import WebSocket from "ws";
import { z } from "zod";
import type { EngineHandle } from "./engine-process";

const MAX_PENDING = 32;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const PING_INTERVAL_MS = 5_000;
const SILENCE_LIMIT_MS = 15_000;

type EngineSocket = Pick<WebSocket, "readyState" | "addEventListener" | "removeEventListener" | "send" | "close">;

type ClientDeps = {
  getHandle(): Promise<EngineHandle>;
  refreshSession(handle: EngineHandle): Promise<EngineHandle>;
  fetch?: typeof fetch;
  createSocket?(url: string): EngineSocket;
};

const ExitSchema = z.discriminatedUnion("_tag", [
  z.object({ _tag: z.literal("Success"), value: z.unknown().optional() }),
  z.object({ _tag: z.literal("Failure"), cause: z.unknown() }),
]);

const FrameSchema = z.discriminatedUnion("_tag", [
  z.object({ _tag: z.literal("Pong") }),
  z.object({ _tag: z.literal("Exit"), requestId: z.number().int().nonnegative(), exit: ExitSchema }),
  z.object({ _tag: z.literal("Chunk"), requestId: z.number().int().nonnegative(), values: z.array(z.unknown()).max(1_024) }),
]);

type Exit = z.infer<typeof ExitSchema>;
type Pending = {
  exit(result: Exit): void;
  fail(error: Error): void;
  chunk?(values: unknown[]): void;
};

class EngineConnection {
  private readonly pending = new Map<number, Pending>();
  private nextId = 0;
  private closed = false;
  private lastFrame = Date.now();
  private readonly heartbeat: ReturnType<typeof setInterval>;

  constructor(private readonly socket: EngineSocket) {
    socket.addEventListener("message", this.onMessage);
    socket.addEventListener("close", this.onClose);
    socket.addEventListener("error", this.onClose);
    this.heartbeat = setInterval(() => {
      if (Date.now() - this.lastFrame >= SILENCE_LIMIT_MS) this.close();
      else this.send({ _tag: "Ping" });
    }, PING_INTERVAL_MS);
    this.heartbeat.unref();
  }

  get usable(): boolean {
    return !this.closed && this.socket.readyState === WebSocket.OPEN;
  }

  close(error = new Error("Disconnected from the build engine.")): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    this.socket.removeEventListener("message", this.onMessage);
    this.socket.removeEventListener("close", this.onClose);
    this.socket.removeEventListener("error", this.onClose);
    for (const operation of this.pending.values()) operation.fail(error);
    this.pending.clear();
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close();
  }

  request(method: string, payload: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.reserveRequest();
      const timer = setTimeout(() => {
        this.interrupt(id);
        reject(new Error("The build engine request timed out."));
      }, REQUEST_TIMEOUT_MS);
      timer.unref();
      this.dispatch(id, method, payload, {
        exit: (result) => {
          clearTimeout(timer);
          if (result._tag === "Success") resolve(result.value);
          else reject(new Error("The build engine rejected the request."));
        },
        fail: (error) => { clearTimeout(timer); reject(error); },
      });
    });
  }

  async *stream(method: string, payload: unknown, signal?: AbortSignal): AsyncGenerator<unknown> {
    signal?.throwIfAborted();
    const id = this.reserveRequest();
    let chunk: unknown[] | undefined;
    let finished = false;
    let failure: Error | undefined;
    let wake: (() => void) | undefined;
    const notify = () => { wake?.(); wake = undefined; };
    const onAbort = () => {
      failure = new Error("The build engine subscription was cancelled.");
      notify();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      this.dispatch(id, method, payload, {
        exit: (result) => {
          if (result._tag === "Failure") failure = new Error("The build engine rejected the subscription.");
          finished = true;
          notify();
        },
        fail: (error) => { failure = error; notify(); },
        chunk: (values) => {
          if (chunk) {
            this.close(new Error("The build engine sent an unexpected stream chunk."));
            return;
          }
          chunk = values;
          notify();
        },
      });
      while (true) {
        if (failure) throw failure;
        if (chunk) {
          for (const value of chunk) {
            if (failure) throw failure;
            yield value;
          }
          chunk = undefined;
          if (!finished) this.send({ _tag: "Ack", requestId: id });
        } else if (finished) {
          return;
        } else {
          await new Promise<void>((resolve) => { wake = resolve; });
        }
      }
    } finally {
      signal?.removeEventListener("abort", onAbort);
      this.interrupt(id);
    }
  }

  private reserveRequest(): number {
    if (!this.usable || this.pending.size >= MAX_PENDING) {
      throw new Error("The build engine connection is unavailable or busy.");
    }
    return this.nextId++;
  }

  private dispatch(id: number, method: string, payload: unknown, operation: Pending): void {
    this.pending.set(id, operation);
    this.send({
      _tag: "Request", id, tag: method, payload,
      traceId: randomBytes(16).toString("hex"),
      spanId: randomBytes(8).toString("hex"),
      sampled: true, headers: [],
    });
  }

  private interrupt(id: number): void {
    if (this.pending.delete(id)) this.send({ _tag: "Interrupt", requestId: id });
  }

  private send(message: unknown): void {
    try {
      if (!this.usable) throw new Error();
      this.socket.send(JSON.stringify(message));
    } catch {
      this.close();
    }
  }

  private readonly onClose = () => this.close();

  private readonly onMessage = ({ data }: { data: unknown }): void => {
    try {
      const text = typeof data === "string" ? data : Buffer.isBuffer(data) ? data.toString("utf8") : "";
      if (Buffer.byteLength(text) > MAX_FRAME_BYTES) throw new Error();
      const frame = FrameSchema.parse(JSON.parse(text));
      this.lastFrame = Date.now();
      if (frame._tag === "Pong") return;
      const operation = this.pending.get(frame.requestId);
      if (!operation) return;
      if (frame._tag === "Exit") {
        this.pending.delete(frame.requestId);
        operation.exit(frame.exit);
      } else if (operation.chunk) {
        operation.chunk(frame.values);
      } else {
        throw new Error();
      }
    } catch {
      this.close(new Error("The build engine sent an invalid RPC frame."));
    }
  };
}

function waitForOpen(socket: EngineSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = (opened: boolean) => {
      clearTimeout(timer);
      socket.removeEventListener("open", open);
      socket.removeEventListener("error", failed);
      socket.removeEventListener("close", failed);
      if (opened) resolve();
      else reject(new Error("Could not connect to the build engine."));
    };
    const open = () => done(true);
    const failed = () => done(false);
    const timer = setTimeout(() => {
      failed();
      try { socket.close(); } catch { /* The socket is already closed. */ }
    }, 5_000);
    timer.unref();
    socket.addEventListener("open", open);
    socket.addEventListener("error", failed);
    socket.addEventListener("close", failed);
  });
}

export type BuildModel = { instanceId: "claudeAgent" | "codex"; model: string };
export type StartBuild = {
  commandId: string;
  threadId: string;
  projectId: string;
  title: string;
  branch: string;
  baseRef: string;
  modelSelection: BuildModel;
  prompt: string;
};

export class EngineClient {
  private connection: EngineConnection | undefined;
  private connecting: Promise<EngineConnection> | undefined;
  private closed = false;

  constructor(private readonly deps: ClientDeps) {}

  close(): void {
    this.closed = true;
    this.connection?.close();
  }

  probe(): Promise<unknown> {
    return this.request("server.probe", {});
  }

  linkFolder(input: { commandId: string; projectId: string; title: string; workspaceRoot: string }) {
    return this.request("projects.mutate", { ...input, type: "project.create" });
  }

  cloneRepo(input: { projectId: string; title: string; createdAt: string; repository: string; destinationPath: string }) {
    return this.request("projectClone.start", { ...input, provider: "github", protocol: "https" });
  }

  subscribeClones(signal?: AbortSignal) {
    return this.stream("subscribeProjectClones", {}, signal);
  }

  createRepo(input: { cwd: string; repository: string }) {
    return this.request("sourceControl.publishRepository", { ...input, provider: "github", visibility: "private" });
  }

  startBuild({ branch, baseRef, prompt, ...input }: StartBuild) {
    return this.request("orchestration.launchThread", {
      ...input,
      generateTitle: false,
      runtimeMode: "approval-required",
      interactionMode: "default",
      workspaceStrategy: { type: "worktree", baseRef, branch },
      initialMessage: { messageId: input.commandId, text: prompt, attachments: [] },
    });
  }

  continueBuild(input: { commandId: string; threadId: string; messageId: string; text: string }) {
    return this.request("orchestration.dispatchCommand", {
      ...input, type: "message.dispatch", createdBy: "user", creationSource: "web",
      attachments: [], dispatchMode: { type: "queue_after_active" },
    });
  }

  answerApproval(input: { commandId: string; threadId: string; requestId: string; decision: "accept" | "decline" }) {
    return this.request("orchestration.dispatchCommand", { ...input, type: "runtime-request.respond" });
  }

  interruptBuild(input: { commandId: string; threadId: string; runId: string }) {
    return this.request("orchestration.dispatchCommand", { ...input, type: "run.interrupt", reason: "Stopped from Orion" });
  }

  subscribeThread(threadId: string, afterSequence?: number, signal?: AbortSignal) {
    return this.stream("orchestration.subscribeThread", { threadId, afterSequence }, signal);
  }

  getThreadProjection(threadId: string) {
    return this.request("orchestration.getThreadProjection", { threadId });
  }

  async getTurnDiff(threadId: string, fromTurnCount: number, toTurnCount: number): Promise<string> {
    const output = await this.request("orchestration.getTurnDiff", { threadId, fromTurnCount, toTurnCount });
    const result = z.object({ diff: z.string() }).safeParse(output);
    if (!result.success) throw new Error("The build engine returned an invalid turn diff.");
    return result.data.diff;
  }

  private async request(method: string, payload: unknown): Promise<unknown> {
    return (await this.connect()).request(method, payload);
  }

  private async *stream(method: string, payload: unknown, signal?: AbortSignal): AsyncGenerator<unknown> {
    signal?.throwIfAborted();
    yield* (await this.connect()).stream(method, payload, signal);
  }

  private connect(): Promise<EngineConnection> {
    if (this.closed) return Promise.reject(new Error("The build engine client is closed."));
    if (this.connection?.usable) return Promise.resolve(this.connection);
    this.connecting ??= this.open().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }

  private async open(): Promise<EngineConnection> {
    let handle = await this.deps.getHandle();
    let ticket = await this.ticket(handle);
    if (!ticket) {
      handle = await this.deps.refreshSession(handle);
      ticket = await this.ticket(handle);
    }
    if (!ticket || this.closed) throw new Error("Could not open a build engine session.");
    const endpoint = new URL("/ws", handle.url);
    endpoint.protocol = "ws:";
    endpoint.search = new URLSearchParams({
      wsTicket: ticket, orchestrationProtocol: "2", clientCapabilities: "settingsSecretReferences",
    }).toString();
    const socket = this.deps.createSocket?.(endpoint.href) ?? this.createSocket(endpoint);
    await waitForOpen(socket);
    const connection = new EngineConnection(socket);
    if (this.closed) {
      connection.close();
      throw new Error("The build engine client is closed.");
    }
    this.connection = connection;
    return connection;
  }

  private createSocket(endpoint: URL): WebSocket {
    const socket = new WebSocket(endpoint, { maxPayload: MAX_FRAME_BYTES, followRedirects: false, handshakeTimeout: 5_000 });
    // Node's WebSocket can emit an error after close or an aborted handshake.
    socket.on("error", () => {});
    return socket;
  }

  private async ticket(handle: EngineHandle): Promise<string | null> {
    const endpoint = `http://127.0.0.1:${handle.port}`;
    if (handle.url !== endpoint) throw new Error("The build engine address is invalid.");
    try {
      const response = await (this.deps.fetch ?? fetch)(`${endpoint}/api/auth/websocket-ticket`, {
        method: "POST",
        headers: { Authorization: `Bearer ${handle.sessionToken}`, "Content-Type": "application/json" },
        body: "{}",
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status === 401 || response.status === 403) return null;
      if (response.ok) {
        const result = z.object({ ticket: z.string().min(1).max(4_096) }).safeParse(await response.json());
        if (result.success) return result.data.ticket;
      }
    } catch {
      // Never include the request or token in a diagnostic.
    }
    throw new Error("The build engine did not issue a WebSocket ticket.");
  }
}
