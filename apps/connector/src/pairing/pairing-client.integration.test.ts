import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DeviceToServerMessageSchema,
  ServerToDeviceMessageSchema,
  type ServerToDeviceMessage,
} from "@meld/contracts";
import {
  hashToken,
  normalizePairingCode,
} from "@meld/device-auth";
import postgres from "postgres";
import { WebSocket, type RawData } from "ws";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { GatewayClient } from "../transport/gateway-client";
import { MemoryCredentialStore } from "./credential-store";
import { PairingClient } from "./pairing-client";

const USER_ID = "c1000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "c2000000-0000-4000-8000-000000000001";
const ROOM_ID = "c3000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "c4000000-0000-4000-8000-000000000001";
const MESSAGE_CLIENT_ID = "c4100000-0000-4000-8000-000000000001";
const TASK_ID = "c5000000-0000-4000-8000-000000000001";
const PAIRING_CODE = "MELD-E2E-PAIRING-CODE";
const WAIT_TIMEOUT_MS = 30_000;
const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const WEB_TSCONFIG_PATH = resolve(
  REPOSITORY_ROOT,
  "apps/web/tsconfig.json",
);

interface OwnedProcess {
  child: ChildProcess;
  command: string;
  output(): string;
}

interface SocketObservation {
  messages: ServerToDeviceMessage[];
  closes: Array<{ code: number; reason: string }>;
}

