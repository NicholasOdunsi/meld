# Managed Provider Live Acceptance (macOS)

This runbook is the **human-only** live acceptance for the managed-provider
journey. Every automated, fake-backed gate (connector and gateway integration,
the Playwright specs, and `live-smoke.mjs --self-test`) runs in CI and proves the
contracts deterministically. What it cannot prove is that a real,
subscription-authenticated Codex and Claude, installed under Meld's own managed
tree, each produce one visible Discovery Room reply on a real Mac. That is what
this runbook records.

> **Status: PENDING.** As of 2026-08-01 no step below has been performed. An
> agent cannot do this work: official browser login, closing Terminal, and
> reboot are physical, and Codex is usage-limited until **2026-08-05 10:00**.
> Claude's weekly allowance was at ~85% and can be attempted. Do **not** mark the
> managed-provider or Product Agent items in `docs/product-feature-checklist.md`
> complete until the automated gate **and** both live provider checks pass.

## Safety rules (non-negotiable)

- **Never commit** credentials, auth caches, raw prompts, room content, or
  provider output. Record only stage/result status, versions, paths (with the
  home directory redacted to `~`), and pass/fail.
- Use an **isolated approved test account** for each provider, never a personal
  or production subscription.
- The live smoke harness prints only stage/result lines by construction. If you
  run a provider by hand for diagnosis, do not paste its output into any file,
  issue, PR, or chat.
- Nothing in this runbook should be automated in CI. The `--live` modes are
  gated behind `MELD_LIVE_PROVIDER_ACCEPTANCE=1` precisely so they are never
  reached by accident.

## Preconditions

- macOS 13 or newer on the intended hardware.
- A Meld device paired through the app (Settings → AI connections → Connect).
- The managed tree present under `~/Library/Application Support/Meld/` with the
  private Node runtime and the selected provider installed.
- `node` and `jq` available on `PATH` for the live harness.

## What to record

Copy the table below into the acceptance report (kept out of version control if
it would contain anything sensitive; a redacted summary may be committed). Fill
in date, tester, machine, OS build, and result for each item.

| # | Observation | Result | Notes (redacted) |
|---|---|---|---|
| 1 | Managed install paths and versions | | |
| 2 | Official browser login for Codex and Claude | | |
| 3 | Authenticated status after closing the login Terminal | | |
| 4 | LaunchAgent survives closing the bootstrap Terminal | | |
| 5 | Agent reconnects after reboot | | |
| 6 | One live room reply through Codex | | |
| 7 | One live room reply through Claude | | |
| 8 | Sign-out, allowance, cancel, revoke, and uninstall recovery | | |

## Steps

### 1. Private managed install paths and versions

Confirm the managed runtime and both clients live only under Meld's tree, and
record their versions (compare against the pins in
`apps/connector/src/providers/release-manifest.ts`: Node 24.8.0, Codex 0.146.0
= `gpt-5.5`, Claude 2.1.220 = `claude-opus-4-8`).

```sh
ls -l "$HOME/Library/Application Support/Meld/runtime/current/bin/node"
"$HOME/Library/Application Support/Meld/runtime/current/bin/node" --version
ls -l "$HOME/Library/Application Support/Meld/providers/codex/current/node_modules/.bin/codex"
ls -l "$HOME/Library/Application Support/Meld/providers/claude/current/node_modules/.bin/claude"
```

Record the versions and confirm there is **no** `codex`/`claude` resolved from
the system `PATH` being used. No user-level `~/.codex` or `~/.claude` should be
touched.

### 2. Official browser login for Codex and Claude

In the app, connect each provider. Meld opens a visible Terminal running the
official client's own login flow under an isolated managed `HOME`. Complete the
browser sign-in with the approved subscription account for each provider. Do not
capture the device code, token, or any credential.

### 3. Authenticated status after closing the login Terminal

Close the login Terminal window. Confirm Meld reports each provider as
authenticated (Settings → AI connections shows the provider ready), and that the
isolated status probe agrees. You can confirm the isolated login with the live
harness pointed at the managed home and binary:

```sh
export MELD_LIVE_PROVIDER_ACCEPTANCE=1
export MELD_CLAUDE_HOME="$HOME/Library/Application Support/Meld/providers/claude/home"
export MELD_CLAUDE_BIN="$HOME/Library/Application Support/Meld/providers/claude/current/node_modules/.bin/claude"
node scripts/provider-adapters/live-smoke.mjs --live claude
# Repeat with MELD_CODEX_HOME / MELD_CODEX_BIN and --live codex once Codex is
# past its usage limit (2026-08-05).
```

Expect the staged lines ending in `<provider> live smoke PASS`. The harness
never prints the prompt or the provider's answer.

### 4. LaunchAgent survival after closing the bootstrap Terminal

After the connector bootstrap, close the Terminal used to start it. Confirm the
per-user LaunchAgent is still registered and the gateway still shows the device
connected:

```sh
launchctl list | grep com.meld.agent
```

### 5. Reconnect after reboot

Reboot the Mac. Without launching anything by hand, confirm the agent reconnects
and the device shows connected in the app within a minute or two.

### 6. One live room reply through Codex

In a Discovery Room, mention `@Product Agent`, choose **Codex**, and send. Verify
the human message persists, a queued/running state appears, and exactly one
Product Agent reply is posted and visible to a second collaborator's browser.
**Blocked until 2026-08-05** by the Codex usage limit.

### 7. One live room reply through Claude

Repeat step 6 choosing **Claude**. This can be attempted now (allowance
permitting).

### 8. Recovery paths

Exercise and record each recovery behavior:

- **Sign-out**: sign the managed client out; confirm Meld reports it signed out
  and a new task fails closed with an authentication error (never a silent
  fallback).
- **Allowance**: with the subscription at its usage limit, confirm a task
  surfaces a usage-limit state rather than hanging or leaking provider text.
- **Cancel**: cancel a running reply; confirm the provider process tree exits and
  the task settles as cancelled.
- **Revoke**: revoke the device; confirm the socket closes and no further tasks
  dispatch.
- **Uninstall**: run the connector uninstall; confirm the managed tree and the
  LaunchAgent are removed and nothing is left in `~/Library/LaunchAgents`.

## On completion

Only when steps 1–8 are recorded **and** both `--live codex` and `--live claude`
reach PASS may the reviewer check `CON-07`, `CON-08`, and `AGT-01`–`AGT-04` in
`docs/product-feature-checklist.md`, with the date, tester, and environment noted
in the Evidence column. Until then those items remain unchecked.
