import path from "node:path";
import { ProviderSchema } from "@meld/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectorPaths } from "../config/paths";
import {
  FORBIDDEN_CHILD_VARIABLES,
  PROVIDER_CONFIG_VARIABLE,
} from "../providers/provider-installer";
import { taskChildEnvironment } from "./child-environment";

const PATHS = connectorPaths("/Users/ada");
const WORKSPACE = path.join(PATHS.tasksRoot, "task-attempt");

/**
 * The exact seeds the brief requires the parent to carry while both children are
 * built.
 */
const BRIEF_SENTINELS = {
  OPENAI_API_KEY: "sentinel",
  CODEX_ACCESS_TOKEN: "sentinel",
  ANTHROPIC_API_KEY: "sentinel",
  ANTHROPIC_AUTH_TOKEN: "sentinel",
  CLAUDE_CODE_OAUTH_TOKEN: "sentinel",
  AWS_SECRET_ACCESS_KEY: "sentinel",
  GOOGLE_APPLICATION_CREDENTIALS: "sentinel",
  HTTP_PROXY: "sentinel",
} as const;

/**
 * Names no deny-list in this repository contains. A filtered environment would
 * carry every one of them into the child; a built one cannot carry any.
 * `CLAUDE_CODE_USE_BEDROCK` and `NODE_OPTIONS` are the two that already slipped
 * the 19-name list once, which is why they are pinned here by name.
 */
const UNLISTED_SENTINELS = {
  CLAUDE_CODE_USE_BEDROCK: "sentinel",
  CLAUDE_CODE_USE_VERTEX: "sentinel",
  AWS_SHARED_CREDENTIALS_FILE: "sentinel",
  NODE_OPTIONS: "sentinel",
  MELD_UNRELATED_TEST_SECRET: "sentinel",
} as const;

const SEEDED = {
  ...Object.fromEntries(
    FORBIDDEN_CHILD_VARIABLES.map((name) => [name, "sentinel"]),
  ),
  ...BRIEF_SENTINELS,
  ...UNLISTED_SENTINELS,
};

const restore = new Map<string, string | undefined>();

beforeEach(() => {
  for (const [name, value] of Object.entries(SEEDED)) {
    restore.set(name, process.env[name]);
    process.env[name] = value;
  }
});

afterEach(() => {
  for (const [name, value] of restore) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  restore.clear();
});

describe("provider child environment", () => {
  it("carries only the managed allow-list into either child", () => {
    for (const provider of ProviderSchema.options) {
      // Claude carries two extra Meld-set tuning knobs; both are constants, not
      // anything inherited from the connector's own environment.
      const claudeTuning =
        provider === "claude"
          ? ["MAX_THINKING_TOKENS", "MAX_STRUCTURED_OUTPUT_RETRIES"]
          : [];
      expect(
        Object.keys(taskChildEnvironment(PATHS, provider, WORKSPACE)).sort(),
      ).toEqual(
        [
          "HOME",
          "PATH",
          "TMPDIR",
          PROVIDER_CONFIG_VARIABLE[provider],
          ...claudeTuning,
        ].sort(),
      );
    }
  });

  // On complex asks Claude burns heavy extended thinking and then exhausts its
  // default five structured-output retries, failing with
  // error_max_structured_output_retries. Bounding the thinking budget and
  // granting extra retries makes the schema-valid reply land reliably. Codex
  // uses neither knob.
  it("gives the managed Claude a bounded thinking budget and extra structured-output retries", () => {
    const claude = taskChildEnvironment(PATHS, "claude", WORKSPACE);
    expect(claude.MAX_STRUCTURED_OUTPUT_RETRIES).toBe("10");
    expect(claude.MAX_THINKING_TOKENS).toBe("8000");

    const codex = taskChildEnvironment(PATHS, "codex", WORKSPACE);
    expect(codex.MAX_STRUCTURED_OUTPUT_RETRIES).toBeUndefined();
    expect(codex.MAX_THINKING_TOKENS).toBeUndefined();
  });

  it("passes no seeded parent variable to either child", () => {
    for (const provider of ProviderSchema.options) {
      const environment = taskChildEnvironment(PATHS, provider, WORKSPACE);

      for (const name of Object.keys(SEEDED)) {
        expect(environment[name]).toBeUndefined();
      }
      expect(Object.values(environment)).not.toContain("sentinel");
    }
  });

  it("puts only Meld-owned bins and the system directories on PATH", () => {
    for (const provider of ProviderSchema.options) {
      const { PATH } = taskChildEnvironment(PATHS, provider, WORKSPACE);
      const segments = (PATH ?? "").split(":");

      // Every segment is absolute; the trailing two are the system dirs.
      for (const segment of segments) {
        expect(path.isAbsolute(segment)).toBe(true);
      }
      expect(segments.slice(-2)).toEqual(["/usr/bin", "/bin"]);
      // Every non-system segment is inside the Meld root.
      for (const segment of segments.slice(0, -2)) {
        expect(segment.startsWith(PATHS.root)).toBe(true);
      }

      if (provider === "claude") {
        // Claude leads with the `security` shim so it never touches the keychain.
        expect(PATH).toBe(
          `${PATHS.securityShimDir}:${path.dirname(PATHS.runtimeNode)}:/usr/bin:/bin`,
        );
      } else {
        expect(PATH).toBe(
          `${path.dirname(PATHS.runtimeNode)}:/usr/bin:/bin`,
        );
      }
    }
  });

  it("keeps HOME, the provider configuration directory, and TMPDIR inside Meld-owned roots", () => {
    for (const provider of ProviderSchema.options) {
      const environment = taskChildEnvironment(PATHS, provider, WORKSPACE);
      const home = PATHS.providerHome(provider);

      expect(environment.HOME).toBe(home);
      expect(environment[PROVIDER_CONFIG_VARIABLE[provider]]).toBe(home);
      expect(environment.TMPDIR).toBe(WORKSPACE);

      for (const value of [
        environment.HOME,
        environment[PROVIDER_CONFIG_VARIABLE[provider]],
        environment.TMPDIR,
      ]) {
        expect(value?.startsWith(`${PATHS.root}${path.sep}`)).toBe(true);
      }
      expect(environment.TMPDIR?.startsWith(`${PATHS.tasksRoot}${path.sep}`)).toBe(
        true,
      );
    }
  });

  it("gives each provider only its own configuration variable", () => {
    expect(
      taskChildEnvironment(PATHS, "codex", WORKSPACE).CLAUDE_CONFIG_DIR,
    ).toBeUndefined();
    expect(
      taskChildEnvironment(PATHS, "claude", WORKSPACE).CODEX_HOME,
    ).toBeUndefined();
  });

  it("refuses a temporary directory outside the managed task root", () => {
    for (const outside of [
      "/tmp",
      "relative/workspace",
      path.join(PATHS.tasksRoot, "..", "escape"),
      PATHS.tasksRoot,
    ]) {
      expect(() => taskChildEnvironment(PATHS, "codex", outside)).toThrow(
        /task/i,
      );
    }
  });
});
