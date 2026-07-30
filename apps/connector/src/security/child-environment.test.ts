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
      expect(
        Object.keys(taskChildEnvironment(PATHS, provider, WORKSPACE)).sort(),
      ).toEqual(
        ["HOME", "PATH", "TMPDIR", PROVIDER_CONFIG_VARIABLE[provider]].sort(),
      );
    }
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

  it("puts only the managed bin and the system directories on PATH", () => {
    for (const provider of ProviderSchema.options) {
      const { PATH } = taskChildEnvironment(PATHS, provider, WORKSPACE);

      expect(PATH).toBe(
        `${path.dirname(PATHS.runtimeNode)}:/usr/bin:/bin`,
      );
      const segments = (PATH ?? "").split(":");
      expect(segments).toHaveLength(3);
      for (const segment of segments) {
        expect(path.isAbsolute(segment)).toBe(true);
      }
      expect(segments.slice(1)).toEqual(["/usr/bin", "/bin"]);
      expect(segments[0]?.startsWith(PATHS.root)).toBe(true);
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