const ownedProcesses: OwnedProcess[] = [];
let databaseClient: ReturnType<typeof postgres> | undefined;
let originalWebTsconfig: string | undefined;
let webBaseUrl: string;
let gatewayUrl: string;

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for connector integration tests`);
  }
  return value;
}

function database() {
  if (!databaseClient) {
    databaseClient = postgres(
      requiredEnvironment("SUPABASE_DB_URL"),
      { max: 1 },
    );
  }
  return databaseClient;
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((fulfill, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", fulfill);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to allocate connector integration port");
  }
  await new Promise<void>((fulfill, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        fulfill();
      }
    });
  });
  return address.port;
}

function startOwnedProcess(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
): OwnedProcess {
  const child = spawn(command, args, {
    cwd: REPOSITORY_ROOT,
    env: { ...process.env, ...environment },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let processOutput = "";
  const recordOutput = (data: Buffer): void => {
    processOutput = `${processOutput}${data.toString("utf8")}`.slice(
      -20_000,
    );
  };
  child.stdout?.on("data", recordOutput);
  child.stderr?.on("data", recordOutput);

  const owned = {
    child,
    command: [command, ...args].join(" "),
    output: () => processOutput,
  };
  ownedProcesses.push(owned);
  return owned;
}

async function stopOwnedProcess(owned: OwnedProcess): Promise<void> {
  if (owned.child.exitCode !== null || owned.child.signalCode !== null) {
    return;
  }

  const exited = new Promise<void>((fulfill) => {
    owned.child.once("exit", () => fulfill());
  });
  const pid = owned.child.pid;
  if (pid !== undefined) {
    if (process.platform === "win32") {
      owned.child.kill("SIGTERM");
    } else {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        owned.child.kill("SIGTERM");
      }
    }
  }

  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise<false>((fulfill) => {
      setTimeout(() => fulfill(false), 5_000);
    }),
  ]);
  if (!stopped && pid !== undefined) {
    if (process.platform === "win32") {
      owned.child.kill("SIGKILL");
    } else {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        owned.child.kill("SIGKILL");
      }
    }
    await exited;
  }
}

async function waitUntil<T>(
  description: string,
  read: () => T | undefined | Promise<T | undefined>,
  timeoutMs = WAIT_TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) {
      return value;
    }
    await new Promise((fulfill) => setTimeout(fulfill, 50));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function waitForHttp(
  url: string,
  process: OwnedProcess,
): Promise<void> {
  await waitUntil(`HTTP service ${url}`, async () => {
    if (
      process.child.exitCode !== null ||
      process.child.signalCode !== null
    ) {
      throw new Error(
        `${process.command} exited before becoming ready:\n${process.output()}`,
      );
    }
    try {
      const response = await fetch(url);
      return response.status < 500 ? true : undefined;
    } catch {
      return undefined;
    }
  });
}

function localPublishableKey(): string {
  const configured =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (configured) {
    return configured;
  }

  const status = execFileSync(
    "supabase",
    ["status", "-o", "env"],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
    },
  );
  const match = status.match(
    /^(?:PUBLISHABLE_KEY|ANON_KEY)="?([^"\n]+)"?$/m,
  );
  if (!match?.[1]) {
    throw new Error(
      "Supabase status did not report a local publishable key",
    );
  }
  return match[1];
}

async function resetFixture(): Promise<void> {
  const sql = database();
  await sql.begin(async (transaction) => {
    await transaction`
      delete from public.organizations
      where id = ${ORGANIZATION_ID}
    `;
    await transaction`
      delete from auth.users
      where id = ${USER_ID}
    `;
    await transaction`
      insert into auth.users (
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      )
      values (
        ${USER_ID},
        'authenticated',
        'authenticated',
        'connector-integration@example.com',
        '',
        now(),
        ${transaction.json({
          provider: "email",
          providers: ["email"],
        })},
        ${transaction.json({ display_name: "Connector Fixture" })},
        now(),
        now()
      )
    `;
    await transaction`
      insert into public.organizations (id, name, created_by)
      values (
        ${ORGANIZATION_ID},
        'Connector Integration',
        ${USER_ID}
      )
    `;
    await transaction`
      insert into public.discovery_rooms (
        id,
        organization_id,
        name,
        owner_id
      )
      values (
        ${ROOM_ID},
        ${ORGANIZATION_ID},
        'Connector pairing room',
        ${USER_ID}
      )
    `;
    await transaction`
      insert into public.messages (
        id,
        room_id,
        client_id,
        author_id,
        body
      )
      values (
        ${MESSAGE_ID},
        ${ROOM_ID},
        ${MESSAGE_CLIENT_ID},
        ${USER_ID},
        'Run the connector integration stub.'
      )
    `;
    await transaction`
      select set_config(
        'request.jwt.claim.sub',
        ${USER_ID},
        true
      )
    `;
    await transaction.unsafe("set local role authenticated");
    await transaction`
      select public.create_device_pairing_code(
        ${hashToken(normalizePairingCode(PAIRING_CODE))},
        'codex'
      )
    `;
  });
}

async function createReadyTask(deviceId: string): Promise<void> {
  const sql = database();
  await sql`
    insert into public.ai_tasks (
      id,
      initiating_user_id,
      organization_id,
      room_id,
      device_id,
      provider,
      kind,
      status,
      instruction,
      context_manifest_json,
      context_revision
    )
    values (
      ${TASK_ID},
      ${USER_ID},
      ${ORGANIZATION_ID},
      ${ROOM_ID},
      ${deviceId},
      'codex',
      'room_reply',
      'ready_to_run',
      'Complete the live connector stub run.',
      ${sql.json({
        messageIds: [MESSAGE_ID],
        attachmentIds: [],
        evidenceIds: [],
        decisionIds: [],
      })},
      0
    )
  `;
}

async function readTask() {
  const rows = await database()<
    {
      status: string;
      result_json: unknown;
    }[]
  >`
    select status, result_json
    from public.ai_tasks
    where id = ${TASK_ID}
  `;
  return rows[0];
}

async function revokeDevice(deviceId: string): Promise<void> {
  await database().begin(async (transaction) => {
    await transaction`
      select set_config(
        'request.jwt.claim.sub',
        ${USER_ID},
        true
      )
    `;
    await transaction.unsafe("set local role authenticated");
    await transaction`
      select public.revoke_execution_device(${deviceId}::uuid)
    `;
  });
}

function observeSocket(socket: WebSocket): SocketObservation {
  const observation: SocketObservation = {
    messages: [],
    closes: [],
  };
  socket.on("message", (data: RawData) => {
    const raw = Buffer.isBuffer(data)
      ? data.toString("utf8")
      : Buffer.from(data as ArrayBuffer).toString("utf8");
    observation.messages.push(
      ServerToDeviceMessageSchema.parse(JSON.parse(raw) as unknown),
    );
  });
  socket.on("close", (code, reason) => {
    observation.closes.push({
      code,
      reason: reason.toString("utf8"),
    });
  });
  return observation;
}

beforeAll(async () => {
  await resetFixture();
  originalWebTsconfig = await readFile(WEB_TSCONFIG_PATH, "utf8");
  const webPort = await availablePort();
  const gatewayPort = await availablePort();
  const supabaseUrl = requiredEnvironment("GATEWAY_SUPABASE_URL");

  webBaseUrl = `http://127.0.0.1:${webPort}`;
  gatewayUrl = `ws://127.0.0.1:${gatewayPort}/ws`;

  const web = startOwnedProcess(
    "pnpm",
    [
      "--filter",
      "@meld/web",
      "exec",
      "next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(webPort),
    ],
    {
      NEXT_PUBLIC_APP_URL: webBaseUrl,
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localPublishableKey(),
    },
  );
  await waitForHttp(webBaseUrl, web);

  const gateway = startOwnedProcess(
    "pnpm",
    [
      "--filter",
      "@meld/gateway",
      "exec",
      "tsx",
      "src/main.ts",
    ],
    {
      GATEWAY_HOST: "127.0.0.1",
      GATEWAY_PORT: String(gatewayPort),
      GATEWAY_SUPABASE_URL: supabaseUrl,
      GATEWAY_SUPABASE_SERVICE_ROLE_KEY: requiredEnvironment(
        "GATEWAY_SUPABASE_SERVICE_ROLE_KEY",
      ),
      GATEWAY_POLL_INTERVAL_MS: "100",
      GATEWAY_HEARTBEAT_SECONDS: "5",
    },
  );
  await waitForHttp(
    `http://127.0.0.1:${gatewayPort}/health`,
    gateway,
  );
});

