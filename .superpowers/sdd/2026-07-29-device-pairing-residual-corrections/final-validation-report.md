# Residual Corrections Final Validation

Date: 2026-07-29

Previously validated, later blocked head: `3031fda`

Whole-branch reviewed head: `7342c63`

Final validated source head: `feeb834`

## Outcome

All scoped corrective tasks passed independent review and fix-only re-review:

- SQL lock ordering and mutation-sensitive concurrency evidence: clean.
- Stateful Keychain compensation: clean after one Important edge-case fix.
- Pairing-route configuration handling and evidence corrections: clean after
  one optional Minor diagnostic-classification fix.
- Relocated production agent and ambiguous Keychain probe cleanup: clean after
  the whole-branch review found one Important and one Minor.
- Pairing-code quota recovery: clean after the whole-branch review found one
  Important and the scoped review required stronger mutation-sensitive tests.

The complete repository, database, live-integration, build, and browser gates
pass at `feeb834`.

The earlier `3031fda` validation was not treated as final after a fresh
whole-branch review at `7342c63` found that the installed `agent.mjs` retained
workspace-only imports and that quota exhaustion discarded the only visible
usable pairing code. Those findings are addressed by `a62e03f`, `b49fb97`, and
`feeb834`.

## Automated evidence

```text
pnpm test
  PASS
  @meld/contracts 28 tests
  @meld/device-auth 8 tests
  @meld/gateway 79 tests
  @meld/connector 96 tests plus relocated production bundle smoke
  @meld/web 302 tests

pnpm typecheck
  5/5 packages successful

pnpm lint
  5/5 packages successful

pnpm build
  gateway, connector, and web successful

pnpm dlx supabase@2.109.1 test db
  6 files, 383 tests, PASS

pnpm --filter @meld/gateway test:integration
  2 files, 14 tests passed

pnpm --filter @meld/connector test:integration
  1 file, 7 tests passed

NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=e2e-placeholder-key \
MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY=e2e-placeholder-server-key \
pnpm exec playwright test --trace off
  4 tests passed
```

Gateway and connector live tests used the complete local Supabase fixture
environment. Earlier invocations missing required environment variables
stopped before behavioral execution; the complete-environment reruns above are
the final evidence.

The first final-head Playwright run passed three tests, then failed while
writing a Playwright artifact ZIP because the host volume reached `ENOSPC`;
the failure was not an application assertion. Generated `.next`, `dist`, and
`test-results` outputs from that run were removed. The complete four-test suite
was then rerun with trace recording disabled and passed with exit code zero.
Generated outputs were removed again afterward. Source files and the preserved
`supabase/.branches/` and `supabase/.temp/` directories were not removed.

## Final fix-only review

The final fix-only whole-branch review at `a2f7860` returned **ship**:

- all two Important findings and the probe-cleanup Minor from the earlier
  no-ship review are addressed;
- no new Critical or Important findings remain;
- the three real-Mac observations remain pending rather than being claimed by
  automation.

One non-blocking Minor remains: the bundle smoke's static source scan covers
ESM imports but not CommonJS `require`/esbuild `__require` specifiers. The
current guarded optional `ws` native helpers fall back safely, and the
relocated artifact executes to application configuration loading. A future
hardening can statically scan and allowlist those CommonJS specifiers too.

## Known environment caveats

- System Supabase CLI `2.110.0` retains the pre-existing
  `realtime.messages` ownership failure during a literal reset. The pinned
  `2.109.1` database test path passes and this work does not claim to fix that
  unrelated issue.
- The optional local vector sidecar remains excluded because of the host's
  existing Colima bind-mount issue.

## Pending manual macOS acceptance

- [ ] Pairing through the CLI creates a visible `com.meld.agent` entry in
  Keychain Access.
- [ ] After closing Terminal, `launchctl list | grep com.meld.agent` still
  shows the agent and the gateway reports the device connected.
- [ ] After reboot, the agent reconnects without user action.
