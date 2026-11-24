import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import type { ManagedFileSystem } from "../config/connector-config";
import type { ConnectorPaths } from "../config/paths";
import type { CommandRunner } from "../launchd/command-runner";
import { redactDiagnostic } from "../providers/provider-installer";
import { RELEASES } from "../providers/release-manifest";
import { engineLauncherEnvironment } from "./engine-installer";

export const ENGINE_START_TIMEOUT_MS = 30_000;
export const ENGINE_RESTART_DELAYS_MS = [1_000, 5_000, 30_000] as const;
const STOP_GRACE_MS = 5_000;
const HEALTH_POLL_MS = 250;
const HOST = "127.0.0.1";
const HEALTH_PATH = "/.well-known/t3/environment";
const SESSION_ARGS = [
  "auth", "session", "issue",
  "--scope", "orchestration:read",
  "--scope", "orchestration:operate",
  "--scope", "source-control:write",
  "--ttl", "1d",
  "--label", "orion-connector",
  "--subject", "orion-connector",
  "--json",
];

export interface EngineHandle {
  url: string;
  port: number;
  sessionToken: string;
  pid: number;
}

export interface EngineChild {
  pid: number;
  exited: Promise<number | null>;
  kill(signal: NodeJS.Signals): void;
}

export interface EngineSpawner {
  spawn(executable: string, args: string[], env: Record<string, string>): EngineChild;
}

export function engineEnvironment(paths: ConnectorPaths, port: number): Record<string, string> {
  return {
    ...engineLauncherEnvironment(paths),
    PATH: `${path.dirname(paths.runtimeNode)}:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin`,
    T3CODE_PORT: String(port),
  };
}

