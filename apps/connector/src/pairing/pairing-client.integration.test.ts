import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
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
  childPid: number | undefined;
  command: string;
  label: string;
  processGroupId: number | undefined;
  stopped: boolean;
  output(): string;
}

interface SocketObservation {
  messages: ServerToDeviceMessage[];
  closes: Array<{ code: number; reason: string }>;
}

interface CleanupStage {
  label: string;
  run(): void | Promise<void>;
}

interface StopProcessOptions {
  killTimeoutMs?: number;
  pollIntervalMs?: number;
  termTimeoutMs?: number;
}

const ownedProcesses: OwnedProcess[] = [];
const gatewayClients: GatewayClient[] = [];
const observedSockets: WebSocket[] = [];
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
  label: string,
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

  const childPid = validatedProcessId(child.pid);
  const owned = {
    child,
    childPid,
    command: [command, ...args].join(" "),
    label,
    processGroupId:
      process.platform === "win32" ? undefined : childPid,
    stopped: false,
    output: () => processOutput,
  };
  ownedProcesses.push(owned);
  return owned;
}

function validatedProcessId(
  processId: number | undefined,
): number | undefined {
  return Number.isSafeInteger(processId) &&
    processId !== undefined &&
    processId > 1
    ? processId
    : undefined;
}

function isNoSuchProcess(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ESRCH"
  );
}

function processTargetExists(target: number): boolean {
  try {
    process.kill(target, 0);
    return true;
  } catch (error) {
    if (isNoSuchProcess(error)) {
      return false;
    }
    throw error;
  }
}

function signalProcessTarget(
  target: number,
  signal: NodeJS.Signals,
): boolean {
  try {
    process.kill(target, signal);
    return true;
  } catch (error) {
    if (isNoSuchProcess(error)) {
      return false;
    }
    throw error;
  }
}

function waitForProcessTargetExit(
  target: number,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<boolean> {
  return new Promise<boolean>((fulfill, reject) => {
    const deadline = Date.now() + timeoutMs;
    let timer: NodeJS.Timeout | undefined;
    let settled = false;

    const finish = (
      result: boolean | Error,
      rejected = false,
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (rejected) {
        reject(result);
      } else {
        fulfill(result as boolean);
      }
    };

    const inspect = (): void => {
      try {
        if (!processTargetExists(target)) {
          finish(true);
          return;
        }
        if (Date.now() >= deadline) {
          finish(false);
          return;
        }
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error("Process-group inspection failed"),
          true,
        );
        return;
      }

      timer = setTimeout(
        inspect,
        Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())),
      );
      timer.unref();
    };

    inspect();
  });
}

async function stopProcessTarget(
  target: number,
  label: string,
  {
    killTimeoutMs = 5_000,
    pollIntervalMs = 25,
    termTimeoutMs = 5_000,
  }: StopProcessOptions = {},
): Promise<void> {
  if (!processTargetExists(target)) {
    return;
  }

  signalProcessTarget(target, "SIGTERM");
  if (
    await waitForProcessTargetExit(
      target,
      termTimeoutMs,
      pollIntervalMs,
    )
  ) {
    return;
  }

  signalProcessTarget(target, "SIGKILL");
  if (
    await waitForProcessTargetExit(
      target,
      killTimeoutMs,
      pollIntervalMs,
    )
  ) {
    return;
  }

  throw new Error(
    `${label} remained alive after SIGTERM and SIGKILL`,
  );
}

async function stopOwnedProcess(
  owned: OwnedProcess,
  options: StopProcessOptions = {},
): Promise<void> {
  if (owned.stopped) {
    return;
  }
  if (owned.processGroupId !== undefined) {
    await stopProcessTarget(
      -owned.processGroupId,
      `${owned.label} process group ${owned.processGroupId}`,
      options,
    );
    owned.stopped = true;
    return;
  }

  if (
    owned.childPid === undefined ||
    owned.child.exitCode !== null ||
    owned.child.signalCode !== null
  ) {
    owned.stopped = true;
    return;
  }
  await stopProcessTarget(
    owned.childPid,
    `${owned.label} process ${owned.childPid}`,
    options,
  );
  owned.stopped = true;
}

