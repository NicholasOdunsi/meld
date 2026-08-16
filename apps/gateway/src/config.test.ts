import { describe, expect, it } from "vitest";
import { assertHeartbeatWithinLease, readGatewayConfig } from "./config";

const REQUIRED_ENV = {
  GATEWAY_SUPABASE_URL: "http://127.0.0.1:54321",
  GATEWAY_SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

describe("readGatewayConfig", () => {
  it("requires the gateway Supabase URL", () => {
    expect(() => readGatewayConfig({})).toThrow(
      "Invalid gateway configuration: GATEWAY_SUPABASE_URL",
    );
  });

  it("requires the gateway Supabase service-role key", () => {
    expect(() =>
      readGatewayConfig({
        GATEWAY_SUPABASE_URL: "http://127.0.0.1:54321",
      }),
    ).toThrow(
      "Invalid gateway configuration: GATEWAY_SUPABASE_SERVICE_ROLE_KEY",
    );
  });

  it("uses the gateway defaults", () => {
    expect(readGatewayConfig(REQUIRED_ENV)).toEqual({
      host: "0.0.0.0",
      port: 8787,
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseServiceRoleKey: "service-role-key",
      pollIntervalMs: 3000,
      heartbeatSeconds: 30,
      canvasTrialEnabled: false,
      canvasSessionSecret: undefined,
      canvasDataDir: undefined,
      databaseUrl: undefined,
      canvasIdleEvictionMs: 120_000,
    });
  });

  it.each([
    ["GATEWAY_PORT", "0"],
    ["GATEWAY_PORT", "8787.5"],
    ["GATEWAY_POLL_INTERVAL_MS", "not-an-integer"],
    ["GATEWAY_HEARTBEAT_SECONDS", "-1"],
  ])("rejects an invalid positive integer for %s", (name, value) => {
    expect(() =>
      readGatewayConfig({ ...REQUIRED_ENV, [name]: value }),
    ).toThrow(name);
  });

  it("parses explicit gateway values", () => {
    expect(
      readGatewayConfig({
        ...REQUIRED_ENV,
        GATEWAY_HOST: "127.0.0.1",
        GATEWAY_PORT: "9000",
        GATEWAY_POLL_INTERVAL_MS: "1500",
        GATEWAY_HEARTBEAT_SECONDS: "20",
      }),
    ).toMatchObject({
      host: "127.0.0.1",
      port: 9000,
      pollIntervalMs: 1500,
      heartbeatSeconds: 20,
    });
  });

  it("fails closed when the canvas trial is enabled without its dependencies", () => {
    expect(() =>
      readGatewayConfig({
        ...REQUIRED_ENV,
        MELD_USER_FLOW_TRIAL_ENABLED: "true",
      }),
    ).toThrow("Invalid gateway configuration: canvas trial settings");
  });

  it("rejects the trial in production", () => {
    expect(() =>
      readGatewayConfig({
        ...REQUIRED_ENV,
        NODE_ENV: "production",
        MELD_USER_FLOW_TRIAL_ENABLED: "true",
        MELD_CANVAS_SESSION_SECRET:
          "a-32-byte-minimum-canvas-ticket-secret",
        MELD_CANVAS_DATA_DIR: "/tmp/meld-canvas",
        GATEWAY_DATABASE_URL: "postgresql://localhost/meld",
      }),
    ).toThrow("Invalid gateway configuration: MELD_USER_FLOW_TRIAL_ENABLED");
  });
});

describe("assertHeartbeatWithinLease", () => {
  it("accepts a heartbeat at one third of the lease", () => {
    expect(() =>
      assertHeartbeatWithinLease({
        heartbeatSeconds: 30,
        leaseSeconds: 90,
      }),
    ).not.toThrow();
  });

  it("rejects a heartbeat above one third of the lease", () => {
    expect(() =>
      assertHeartbeatWithinLease({
        heartbeatSeconds: 31,
        leaseSeconds: 90,
      }),
    ).toThrow("GATEWAY_HEARTBEAT_SECONDS must be at most 30");
  });
});
