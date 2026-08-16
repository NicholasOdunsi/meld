import type {
  AITaskStatus,
  Provider,
  ProviderSetupStatus,
  TaskErrorCode,
} from "@meld/contracts";
import { hashToken } from "@meld/device-auth";
import postgres from "postgres";

const USER_ID = "a1000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "a2000000-0000-4000-8000-000000000001";
const PROJECT_ID = "a2100000-0000-4000-8000-000000000001";
const DEVICE_ID = "a3000000-0000-4000-8000-000000000001";
const PROVIDER_CONNECTION_ID =
  "a3100000-0000-4000-8000-000000000001";
const ROOM_ID = "a4000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "a5000000-0000-4000-8000-000000000001";
const MESSAGE_CLIENT_ID = "a5100000-0000-4000-8000-000000000001";
const ATTACHMENT_ID = "a5200000-0000-4000-8000-000000000001";
const EVIDENCE_ID = "a5300000-0000-4000-8000-000000000001";
const DECISION_ID = "a5400000-0000-4000-8000-000000000001";
const DEVICE_SECRET = "meld_gateway_integration_secret";

const TASK_IDS = Array.from(
  { length: 24 },
  (_, index) =>
    `a6000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

let databaseClient: ReturnType<typeof postgres> | undefined;
let nextTaskIndex = 0;

export interface GatewayFixture {
  userId: string;
  workspaceId: string;
  roomId: string;
  deviceId: string;
  deviceCredential: string;
  messageId: string;
  attachmentId: string;
  evidenceId: string;
  decisionId: string;
}

export interface AttemptSnapshot {
  id: string;
  attemptNo: number;
  leaseExpiresAt: Date;
  settledAt: Date | null;
  outcome: AITaskStatus | null;
  cancelRequestedAt: Date | null;
  cancelAcknowledgedAt: Date | null;
}

export interface TaskSnapshot {
  id: string;
  status: AITaskStatus;
  result: unknown;
  errorCode: TaskErrorCode | null;
  errorMessage: string | null;
  currentAttemptId: string | null;
  eventCount: number;
  attempts: AttemptSnapshot[];
}

interface ClaimResult {
  taskId: string;
  attemptId: string;
}

function database() {
  if (!databaseClient) {
    const url = process.env.SUPABASE_DB_URL;
    if (!url) {
      throw new Error(
        "SUPABASE_DB_URL is required for gateway integration fixtures",
      );
    }
    databaseClient = postgres(url, { max: 1 });
  }
  return databaseClient;
}

function requireFixtureTaskId(): string {
  const taskId = TASK_IDS[nextTaskIndex];
  if (!taskId) {
    throw new Error("Gateway integration fixture task IDs exhausted");
  }
  nextTaskIndex += 1;
  return taskId;
}

export async function resetGatewayFixture(): Promise<GatewayFixture> {
  const sql = database();
  await sql.begin(async (transaction) => {
    await transaction`
      delete from public.workspaces
      where id = ${WORKSPACE_ID}
    `;
    // settle_provider_setup_request can leave this fixture device as a
    // user's default; that row has no ON DELETE CASCADE back to
    // execution_devices (production only revokes devices, it never deletes
    // them), so a completed setup from a prior test run would otherwise
    // block this delete with a foreign key violation.
    await transaction`
      delete from public.ai_user_preferences
      where user_id = ${USER_ID}
    `;
    await transaction`
      delete from public.execution_devices
      where id = ${DEVICE_ID}
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
        'gateway-integration@example.com',
        '',
        now(),
        ${transaction.json({
          provider: "email",
          providers: ["email"],
        })},
        ${transaction.json({ display_name: "Gateway Fixture" })},
        now(),
        now()
      )
    `;
    await transaction`
      insert into public.workspaces (id, name, created_by)
      values (${WORKSPACE_ID}, 'Gateway Integration', ${USER_ID})
    `;
    await transaction`
      insert into public.projects (id, workspace_id, name, created_by)
      values (${PROJECT_ID}, ${WORKSPACE_ID}, 'Gateway Integration', ${USER_ID})
    `;
    await transaction`
      insert into public.rooms (
        id,
        workspace_id,
        project_id,
        name,
        owner_id
      )
      values (
        ${ROOM_ID},
        ${WORKSPACE_ID},
        ${PROJECT_ID},
        'Gateway durability room',
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
        'The gateway must preserve durable task state.'
      )
    `;
    await transaction`
      insert into public.attachments (
        id,
        room_id,
        uploaded_by,
        storage_path,
        original_name,
        mime_type,
        byte_size,
        caption,
        extraction_status,
        extracted_text
      )
      values (
        ${ATTACHMENT_ID},
        ${ROOM_ID},
        ${USER_ID},
        ${`${ROOM_ID}/gateway-fixture.txt`},
        'gateway-fixture.txt',
        'text/plain',
        42,
        'Integration fixture attachment',
        'ready',
        'Durable fixture attachment text.'
      )
    `;
    await transaction`
      insert into public.evidence (
        id,
        room_id,
        attachment_id,
        title,
        note,
        created_by
      )
      values (
        ${EVIDENCE_ID},
        ${ROOM_ID},
        ${ATTACHMENT_ID},
        'Durability evidence',
        'The database is the source of truth.',
        ${USER_ID}
      )
    `;
    await transaction`
      insert into public.decisions (
        id,
        room_id,
        source_message_id,
        summary,
        created_by
      )
      values (
        ${DECISION_ID},
        ${ROOM_ID},
        ${MESSAGE_ID},
        'Replay committed operations idempotently.',
        ${USER_ID}
      )
    `;
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
        ${DEVICE_ID},
        ${USER_ID},
        'Gateway Integration Device',
        'macos',
        ${hashToken(DEVICE_SECRET)},
        'active'
      )
    `;
    await transaction`
      insert into public.provider_connections (
        id,
        user_id,
        device_id,
        provider,
        installation,
        version,
        authentication,
        compatibility,
        last_seen_at
      )
      values (
        ${PROVIDER_CONNECTION_ID},
        ${USER_ID},
        ${DEVICE_ID},
        'codex',
        'installed',
        '1.0.0',
        'authenticated',
        'supported',
        now()
      )
    `;
  });
  nextTaskIndex = 0;

  return {
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    roomId: ROOM_ID,
    deviceId: DEVICE_ID,
    deviceCredential: `${DEVICE_ID}.${DEVICE_SECRET}`,
    messageId: MESSAGE_ID,
    attachmentId: ATTACHMENT_ID,
    evidenceId: EVIDENCE_ID,
    decisionId: DECISION_ID,
  };
}