async function runCleanupStages(
  stages: CleanupStage[],
): Promise<void> {
  const errors: Error[] = [];
  for (const stage of stages) {
    try {
      await stage.run();
    } catch (error) {
      const cause =
        error instanceof Error
          ? error
          : new Error("Unknown cleanup failure");
      errors.push(
        new Error(`${stage.label}: ${cause.message}`, { cause }),
      );
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      `Connector integration cleanup failed in ${errors.length} stage(s)`,
    );
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

async function createPairingCode(
  code: string,
  provider: "codex" | "claude",
): Promise<void> {
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
      select public.create_device_pairing_code(
        ${hashToken(normalizePairingCode(code))},
        ${provider}::public.ai_provider
      )
    `;
  });
}

async function issuePairingCodeConcurrently(
  index: number,
): Promise<void> {
  const sql = postgres(
    requiredEnvironment("SUPABASE_DB_URL"),
    { max: 1 },
  );
  try {
    await sql.begin(async (transaction) => {
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
          ${hashToken(`concurrent-pairing-${index}`)},
          'codex'
        )
      `;
    });
  } finally {
    await sql.end();
  }
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
  observedSockets.push(socket);
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
    "web",
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
      MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY: requiredEnvironment(
        "MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY",
      ),
    },
  );
  await waitForHttp(webBaseUrl, web);

  const gateway = startOwnedProcess(
    "gateway",
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
      GATEWAY_HEARTBEAT_SECONDS: "1",
    },
  );
  await waitForHttp(
    `http://127.0.0.1:${gatewayPort}/health`,
    gateway,
  );
});

