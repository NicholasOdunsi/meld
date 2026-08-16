import { z } from "zod";

const PositiveIntegerFromEnvironmentSchema = z.coerce
  .number()
  .int()
  .positive();

const BooleanFromEnvironmentSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const GatewayEnvironmentSchema = z.object({
  GATEWAY_HOST: z.string().min(1).default("0.0.0.0"),
  GATEWAY_PORT: PositiveIntegerFromEnvironmentSchema.default(8787),
  GATEWAY_SUPABASE_URL: z.url(),
  GATEWAY_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GATEWAY_POLL_INTERVAL_MS:
    PositiveIntegerFromEnvironmentSchema.default(3000),
  GATEWAY_HEARTBEAT_SECONDS:
    PositiveIntegerFromEnvironmentSchema.default(30),
  MELD_USER_FLOW_TRIAL_ENABLED: BooleanFromEnvironmentSchema.default(false),
  MELD_CANVAS_SESSION_SECRET: z.string().min(32).optional(),
  MELD_CANVAS_DATA_DIR: z.string().min(1).optional(),
  GATEWAY_DATABASE_URL: z.string().min(1).optional(),
  MELD_CANVAS_IDLE_EVICTION_MS:
    PositiveIntegerFromEnvironmentSchema.default(120_000),
  NODE_ENV: z.string().optional(),
});

export interface GatewayConfig {
  host: string;
  port: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  pollIntervalMs: number;
  heartbeatSeconds: number;
  canvasTrialEnabled: boolean;
  canvasSessionSecret?: string;
  canvasDataDir?: string;
  databaseUrl?: string;
  canvasIdleEvictionMs: number;
}

export function readGatewayConfig(
  env: Record<string, string | undefined>,
): GatewayConfig {
  const result = GatewayEnvironmentSchema.safeParse(env);
  if (!result.success) {
    const variableName = String(
      result.error.issues[0]?.path[0] ?? "environment",
    );
    throw new Error(`Invalid gateway configuration: ${variableName}`);
  }
  const parsed = result.data;

  if (parsed.MELD_USER_FLOW_TRIAL_ENABLED) {
    if (parsed.NODE_ENV === "production") {
      throw new Error(
        "Invalid gateway configuration: MELD_USER_FLOW_TRIAL_ENABLED",
      );
    }
    if (
      !parsed.MELD_CANVAS_SESSION_SECRET ||
      !parsed.MELD_CANVAS_DATA_DIR ||
      !parsed.GATEWAY_DATABASE_URL
    ) {
      throw new Error(
        "Invalid gateway configuration: canvas trial settings",
      );
    }
  }

  return {
    host: parsed.GATEWAY_HOST,
    port: parsed.GATEWAY_PORT,
    supabaseUrl: parsed.GATEWAY_SUPABASE_URL,
    supabaseServiceRoleKey: parsed.GATEWAY_SUPABASE_SERVICE_ROLE_KEY,
    pollIntervalMs: parsed.GATEWAY_POLL_INTERVAL_MS,
    heartbeatSeconds: parsed.GATEWAY_HEARTBEAT_SECONDS,
    canvasTrialEnabled: parsed.MELD_USER_FLOW_TRIAL_ENABLED,
    canvasSessionSecret: parsed.MELD_CANVAS_SESSION_SECRET,
    canvasDataDir: parsed.MELD_CANVAS_DATA_DIR,
    databaseUrl: parsed.GATEWAY_DATABASE_URL,
    canvasIdleEvictionMs: parsed.MELD_CANVAS_IDLE_EVICTION_MS,
  };
}

export function assertHeartbeatWithinLease({
  heartbeatSeconds,
  leaseSeconds,
}: {
  heartbeatSeconds: number;
  leaseSeconds: number;
}): void {
  const maximumHeartbeatSeconds = Math.floor(leaseSeconds / 3);

  if (heartbeatSeconds > maximumHeartbeatSeconds) {
    throw new Error(
      `GATEWAY_HEARTBEAT_SECONDS must be at most ${maximumHeartbeatSeconds}`,
    );
  }
}