export async function createReadyTask(
  fixture: GatewayFixture,
): Promise<string> {
  const taskId = requireFixtureTaskId();
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
      ${taskId},
      ${fixture.userId},
      ${fixture.workspaceId},
      ${fixture.roomId},
      ${fixture.deviceId},
      'codex',
      'room_reply',
      'ready_to_run',
      'Summarize the durable gateway fixture.',
      ${sql.json({
        messageIds: [fixture.messageId],
        attachmentIds: [fixture.attachmentId],
        evidenceIds: [fixture.evidenceId],
        decisionIds: [fixture.decisionId],
      })},
      0
    )
  `;
  return taskId;
}

export async function createEscapeHeavyReadyTask(
  fixture: GatewayFixture,
): Promise<string> {
  const taskId = requireFixtureTaskId();
  const attachmentIds = Array.from(
    { length: 6 },
    (_, index) =>
      `b5200000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
  const sql = database();
  await sql.begin(async (transaction) => {
    for (const [index, attachmentId] of attachmentIds.entries()) {
      await transaction`
        insert into public.attachments (
          id,
          room_id,
          uploaded_by,
          storage_path,
          original_name,
          mime_type,
          byte_size,
          extraction_status,
          extracted_text
        )
        values (
          ${attachmentId},
          ${fixture.roomId},
          ${fixture.userId},
          ${`${fixture.roomId}/escape-heavy-${index + 1}.txt`},
          ${`escape-heavy-${index + 1}.txt`},
          'text/plain',
          50000,
          'ready',
          ${'"'.repeat(50_000)}
        )
      `;
    }
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
        ${fixture.userId},
        ${fixture.workspaceId},
        ${fixture.roomId},
        ${fixture.deviceId},
        'codex',
        'room_reply',
        'ready_to_run',
        'Reject escape-heavy context above the wire limit.',
        ${transaction.json({
          messageIds: [],
          attachmentIds,
          evidenceIds: [],
          decisionIds: [],
        })},
        0
      )
    `;
  });
  return taskId;
}

export async function createQueuedProviderSetup(
  fixture: GatewayFixture,
  provider: Provider,
): Promise<string> {
  const sql = database();
  const rows = await sql<{ id: string }[]>`
    insert into public.provider_setup_requests (
      user_id,
      device_id,
      provider
    )
    values (
      ${fixture.userId},
      ${fixture.deviceId},
      ${provider}
    )
    returning id
  `;
  const requestId = rows[0]?.id;
  if (!requestId) {
    throw new Error("Fixture provider setup request was not created");
  }
  return requestId;
}

export interface ProviderSetupRequestSnapshot {
  id: string;
  status: ProviderSetupStatus;
  stage: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export async function readProviderSetupRequest(
  requestId: string,
): Promise<ProviderSetupRequestSnapshot> {
  const sql = database();
  const rows = await sql<
    {
      id: string;
      status: ProviderSetupStatus;
      stage: string | null;
      error_code: string | null;
      error_message: string | null;
    }[]
  >`
    select id, status, stage, error_code, error_message
    from public.provider_setup_requests
    where id = ${requestId}
  `;
  const row = rows[0];
  if (!row) {
    throw new Error(
      `Fixture provider setup request ${requestId} was not found`,
    );
  }
  return {
    id: row.id,
    status: row.status,
    stage: row.stage,
    errorCode: row.error_code,
    errorMessage: row.error_message,
  };
}

export interface ProviderConnectionSnapshot {
  installation: string;
  authentication: string;
  compatibility: string;
  version: string | null;
}

export async function readProviderConnection(
  fixture: GatewayFixture,
  provider: Provider,
): Promise<ProviderConnectionSnapshot> {
  const sql = database();
  const rows = await sql<ProviderConnectionSnapshot[]>`
    select installation, authentication, compatibility, version
    from public.provider_connections
    where device_id = ${fixture.deviceId}
      and provider = ${provider}
  `;
  const row = rows[0];
  if (!row) {
    throw new Error(
      `Fixture provider connection for ${provider} was not found`,
    );
  }
  return row;
}

export async function claimReadyTask(taskId: string): Promise<string> {
  const sql = database();
  const rows = await sql<{ claim: ClaimResult }[]>`
    select public.claim_ai_task(
      ${taskId}::uuid,
      ${DEVICE_ID}::uuid
    ) as claim
  `;
  const attemptId = rows[0]?.claim.attemptId;
  if (!attemptId) {
    throw new Error(`Fixture task ${taskId} was not claimed`);
  }
  return attemptId;
}

export async function expireAttempt(attemptId: string): Promise<void> {
  const rows = await database()`
    update public.ai_task_attempts
    set lease_expires_at = now() - interval '1 second'
    where id = ${attemptId}
    returning id
  `;
  if (rows.length !== 1) {
    throw new Error(`Fixture attempt ${attemptId} was not found`);
  }
}

export async function setTaskWaiting(taskId: string): Promise<void> {
  const rows = await database()`
    update public.ai_tasks
    set status = 'waiting_for_device',
        updated_at = now()
    where id = ${taskId}
      and status = 'ready_to_run'
    returning id
  `;
  if (rows.length !== 1) {
    throw new Error(`Fixture task ${taskId} was not ready`);
  }
}

export async function requestTaskCancellation(
  fixture: GatewayFixture,
  taskId: string,
): Promise<void> {
  const sql = database();
  await sql.begin(async (transaction) => {
    await transaction`
      select set_config(
        'request.jwt.claim.sub',
        ${fixture.userId},
        true
      )
    `;
    await transaction`
      select public.cancel_ai_task(${taskId}::uuid)
    `;
  });
}

export async function readTask(taskId: string): Promise<TaskSnapshot> {
  const sql = database();
  const tasks = await sql<
    {
      id: string;
      status: AITaskStatus;
      result_json: unknown;
      error_code: TaskErrorCode | null;
      error_message: string | null;
    }[]
  >`
    select id, status, result_json, error_code, error_message
    from public.ai_tasks
    where id = ${taskId}
  `;
  const task = tasks[0];
  if (!task) {
    throw new Error(`Fixture task ${taskId} was not found`);
  }

  const attempts = await sql<
    {
      id: string;
      attempt_no: number;
      lease_expires_at: Date;
      settled_at: Date | null;
      outcome: AITaskStatus | null;
      cancel_requested_at: Date | null;
      cancel_acknowledged_at: Date | null;
    }[]
  >`
    select
      id,
      attempt_no,
      lease_expires_at,
      settled_at,
      outcome,
      cancel_requested_at,
      cancel_acknowledged_at
    from public.ai_task_attempts
    where task_id = ${taskId}
    order by attempt_no
  `;
  const eventCounts = await sql<{ count: number }[]>`
    select count(*)::integer as count
    from public.ai_task_events
    where task_id = ${taskId}
  `;
  const snapshots = attempts.map((attempt) => ({
    id: attempt.id,
    attemptNo: attempt.attempt_no,
    leaseExpiresAt: attempt.lease_expires_at,
    settledAt: attempt.settled_at,
    outcome: attempt.outcome,
    cancelRequestedAt: attempt.cancel_requested_at,
    cancelAcknowledgedAt: attempt.cancel_acknowledged_at,
  }));

  return {
    id: task.id,
    status: task.status,
    result: task.result_json,
    errorCode: task.error_code,
    errorMessage: task.error_message,
    currentAttemptId:
      snapshots.find((attempt) => attempt.settledAt === null)?.id ?? null,
    eventCount: eventCounts[0]?.count ?? 0,
    attempts: snapshots,
  };
}

export async function closeGatewayFixtureDatabase(): Promise<void> {
  if (!databaseClient) {
    return;
  }
  const sql = databaseClient;
  databaseClient = undefined;
  try {
    await sql.begin(async (transaction) => {
      await transaction`
        delete from public.workspaces
        where id = ${WORKSPACE_ID}
      `;
      await transaction`
        delete from public.ai_user_preferences
        where user_id = ${USER_ID}
      `;
      await transaction`
        delete from public.execution_devices
        where id = ${DEVICE_ID}
      `;
      await transaction`
        delete from auth.users
        where id = ${USER_ID}
      `;
    });
  } finally {
    await sql.end();
  }
}