afterAll(async () => {
  const clients = [...gatewayClients];
  const processes = [...ownedProcesses].reverse();
  const sockets = [...observedSockets];
  const cleanupStages: CleanupStage[] = [
    ...clients.map((client, index) => ({
      label: `connector ${index + 1} stop`,
      run: () => client.stop(),
    })),
    ...processes.map((owned) => ({
      label: `${owned.label} process-group stop`,
      run: () => stopOwnedProcess(owned),
    })),
    {
      label: "web tsconfig restoration",
      async run() {
        const contents = originalWebTsconfig;
        originalWebTsconfig = undefined;
        if (contents !== undefined) {
          await writeFile(WEB_TSCONFIG_PATH, contents, "utf8");
        }
      },
    },
    {
      label: "organization fixture deletion",
      async run() {
        if (databaseClient) {
          await databaseClient`
            delete from public.organizations
            where id = ${ORGANIZATION_ID}
          `;
        }
      },
    },
    {
      label: "user fixture deletion",
      async run() {
        if (databaseClient) {
          await databaseClient`
            delete from auth.users
            where id = ${USER_ID}
          `;
        }
      },
    },
    {
      label: "database client close",
      async run() {
        const sql = databaseClient;
        databaseClient = undefined;
        if (sql) {
          await sql.end();
        }
      },
    },
    ...sockets.map((socket, index) => ({
      label: `socket ${index + 1} termination`,
      run() {
        if (socket.readyState !== WebSocket.CLOSED) {
          socket.terminate();
        }
      },
    })),
    ...sockets.map((socket, index) => ({
      label: `socket ${index + 1} listener cleanup`,
      run: () => socket.removeAllListeners(),
    })),
  ];

  try {
    await runCleanupStages(cleanupStages);
  } finally {
    gatewayClients.length = 0;
    ownedProcesses.length = 0;
    observedSockets.length = 0;
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

    const pairingResult = await pairingClient.pair(PAIRING_CODE);
    expect(pairingResult).toEqual({
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
      requestedProvider: pairingResult.requestedProvider,
      createSocket: (url, options) => {
        const socket = new WebSocket(url, options);
        observation = observeSocket(socket);
        return socket;
      },
    });
    gatewayClients.push(gatewayClient);

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
        heartbeatSeconds: 1,
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
      const close = await waitUntil(
        "revoked-device policy close from the scheduled heartbeat",
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

  it("binds a live connector to Claude without advertising Codex", async () => {
    const code = "MELD-CLAUDE-INTEGRATION";
    await createPairingCode(code, "claude");
    const credentialStore = new MemoryCredentialStore();
    const pairingClient = new PairingClient({
      baseUrl: webBaseUrl,
      credentialStore,
      fetch,
    });
    const pairingResult = await pairingClient.pair(code);
    const gatewayClient = new GatewayClient({
      gatewayUrl,
      credentialStore,
      requestedProvider: pairingResult.requestedProvider,
    });
    gatewayClients.push(gatewayClient);

    await gatewayClient.start();

    const providers = await waitUntil(
      "Claude-only provider persistence",
      async () => {
        const rows = await database()<
          { provider: string }[]
        >`
          select provider::text
          from public.provider_connections
          where device_id = ${pairingResult.deviceId}
          order by provider
        `;
        return rows.length > 0 ? rows : undefined;
      },
    );
    expect(providers).toEqual([{ provider: "claude" }]);
  });

  it("serializes concurrent issuance so live codes never exceed five", async () => {
    const attempts = Array.from({ length: 12 }, (_, index) =>
      issuePairingCodeConcurrently(index),
    );
    const results = await Promise.allSettled(attempts);
    const successes = results.filter(
      (result) => result.status === "fulfilled",
    );

    expect(successes).toHaveLength(5);
    const rows = await database()<{ count: number }[]>`
      select count(*)::integer as count
      from public.device_pairing_codes
      where user_id = ${USER_ID}
        and redeemed_at is null
        and expires_at > now()
    `;
    expect(rows[0]?.count).toBe(5);
  });
});

describe("connector integration cleanup", () => {
  it("attempts later cleanup stages after an earlier stage fails", async () => {
    const completedStages: string[] = [];
    let cleanupError: unknown;

    try {
      await runCleanupStages([
        {
          label: "connector",
          run() {
            completedStages.push("connector");
            throw new Error("injected connector cleanup failure");
          },
        },
        {
          label: "web process",
          run() {
            completedStages.push("web process");
          },
        },
        {
          label: "database close",
          run() {
            completedStages.push("database close");
            throw new Error("injected database cleanup failure");
          },
        },
      ]);
    } catch (error) {
      cleanupError = error;
    }

    expect(completedStages).toEqual([
      "connector",
      "web process",
      "database close",
    ]);
    expect(cleanupError).toBeInstanceOf(AggregateError);
    expect(
      (cleanupError as AggregateError).errors.map(
        (error) => (error as Error).message,
      ),
    ).toEqual([
      "connector: injected connector cleanup failure",
      "database close: injected database cleanup failure",
    ]);
  });

  it.skipIf(process.platform === "win32")(
    "stops a detached process group after its wrapper exits",
    async () => {
      const grandchildProgram = [
        'console.log("grandchild-ready")',
        'process.on("SIGTERM", () => console.log("ignored-term"))',
        "setInterval(() => undefined, 1000)",
      ].join(";");
      const wrapperProgram = [
        'const { spawn } = require("node:child_process")',
        `const child = spawn(process.execPath, ["-e", ${JSON.stringify(
          grandchildProgram,
        )}], { stdio: ["ignore", "inherit", "inherit"] })`,
        "child.unref()",
      ].join(";");
      const owned = startOwnedProcess(
        "stubborn cleanup fixture",
        process.execPath,
        ["-e", wrapperProgram],
        {},
      );

      await waitUntil("detached wrapper exit and grandchild startup", () =>
        owned.child.exitCode !== null &&
        owned.output().includes("grandchild-ready")
          ? true
          : undefined,
      );
      expect(owned.processGroupId).toEqual(expect.any(Number));
      const processGroupId = owned.processGroupId;
      if (processGroupId === undefined) {
        throw new Error("Detached cleanup fixture has no process group");
      }
      expect(processTargetExists(-processGroupId)).toBe(true);

      await stopOwnedProcess(owned, {
        termTimeoutMs: 100,
        killTimeoutMs: 2_000,
        pollIntervalMs: 10,
      });

      expect(owned.output()).toContain("ignored-term");
      expect(processTargetExists(-processGroupId)).toBe(false);
    },
  );
});
