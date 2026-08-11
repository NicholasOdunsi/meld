import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ServerToDeviceMessageSchema,
  type ProviderStatus,
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
const WORKSPACE_ID = "c2000000-0000-4000-8000-000000000001";
const ROOM_ID = "c3000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "c4000000-0000-4000-8000-000000000001";
const MESSAGE_CLIENT_ID = "c4100000-0000-4000-8000-000000000001";
const TASK_ID = "c5000000-0000-4000-8000-000000000001";
const DEADLOCK_DEVICE_ID = "c6000000-0000-4000-8000-000000000001";
const DEADLOCK_TASK_ID = "c7000000-0000-4000-8000-000000000001";
const DEADLOCK_ATTEMPT_ID = "c7100000-0000-4000-8000-000000000001";
const REVOKE_DEVICE_ID = "c6000000-0000-4000-8000-000000000002";
const REVOKE_TASK_ID = "c7000000-0000-4000-8000-000000000002";
const REVOKE_ATTEMPT_ID = "c7100000-0000-4000-8000-000000000002";
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

interface RunningTaskFixture {
  attemptId: string;
  deviceId: string;
  taskId: string;
  tokenHash: string;
}

interface TrackedPromise<T> {
  isSettled(): boolean;
  promise: Promise<T>;
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

function trackPromise<T>(promise: Promise<T>): TrackedPromise<T> {
  let settled = false;
  return {
    isSettled: () => settled,
    promise: promise.finally(() => {
      settled = true;
    }),
  };
}

async function settleWithin<T>(
  description: string,
  promise: Promise<T>,
  timeoutMs = 10_000,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_fulfill, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Timed out waiting for ${description}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function waitForDatabaseLock(
  backendPid: number,
  description: string,
  isSettled: () => boolean,
): Promise<void> {
  await waitUntil(description, async () => {
    if (isSettled()) {
      throw new Error(`${description} settled before acquiring the lock`);
    }
    const rows = await database()<
      {
        state: string;
        wait_event_type: string | null;
      }[]
    >`
      select state, wait_event_type
      from pg_catalog.pg_stat_activity
      where pid = ${backendPid}
    `;
    return rows[0]?.state === "active" &&
      rows[0].wait_event_type === "Lock"
      ? true
      : undefined;
  });
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
    // Pairing a device creates a provider setup request that references the
    // fixture user; clear it first so the fixture user can be deleted.
    await transaction`
      delete from public.provider_setup_requests
      where user_id = ${USER_ID}
    `;
    await transaction`
      delete from public.workspaces
      where id = ${WORKSPACE_ID}
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
      insert into public.workspaces (id, name, created_by)
      values (
        ${WORKSPACE_ID},
        'Connector Integration',
        ${USER_ID}
      )
    `;
    await transaction`
      insert into public.rooms (
        id,
        workspace_id,
        name,
        owner_id
      )
      values (
        ${ROOM_ID},
        ${WORKSPACE_ID},
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
      workspace_id,
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
      ${WORKSPACE_ID},
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

async function createRunningTaskFixture({
  attemptId,
  deviceId,
  taskId,
  tokenHash,
}: RunningTaskFixture): Promise<Date> {
  const rows = await database().begin(async (transaction) => {
    await transaction`
      insert into public.execution_devices (
        id,
        user_id,
        name,
        platform,
        token_hash,
        status
      )
      values (
        ${deviceId},
        ${USER_ID},
        'Concurrency regression connector',
        'test',
        ${tokenHash},
        'active'
      )
    `;
    await transaction`
      insert into public.ai_tasks (
        id,
        initiating_user_id,
        workspace_id,
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
        ${taskId},
        ${USER_ID},
        ${WORKSPACE_ID},
        ${ROOM_ID},
        ${deviceId},
        'codex',
        'room_reply',
        'running',
        'Exercise durable task concurrency.',
        ${transaction.json({
          messageIds: [MESSAGE_ID],
          attachmentIds: [],
          evidenceIds: [],
          decisionIds: [],
        })},
        0
      )
    `;
    return transaction<{ lease_expires_at: Date }[]>`
      insert into public.ai_task_attempts (
        id,
        task_id,
        device_id,
        attempt_no,
        lease_expires_at
      )
      values (
        ${attemptId},
        ${taskId},
        ${deviceId},
        1,
        now() + interval '5 minutes'
      )
      returning lease_expires_at
    `;
  });
  const leaseExpiresAt = rows[0]?.lease_expires_at;
  if (!leaseExpiresAt) {
    throw new Error("Running task fixture did not return a lease deadline");
  }
  return leaseExpiresAt;
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
      label: "provider setup request fixture deletion",
      async run() {
        if (databaseClient) {
          await databaseClient`
            delete from public.provider_setup_requests
            where user_id = ${USER_ID}
          `;
        }
      },
    },
    {
      label: "workspace fixture deletion",
      async run() {
        if (databaseClient) {
          await databaseClient`
            delete from public.workspaces
            where id = ${WORKSPACE_ID}
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

/**
 * Hermetic connector runtime for the live-stack tests: the provider setup and
 * task executor are stubbed so the real gateway/pairing/heartbeat round-trip is
 * exercised without ever invoking a real `codex`/`claude`, install, or login.
 * The task executor settles the same room-reply envelope the connector would
 * forward, and `detectProviders` reports exactly the statuses the test controls.
 */
function stubConnectorRuntime(providers: ProviderStatus[]) {
  return {
    createProviderSetup: () => ({
      connect: () => new Promise<ProviderStatus>(() => {}),
    }),
    createTaskExecutor: () => ({
      execute: async () => ({
        kind: "room_reply" as const,
        payload: {
          response: "Stub connector output.",
          citedMessageIds: [],
          citedEvidenceIds: [],
          assumptions: [],
          suggestedNextQuestions: [],
        },
        partial: false as const,
      }),
      cleanup: async () => {},
    }),
    detectProviders: async () => providers,
  };
}

const CODEX_INSTALLED: ProviderStatus = {
  provider: "codex",
  installation: "installed",
  version: "1.0.0",
  authentication: "authenticated",
  compatibility: "supported",
};

const CLAUDE_INSTALLED: ProviderStatus = {
  provider: "claude",
  installation: "installed",
  version: "1.0.0",
  authentication: "authenticated",
  compatibility: "supported",
};

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
      ...stubConnectorRuntime([CODEX_INSTALLED]),
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
          payload: {
            response: "Stub connector output.",
            citedMessageIds: [],
            citedEvidenceIds: [],
            assumptions: [],
            suggestedNextQuestions: [],
          },
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
      ...stubConnectorRuntime([CLAUDE_INSTALLED]),
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

describe("durable task device-lock concurrency", () => {
  it("avoids the renew-versus-append deadlock with device-first locking", async () => {
    await createRunningTaskFixture({
      attemptId: DEADLOCK_ATTEMPT_ID,
      deviceId: DEADLOCK_DEVICE_ID,
      taskId: DEADLOCK_TASK_ID,
      tokenHash: "connector-integration-deadlock-device",
    });
    const blocker = postgres(requiredEnvironment("SUPABASE_DB_URL"), {
      max: 1,
    });
    const renewer = postgres(requiredEnvironment("SUPABASE_DB_URL"), {
      max: 1,
    });
    const appender = postgres(requiredEnvironment("SUPABASE_DB_URL"), {
      max: 1,
    });
    let blockerInTransaction = false;

    try {
      const [{ pid: renewerPid }] = await renewer<
        { pid: number }[]
      >`select pg_backend_pid()::integer as pid`;
      const [{ pid: appenderPid }] = await appender<
        { pid: number }[]
      >`select pg_backend_pid()::integer as pid`;
      await renewer.unsafe("set role service_role");
      await appender.unsafe("set role service_role");

      await blocker.unsafe("begin");
      blockerInTransaction = true;
      await blocker`
        select id
        from public.execution_devices
        where id = ${DEADLOCK_DEVICE_ID}
        for update
      `;

      const renewal = trackPromise(
        Promise.resolve(
          renewer`
            select *
            from public.renew_ai_task_leases(
              ${DEADLOCK_DEVICE_ID}::uuid,
              ${renewer.json([
                {
                  taskId: DEADLOCK_TASK_ID,
                  attemptId: DEADLOCK_ATTEMPT_ID,
                },
              ])}::jsonb
            )
          `,
        ),
      );
      await waitForDatabaseLock(
        renewerPid,
        "lease renewal to queue first on the device row",
        renewal.isSettled,
      );

      const append = trackPromise(
        Promise.resolve(
          appender`
            select public.append_ai_task_event(
              ${DEADLOCK_TASK_ID}::uuid,
              ${DEADLOCK_DEVICE_ID}::uuid,
              ${DEADLOCK_ATTEMPT_ID}::uuid,
              1,
              'text.delta',
              ${appender.json({ text: "serialized" })}::jsonb
            ) as sequence
          `,
        ),
      );
      await waitForDatabaseLock(
        appenderPid,
        "event append to queue second on the device row",
        append.isSettled,
      );

      await blocker.unsafe("commit");
      blockerInTransaction = false;
      const results = await settleWithin(
        "renewal and append to settle without deadlock",
        Promise.allSettled([renewal.promise, append.promise]),
      );
      const rejectedCodes = results.flatMap((result) => {
        if (
          result.status === "rejected" &&
          typeof result.reason === "object" &&
          result.reason !== null &&
          "code" in result.reason
        ) {
          return [String(result.reason.code)];
        }
        return [];
      });
      expect(rejectedCodes).not.toContain("40P01");
      expect(results.every((result) => result.status === "fulfilled")).toBe(
        true,
      );
      if (
        results[0]?.status !== "fulfilled" ||
        results[1]?.status !== "fulfilled"
      ) {
        throw new Error("Concurrency calls did not both fulfill");
      }
      expect(results[0].value).toMatchObject([
        {
          task_id: DEADLOCK_TASK_ID,
          attempt_id: DEADLOCK_ATTEMPT_ID,
        },
      ]);
      expect(results[1].value).toMatchObject([{ sequence: "1" }]);

      const [state] = await database()<
        {
          event_count: number;
          lease_is_valid: boolean;
          settled_at: Date | null;
          status: string;
        }[]
      >`
        select
          task.status::text as status,
          attempt.settled_at,
          attempt.lease_expires_at > now() as lease_is_valid,
          (
            select count(*)::integer
            from public.ai_task_events as event
            where event.attempt_id = attempt.id
              and event.sequence = 1
          ) as event_count
        from public.ai_tasks as task
        join public.ai_task_attempts as attempt
          on attempt.task_id = task.id
        where task.id = ${DEADLOCK_TASK_ID}
          and attempt.id = ${DEADLOCK_ATTEMPT_ID}
      `;
      expect(state).toEqual({
        event_count: 1,
        lease_is_valid: true,
        settled_at: null,
        status: "running",
      });
    } finally {
      if (blockerInTransaction) {
        await blocker.unsafe("rollback").catch(() => undefined);
      }
      await Promise.all([
        blocker.end(),
        renewer.end(),
        appender.end(),
      ]);
    }
  });

  it("blocks heartbeat and renewal behind an uncommitted revoke", async () => {
    const initialLeaseExpiresAt = await createRunningTaskFixture({
      attemptId: REVOKE_ATTEMPT_ID,
      deviceId: REVOKE_DEVICE_ID,
      taskId: REVOKE_TASK_ID,
      tokenHash: "connector-integration-revoke-device",
    });
    const revoker = postgres(requiredEnvironment("SUPABASE_DB_URL"), {
      max: 1,
      connection: {
        application_name: "meld-test-device-revoker",
      },
    });
    const heartbeat = postgres(
      requiredEnvironment("SUPABASE_DB_URL"),
      {
        max: 1,
        connection: {
          application_name: "meld-test-device-heartbeat",
        },
      },
    );
    const renewer = postgres(
      requiredEnvironment("SUPABASE_DB_URL"),
      {
        max: 1,
        connection: {
          application_name: "meld-test-device-renewer",
        },
      },
    );
    let revokeInTransaction = false;

    try {
      const [heartbeatBackend] = await heartbeat<
        { application_name: string; pid: number }[]
      >`
        select
          current_setting('application_name') as application_name,
          pg_backend_pid()::integer as pid
      `;
      const [renewerBackend] = await renewer<
        { application_name: string; pid: number }[]
      >`
        select
          current_setting('application_name') as application_name,
          pg_backend_pid()::integer as pid
      `;
      expect(heartbeatBackend).toEqual({
        application_name: "meld-test-device-heartbeat",
        pid: expect.any(Number),
      });
      expect(renewerBackend).toEqual({
        application_name: "meld-test-device-renewer",
        pid: expect.any(Number),
      });
      expect(heartbeatBackend?.pid).not.toBe(renewerBackend?.pid);
      if (!heartbeatBackend || !renewerBackend) {
        throw new Error("Device-operation backends were not established");
      }
      await heartbeat.unsafe("set role service_role");
      await renewer.unsafe("set role service_role");
      await revoker.unsafe("begin");
      revokeInTransaction = true;
      await revoker`
        select set_config(
          'request.jwt.claim.sub',
          ${USER_ID},
          true
        )
      `;
      await revoker.unsafe("set local role authenticated");
      await revoker`
        select public.revoke_execution_device(
          ${REVOKE_DEVICE_ID}::uuid
        )
      `;

      const connection = trackPromise(
        Promise.resolve(
          heartbeat`
            select public.record_device_connection(
              ${REVOKE_DEVICE_ID}::uuid,
              'blocked-heartbeat'
            )::text as status
          `,
        ),
      );
      const renewal = trackPromise(
        Promise.resolve(
          renewer`
            select *
            from public.renew_ai_task_leases(
              ${REVOKE_DEVICE_ID}::uuid,
              ${renewer.json([
                {
                  taskId: REVOKE_TASK_ID,
                  attemptId: REVOKE_ATTEMPT_ID,
                },
              ])}::jsonb
            )
          `,
        ),
      );
      await waitForDatabaseLock(
        heartbeatBackend.pid,
        "heartbeat to block behind the uncommitted revoke",
        connection.isSettled,
      );
      await waitForDatabaseLock(
        renewerBackend.pid,
        "lease renewal to block independently behind the uncommitted revoke",
        renewal.isSettled,
      );
      await new Promise((fulfill) => setTimeout(fulfill, 100));
      expect(connection.isSettled()).toBe(false);
      expect(renewal.isSettled()).toBe(false);

      await revoker.unsafe("commit");
      revokeInTransaction = false;
      const [connectionRows, renewalRows] = await settleWithin(
        "heartbeat and renewal to observe committed revocation",
        Promise.all([connection.promise, renewal.promise]),
      );
      expect(connectionRows).toMatchObject([{ status: "revoked" }]);
      expect(renewalRows).toHaveLength(0);

      const [state] = await database()<
        {
          connector_version: string | null;
          event_count: number;
          last_seen_at: Date | null;
          lease_expires_at: Date;
          settled_at: Date | null;
          status: string;
        }[]
      >`
        select
          task.status::text as status,
          attempt.lease_expires_at,
          attempt.settled_at,
          device.connector_version,
          device.last_seen_at,
          (
            select count(*)::integer
            from public.ai_task_events as event
            where event.attempt_id = attempt.id
          ) as event_count
        from public.ai_tasks as task
        join public.ai_task_attempts as attempt
          on attempt.task_id = task.id
        join public.execution_devices as device
          on device.id = task.device_id
        where task.id = ${REVOKE_TASK_ID}
          and attempt.id = ${REVOKE_ATTEMPT_ID}
      `;
      expect(state).toEqual({
        connector_version: null,
        event_count: 0,
        last_seen_at: null,
        lease_expires_at: initialLeaseExpiresAt,
        settled_at: null,
        status: "running",
      });
    } finally {
      if (revokeInTransaction) {
        await revoker.unsafe("rollback").catch(() => undefined);
      }
      await Promise.all([
        revoker.end(),
        heartbeat.end(),
        renewer.end(),
      ]);
    }
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
