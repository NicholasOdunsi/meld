import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ManagedFileSystem } from "../config/connector-config";
import type { CommandOptions } from "../launchd/command-runner";
import { RELEASES } from "../providers/release-manifest";
import { connectorPaths } from "../config/paths";
import { engineEnvironment, EngineProcess, ENGINE_RESTART_DELAYS_MS, writeEngineProviderSettings } from "./engine-process";

const paths = connectorPaths("/Users/test");

function fakeSettings(existing?: unknown) {
  return {
    exists: vi.fn(async () => existing !== undefined),
    readText: vi.fn(async () => JSON.stringify(existing)),
    writePrivateText: vi.fn(async (_file: string, _contents: string) => {}),
    makeDirectory: vi.fn(async () => {}),
    removeTree: vi.fn(async () => {}),
    rename: vi.fn(async () => {}),
    createSymlink: vi.fn(async () => {}),
    readSymlink: vi.fn(async () => undefined),
    copyFile: vi.fn(async () => {}),
    openPrivateFile: vi.fn(),
  } satisfies ManagedFileSystem;
}

function harness(options: { healthyAfter?: number; sessionOutput?: string; version?: string } = {}) {
  let healthCalls = 0;
  const kills: string[] = [];
  let resolveExit: (code: number | null) => void = () => {};
  const spawner = {
    spawn: vi.fn(() => ({
      pid: 4242,
      exited: new Promise<number | null>((resolve) => { resolveExit = resolve; }),
      kill: (signal: NodeJS.Signals) => { kills.push(signal); resolveExit(0); },
    })),
  };
  const fetchMock = vi.fn(async () => {
    healthCalls += 1;
    if (healthCalls <= (options.healthyAfter ?? 0)) return new Response(null, { status: 503 });
    return Response.json({ serverVersion: options.version ?? RELEASES.engine.version, orchestrationProtocolVersion: 2 });
  });
  const runner = { run: vi.fn(async (_command: string, _args: string[], _options?: CommandOptions) => ({ stdout: options.sessionOutput ?? '{"token":"t3-session-abc"}', code: 0 })) };
  const engine = new EngineProcess({
    paths, fileSystem: fakeSettings(), runner, spawner, pickPort: async () => 38917, fetch: fetchMock, sleep: async () => {},
  });
  return { engine, spawner, fetchMock, runner, kills, exit: (code: number | null) => resolveExit(code) };
}

describe("engineEnvironment", () => {
  it("is private, local and quiet", () => {
    const env = engineEnvironment(paths, 38917);
    expect(env).toMatchObject({
      T3CODE_HOME: paths.engineHome,
      T3CODE_PORT: "38917",
      T3CODE_TELEMETRY_ENABLED: "false",
      T3CODE_OTEL_SDK_DISABLED: "true",
    });
    expect(env.T3CODE_HOME).not.toContain("/.t3");
    expect(Object.keys(env)).not.toContain("T3CODE_LAN");
  });
});

describe("EngineProcess", () => {
  it("starts, waits for health, then issues a session", async () => {
    const { engine, spawner, runner } = harness({ healthyAfter: 2 });
    const handle = await engine.start();
    expect(handle).toEqual({ url: "http://127.0.0.1:38917", port: 38917, sessionToken: "t3-session-abc", pid: 4242 });
    expect(spawner.spawn).toHaveBeenCalledExactlyOnceWith(
      paths.runtimeNode,
      [paths.engineExecutable, "serve", "--host", "127.0.0.1", "--port", "38917", "--no-browser"],
      expect.objectContaining({ T3CODE_HOME: paths.engineHome }),
    );
    expect(runner.run.mock.calls[0]?.[1]?.slice(1, 4)).toEqual(["auth", "session", "issue"]);
  });

  it("reuses a running engine", async () => {
    const { engine, spawner } = harness();
    await engine.start();
    await engine.start();
    expect(spawner.spawn).toHaveBeenCalledTimes(1);
  });

  it("stops only the process it started", async () => {
    const { engine, kills } = harness();
    await engine.start();
    await engine.stop();
    expect(kills).toEqual(["SIGTERM"]);
    expect(engine.current()).toBeNull();
  });

  it("restarts with backoff after an unexpected exit", async () => {
    const { engine, spawner, exit } = harness();
    await engine.start();
    exit(1);
    await vi.waitFor(() => expect(spawner.spawn).toHaveBeenCalledTimes(2));
    expect(ENGINE_RESTART_DELAYS_MS[0]).toBe(1_000);
  });

  it("never keeps a session it could not parse", async () => {
    const { engine, kills } = harness({ sessionOutput: "not json" });
    await expect(engine.start()).rejects.toThrow("session");
    expect(kills).toEqual(["SIGTERM"]);
    expect(engine.current()).toBeNull();
  });

  it("rejects a mismatched health descriptor before minting a session", async () => {
    const { engine, kills, runner } = harness({ version: "0.0.1" });
    await expect(engine.start()).rejects.toThrow("unexpected version");
    expect(runner.run).not.toHaveBeenCalled();
    expect(kills).toEqual(["SIGTERM"]);
  });

  it("shares concurrent start attempts", async () => {
    const { engine, spawner } = harness({ healthyAfter: 1 });
    const [first, second] = await Promise.all([engine.start(), engine.start()]);
    expect(first).toBe(second);
    expect(spawner.spawn).toHaveBeenCalledTimes(1);
  });

  it("can stop during startup before spawning", async () => {
    const { engine, spawner } = harness();
    const startup = engine.start();
    const assertion = expect(startup).rejects.toThrow();
    await engine.stop();
    await assertion;
    expect(spawner.spawn).not.toHaveBeenCalled();
    expect(engine.current()).toBeNull();
  });
});


describe("writeEngineProviderSettings", () => {
  it("keeps existing settings and links the managed provider binaries and homes", async () => {
    const anotherProvider = { driver: "other", enabled: false };
    const files = fakeSettings({
      appearance: "dark",
      providerInstances: { other: anotherProvider, claudeAgent: { config: { additional: true } } },
    });

    await writeEngineProviderSettings(paths, files);
    const [staging, data] = files.writePrivateText.mock.calls[0]!;
    expect(files.rename).toHaveBeenCalledWith(staging, path.join(paths.engineHome, "userdata", "settings.json"));
    expect(JSON.parse(data)).toEqual({
      appearance: "dark",
      providerInstances: {
        other: anotherProvider,
        claudeAgent: {
          driver: "claudeAgent",
          config: {
            additional: true,
            binaryPath: path.join(paths.providerCurrent("claude"), "node_modules", ".bin", "claude"),
            homePath: paths.providerHome("claude"),
          },
        },
        codex: {
          driver: "codex",
          config: {
            binaryPath: path.join(paths.providerCurrent("codex"), "node_modules", ".bin", "codex"),
            homePath: paths.providerHome("codex"),
          },
        },
      },
    });
  });
});