const SettingsSchema = z.object({
  providerInstances: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export async function writeEngineProviderSettings(paths: ConnectorPaths, fileSystem: ManagedFileSystem): Promise<void> {
  const directory = path.join(paths.engineHome, "userdata");
  const file = path.join(directory, "settings.json");
  const settings = await fileSystem.exists(file)
    ? SettingsSchema.parse(JSON.parse(await fileSystem.readText(file)))
    : {};
  const providerInstances = { ...settings.providerInstances };
  for (const { provider, driver, binary } of [
    { provider: "claude", driver: "claudeAgent", binary: "claude" },
    { provider: "codex", driver: "codex", binary: "codex" },
  ] as const) {
    const instance = z.object({ config: z.record(z.string(), z.unknown()).optional() })
      .passthrough().parse(providerInstances[driver] ?? {});
    providerInstances[driver] = {
      ...instance,
      driver,
      config: {
        ...instance.config,
        binaryPath: path.join(paths.providerCurrent(provider), "node_modules", ".bin", binary),
        homePath: paths.providerHome(provider),
      },
    };
  }
  await fileSystem.makeDirectory(directory);
  const staging = `${file}.next-${randomUUID()}`;
  try {
    await fileSystem.writePrivateText(staging, JSON.stringify({ ...settings, providerInstances }));
    await fileSystem.rename(staging, file);
  } finally {
    await fileSystem.removeTree(staging).catch(() => {});
  }
}

interface EngineProcessDependencies {
  paths: ConnectorPaths;
  fileSystem: ManagedFileSystem;
  runner: CommandRunner;
  spawner: EngineSpawner;
  pickPort(): Promise<number>;
  fetch: typeof fetch;
  sleep(ms: number): Promise<void>;
}

export class EngineProcess {
  private handle: EngineHandle | null = null;
  private child: EngineChild | null = null;
  private lifetime: AbortController | null = null;
  private starting: Promise<EngineHandle> | null = null;
  private stopping: Promise<void> | null = null;
  private recovering: Promise<void> | null = null;
  private refreshing: Promise<EngineHandle> | null = null;

  constructor(private readonly deps: EngineProcessDependencies) {}

  current(): EngineHandle | null {
    return this.handle;
  }

  start(): Promise<EngineHandle> {
    if (this.stopping) return this.stopping.then(() => this.start());
    if (this.handle) return Promise.resolve(this.handle);
    this.lifetime ??= new AbortController();
    return this.startOnce(this.lifetime);
  }

  async refreshSession(expired: EngineHandle): Promise<EngineHandle> {
    const active = await this.start();
    if (active !== expired) return active;
    this.refreshing ??= this.renew(active).finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private async renew(handle: EngineHandle): Promise<EngineHandle> {
    const lifetime = this.lifetime!;
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(ENGINE_START_TIMEOUT_MS)]);
    const sessionToken = await this.issueSession(engineEnvironment(this.deps.paths, handle.port), signal);
    if (this.handle !== handle || signal.aborted) throw new Error("The build engine session is unavailable.");
    this.handle = { ...handle, sessionToken };
    return this.handle;
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.lifetime?.abort();
    this.lifetime = null;
    const child = this.child;
    this.child = null;
    this.handle = null;
    const starting = this.starting;
    const refreshing = this.refreshing;
    this.stopping = Promise.all([
      child ? this.terminate(child) : Promise.resolve(),
      starting?.catch(() => {}),
      refreshing?.catch(() => {}),
    ]).then(() => {}).finally(() => { this.stopping = null; });
    return this.stopping;
  }

  private startOnce(lifetime: AbortController): Promise<EngineHandle> {
    this.starting ??= this.launch(lifetime).finally(() => { this.starting = null; });
    return this.starting;
  }

  private async launch(lifetime: AbortController): Promise<EngineHandle> {
    const { paths, fileSystem, spawner } = this.deps;
    const signal = lifetime.signal;
    const port = await this.deps.pickPort();
    signal.throwIfAborted();
    await writeEngineProviderSettings(paths, fileSystem);
    signal.throwIfAborted();
    const env = engineEnvironment(paths, port);
    const child = spawner.spawn(paths.runtimeNode, [
      paths.engineExecutable, "serve", "--host", HOST, "--port", String(port), "--no-browser",
    ], env);
    this.child = child;

    const startup = new AbortController();
    void child.exited.then(() => {
      startup.abort(new Error("The build engine exited during startup."));
      if (this.child !== child || !this.handle) return;
      this.child = null;
      this.handle = null;
      this.recover(lifetime);
    });
    const startupSignal = AbortSignal.any([signal, startup.signal, AbortSignal.timeout(ENGINE_START_TIMEOUT_MS)]);
    const url = `http://${HOST}:${port}`;
    try {
      await this.waitForHealth(url, startupSignal);
      const sessionToken = await this.issueSession(env, startupSignal);
      startupSignal.throwIfAborted();
      this.handle = { url, port, sessionToken, pid: child.pid };
      return this.handle;
    } catch (error) {
      if (this.child === child) {
        this.child = null;
        await this.terminate(child);
      }
      throw error;
    }
  }

  private async waitForHealth(url: string, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const response = await this.deps.fetch(`${url}${HEALTH_PATH}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(1_000)]),
        redirect: "error",
      }).catch(() => undefined);
      if (response?.ok) {
        const descriptor = await response.json().catch(() => null);
        if (descriptor?.serverVersion !== RELEASES.engine.version || descriptor.orchestrationProtocolVersion !== 2) {
          throw new Error("The build engine reports an unexpected version.");
        }
        return;
      }
      await response?.body?.cancel().catch(() => {});
      await this.deps.sleep(HEALTH_POLL_MS);
    }
    if (signal.reason?.name === "TimeoutError") throw new Error("The build engine did not become healthy in time.");
    signal.throwIfAborted();
  }

  private async issueSession(env: Record<string, string>, signal: AbortSignal): Promise<string> {
    const { paths, runner } = this.deps;
    try {
      const result = await runner.run(paths.runtimeNode, [paths.engineExecutable, ...SESSION_ARGS], { env, signal });
      const parsed = z.object({ token: z.string().min(1) }).safeParse(JSON.parse(result.stdout));
      if (result.code === 0 && parsed.success) return parsed.data.token;
    } catch {
      // Do not forward stdout, stderr, or command errors containing credentials.
    }
    throw new Error("The build engine did not issue a session.");
  }

  private async terminate(child: EngineChild): Promise<void> {
    child.kill("SIGTERM");
    const exited = await Promise.race([child.exited.then(() => true), this.deps.sleep(STOP_GRACE_MS).then(() => false)]);
    if (!exited) {
      child.kill("SIGKILL");
      await child.exited;
    }
  }

  private recover(lifetime: AbortController): void {
    if (this.recovering) return;
    this.recovering = this.retry(lifetime).finally(() => {
      this.recovering = null;
      if (this.lifetime && !this.handle && this.lifetime !== lifetime) this.recover(this.lifetime);
    });
  }

  private async retry(lifetime: AbortController): Promise<void> {
    let attempts = 0;
    while (!lifetime.signal.aborted) {
      const delay = ENGINE_RESTART_DELAYS_MS[Math.min(attempts, ENGINE_RESTART_DELAYS_MS.length - 1)]!;
      await this.deps.sleep(delay);
      if (lifetime.signal.aborted || this.handle) return;
      try {
        await this.startOnce(lifetime);
        return;
      } catch {
        attempts += 1;
      }
    }
  }
}

export function nodeEngineSpawner(paths: ConnectorPaths): EngineSpawner {
  return {
    spawn(executable, args, env) {
      const directory = path.join(paths.engineRoot, "logs");
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const child = spawn(executable, args, { env, stdio: ["ignore", "ignore", "pipe"], detached: true });
      const exited = new Promise<number | null>((resolve) => {
        child.once("error", () => resolve(null));
        child.once("exit", resolve);
      });
      const pid = child.pid;
      if (pid === undefined) throw new Error("Could not launch the build engine.");

      const log = createWriteStream(path.join(directory, "engine.log"), { flags: "a", mode: 0o600 });
      log.on("error", () => {});
      // A token can straddle stream chunks. Redact complete diagnostic lines.
      const diagnostics = createInterface({ input: child.stderr, crlfDelay: Infinity });
      diagnostics.on("line", (line) => log.write(`${redactDiagnostic(line)}\n`));
      diagnostics.once("close", () => log.end());
      return {
        pid,
        exited,
        kill(signal) {
          try {
            process.kill(-pid, signal);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
          }
        },
      };
    },
  };
}

export async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else if (address && typeof address !== "string") resolve(address.port);
        else reject(new Error("Could not select a port for the build engine."));
      });
    });
  });
}
