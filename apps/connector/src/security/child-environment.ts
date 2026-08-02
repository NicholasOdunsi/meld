import path from "node:path";
import { ProviderSchema, type Provider } from "@meld/contracts";
import type { ConnectorPaths } from "../config/paths";
import { managedProviderEnvironment } from "../providers/provider-installer";

/**
 * The environment one managed provider child runs under.
 *
 * It is *constructed*, never filtered. `managedProviderEnvironment` is a
 * three-key allow-list built from `{}` — `PATH`, `HOME`, and the provider's own
 * configuration directory — and this adds exactly one more key, `TMPDIR`. So no
 * API key, auth token, cloud credential, proxy override, or unrelated secret in
 * the connector's own environment can reach a provider process, including the
 * ones nobody has thought of yet.
 *
 * Subtracting was tried once, on the Task 5 login path, and does not work: a
 * deny-list removes only the names someone enumerated, and the misses are the
 * ones that decide how the client authenticates — `CLAUDE_CODE_USE_BEDROCK` and
 * `CLAUDE_CODE_USE_VERTEX` route Claude onto cloud credentials instead of the
 * managed subscription, `AWS_SHARED_CREDENTIALS_FILE` names a credentials file
 * by absolute path that replacing `HOME` does not hide, and `NODE_OPTIONS`
 * injects arbitrary code into what are `#!/usr/bin/env node` shims. Every
 * provider release can add more.
 *
 * `TMPDIR` is the task's own workspace. Left inherited it would be the user's
 * private temporary directory, so anything a client spilled — a prompt cache, a
 * partial transcript — would outlive the task somewhere Meld does not clean.
 * Pointing it at the mode-`0700` workspace means such a spill is owner-only and
 * is removed with the workspace.
 */
export function taskChildEnvironment(
  paths: ConnectorPaths,
  provider: Provider,
  workspaceDirectory: string,
): Readonly<Record<string, string>> {
  const requested = ProviderSchema.parse(provider);
  const workspace = path.resolve(workspaceDirectory);

  if (
    !path.isAbsolute(workspaceDirectory) ||
    path.dirname(workspace) !== path.resolve(paths.tasksRoot)
  ) {
    throw new Error(
      "Refusing to point a provider child at a temporary directory outside Meld's task root.",
    );
  }

  return {
    ...managedProviderEnvironment(paths, requested),
    TMPDIR: workspace,
  };
}
