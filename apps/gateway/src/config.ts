import { z } from "zod";

const PositiveIntegerFromEnvironmentSchema = z.coerce
  .number()
  .int()
  .positive();

const GatewayEnvironmentSchema = z.object({
  GATEWAY_HOST: z.string().min(1).default("0.0.0.0"),
  GATEWAY_PORT: PositiveIntegerFromEnvironmentSchema.default(8787),
  GATEWAY_SUPABASE_URL: z.url(),
  GATEWAY_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GATEWAY_POLL_INTERVAL_MS:
    PositiveIntegerFromEnvironmentSchema.default(3000),
  GATEWAY_HEARTBEAT_SECONDS:
    PositiveIntegerFromEnvironmentSchema.default(30),
});

export interface GatewayConfig {
  host: string;
  port: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  pollIntervalMs: number;
  heartbeatSeconds: number;
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

  return {
    host: parsed.GATEWAY_HOST,
    port: parsed.GATEWAY_PORT,
    supabaseUrl: parsed.GATEWAY_SUPABASE_URL,
    supabaseServiceRoleKey: parsed.GATEWAY_SUPABASE_SERVICE_ROLE_KEY,
    pollIntervalMs: parsed.GATEWAY_POLL_INTERVAL_MS,
    heartbeatSeconds: parsed.GATEWAY_HEARTBEAT_SECONDS,
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