afterAll(async () => {
  for (const owned of ownedProcesses.splice(0).reverse()) {
    await stopOwnedProcess(owned);
  }
  if (originalWebTsconfig !== undefined) {
    await writeFile(
      WEB_TSCONFIG_PATH,
      originalWebTsconfig,
      "utf8",
    );
    originalWebTsconfig = undefined;
  }
  if (databaseClient) {
    const sql = databaseClient;
    databaseClient = undefined;
    try {
      await sql`
        delete from public.organizations
        where id = ${ORGANIZATION_ID}
      `;
      await sql`
        delete from auth.users
        where id = ${USER_ID}
      `;
    } finally {
      await sql.end();
    }
  }
});

describe("connector pairing through the live web and gateway stack", () => {
  it("pairs, completes a stub task, and closes after revocation", async () => {
    const credentialStore = new MemoryCredentialStore();
    const pairingClient = new PairingClient({
      baseUrl: webBaseUrl,
      credentialStore,
      fetch,
    });

    await expect(pairingClient.pair(PAIRING_CODE)).resolves.toEqual({
      deviceId: expect.any(String),
      requestedProvider: "codex",
    });
    const credential = await credentialStore.read();
    expect(credential).toEqual({
      deviceId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      ),
      deviceToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    if (!credential) {
      throw new Error("Pairing did not persist a device credential");
    }

    let observation: SocketObservation | undefined;
    const gatewayClient = new GatewayClient({
      gatewayUrl,
      credentialStore,
      createSocket: (url, options) => {
        const socket = new WebSocket(url, options);
        observation = observeSocket(socket);
        return socket;
      },
    });

    try {
      await gatewayClient.start();
      const session = await waitUntil(
        "session.accepted",
        () =>
          observation?.messages.find(
            (message) => message.type === "session.accepted",
          ),
      );
      expect(session).toMatchObject({
        type: "session.accepted",
        heartbeatSeconds: 5,
      });

      await createReadyTask(credential.deviceId);
      const completed = await waitUntil("completed AI task", async () => {
        const task = await readTask();
        return task?.status === "completed" ? task : undefined;
      });
      expect(completed).toEqual({
        status: "completed",
        result_json: {
          kind: "room_reply",
          payload: { text: "Stub connector output." },
          partial: false,
        },
      });

      await revokeDevice(credential.deviceId);
      const heartbeat = DeviceToServerMessageSchema.parse({
        type: "heartbeat",
        connectorVersion: "meld-connector/0.0.0",
        activeTasks: [],
      });
      (
        gatewayClient as unknown as {
          send(message: typeof heartbeat): void;
        }
      ).send(heartbeat);

      const close = await waitUntil(
        "revoked-device policy close",
        () => observation?.closes[0],
      );
      expect(close).toEqual({
        code: 1008,
        reason: "device_revoked",
      });
    } finally {
      gatewayClient.stop();
    }
  });
});
