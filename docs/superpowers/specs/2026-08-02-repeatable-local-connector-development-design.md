# Repeatable Local Connector Development Design

**Date:** 2026-08-02
**Status:** Approved for implementation planning

## Problem

Meld's local development pairing flow currently fails in three related ways:

1. The pairing command rendered in the web app includes an argument separator
   before `pair`. The package script forwards that separator to `tsx`, so the
   connector receives `--` as its command and prints the CLI usage message.
2. During first-time managed provider setup, the running connector installs a
   private Node runtime, rewrites its LaunchAgent plist, and then calls
   `launchctl bootout` on its own job. macOS terminates the connector before it
   can execute the following `bootstrap`, leaving the plist on disk but the job
   unloaded. The durable provider setup remains at `installing` until somebody
   bootstraps the job manually.
3. Conductor workspaces have no shared run configuration. Developers can start
   several workspaces against the same fixed ports, database, Keychain item,
   Application Support directory, and LaunchAgent label. Running the pairing
   command from outside a workspace can also select every checkout containing
   `@meld/connector`.

The local connector is machine-level state and must not be installed or paired
again for every git branch.

## Goals

- Pair a Mac once and reuse that device from every local branch that points at
  the same Meld database.
- Complete first-time managed provider setup without unloading the connector
  midway through installation.
- Render a pairing command whose arguments reach the connector CLI correctly.
- Give every Conductor workspace the same setup, run, status, and recovery
  commands.
- Permit many workspaces to exist while allowing only one Meld web/gateway
  runtime to run locally at a time.
- Preserve the existing machine-level storage locations and credential model.

## Non-goals

- Publishing the connector to npm or finalizing the future `npx` interface.
- Running several local gateways or connectors concurrently.
- Giving each git branch separate device credentials, managed providers, or
  Application Support directories.
- Changing the production pairing protocol or database schema.
- Automatically pairing during Conductor workspace setup.

## Chosen Design

### Machine-global connector lifecycle

The connector remains a singleton identified by `com.meld.agent`. Its config,
copied bundle, managed runtime, managed providers, logs, and Keychain credential
remain under the existing machine-level locations. Creating a workspace only
installs repository dependencies; it never pairs, overwrites the installed
connector, rotates a device credential, or changes the LaunchAgent.

All local workspaces use the same Supabase project and the same fixed gateway
address. Consequently, the active device already returned by the application
allows a newly created branch to skip the first-pair flow.

### Safe private-runtime activation

`updateLaunchAgentNodePath` will still validate the candidate Node executable,
render the desired plist, and write it atomically. When the main LaunchAgent is
already loaded, activation will not boot out or restart that same job. The
currently running connector continues under its existing supported Node
process, completes provider installation, and remains connected to the gateway.

The rewritten plist becomes authoritative on the next ordinary LaunchAgent
load, such as the next login or a deliberate external restart. At that point
macOS starts the connector with the verified private runtime. This deferral is
safe because pairing itself already executes the connector under a supported
Node version, while the managed provider commands use the private runtime path
directly after installation.

If the LaunchAgent is not loaded, runtime activation writes the plist and
bootstraps it. Failures preserve or restore the previous plist using the
existing rollback guarantees. Activation must never leave a previously loaded
and running connector unloaded.

### Pairing command

The browser default becomes:

```text
pnpm --filter @meld/connector cli pair --join <code>
```

The redundant separator before `pair` is removed. The existing
`NEXT_PUBLIC_MELD_PAIR_COMMAND` override remains available for environments
that need an absolute checkout path or a future published command.

The connector CLI may also normalize one leading `--` before dispatch as a
backward-compatibility measure, so an already-open page or stale build cannot
fail solely because it contains the old command. Normalization applies to one
leading separator only and does not weaken validation of subcommand arguments.

### Conductor workspace configuration

A shared `.conductor/settings.toml` will define:

- `scripts.setup = "pnpm install"`;
- `scripts.run_mode = "nonconcurrent"` because local workspaces share fixed
  ports, one database, and one connector;
- one default local development command that exports
  `apps/web/.env.local` and starts `web` plus `@meld/gateway` in one process
  group;
- a connector-status command that reads the machine-level installation;
- a recovery command that bootstraps the existing plist only when the service
  is absent.

The development command does not run the pairing CLI. The recovery command
does not create credentials or rebuild/copy a branch bundle. Static `.env`
files continue to use Conductor's Files to copy behavior.

## Data and Process Flow

### First setup on a Mac

1. The web app creates a pairing code.
2. The developer runs the corrected CLI command from the repository workspace.
3. The CLI redeems the code, saves the credential, copies the connector bundle,
   and installs the LaunchAgent.
4. The gateway dispatches the durable provider setup request.
5. The connector installs and validates the private Node runtime.
6. The connector writes the future private-runtime plist without unloading its
   currently running job.
7. Provider installation, authentication, and verification complete; progress
   reaches the browser through the existing durable setup record.

### New branch or Conductor workspace

1. Conductor copies the local environment files and runs `pnpm install`.
2. The developer starts the single allowed local runtime.
3. The existing LaunchAgent connects to that gateway using the credential in
   Keychain.
4. The web app lists the existing active device and does not request another
   pairing operation.

### Recovery

If the plist exists but the LaunchAgent is not registered, the explicit
recovery script bootstraps it. If no plist exists, recovery exits with a clear
instruction to perform first-time pairing. It does not silently synthesize or
replace credentials.

## Error Handling

- Invalid CLI argument shapes continue to print the existing usage message.
- A missing connector build continues to fail before pairing-code redemption.
- Candidate private Node validation failures leave both the current plist and
  the running connector unchanged.
- Atomic plist write failures surface as setup failures without unloading the
  current job.
- Bootstrap failures for an initially unloaded job restore the prior plist when
  one existed and report the launchctl diagnostic.
- The Conductor recovery command distinguishes an absent plist from an unloaded
  service and never pairs automatically.
- Nonconcurrent run mode prevents a second workspace from taking ports 3000 or
  8787 while another workspace is active.

## Testing

### Connector unit tests

- A loaded LaunchAgent receives an atomic private-runtime plist update without
  any `bootout` or `bootstrap` invocation.
- An unloaded LaunchAgent is bootstrapped after the validated plist is written.
- Validation and write failures preserve the existing plist and do not stop a
  loaded job.
- The CLI accepts the canonical `pair --join CODE` argument vector.
- The CLI accepts one legacy leading `--` and still rejects malformed vectors.

### Web tests

- Pairing instructions render the command without `cli -- pair`.
- Existing onboarding and device-management pairing-command assertions are
  updated together.
- The environment override remains covered.

### Configuration checks

- The repository settings file parses against the Conductor repository schema.
- The combined development command starts web and gateway with the expected
  environment in a single process group.
- The connector status and recovery commands work when the job is running,
  unloaded with a plist present, and never installed.

### Regression verification

Run the connector, web feature, typecheck, lint, and Astryx convention checks
affected by the change. Perform one live smoke test in which the LaunchAgent is
loaded, runtime activation is invoked, the connector stays registered, and the
provider setup reaches `completed` without manual `launchctl bootstrap`.

## Release Direction

The future published CLI should preserve this lifecycle boundary:

- `install` or `update` changes executable assets and reloads them safely;
- `pair` creates a device credential only for a new or deliberately replaced
  Mac;
- `status` inspects the existing installation;
- provider and runtime updates never rotate the device credential.

This design does not add those public commands now, but it keeps the local
workflow compatible with them.
