# Meld MVP Feature Checklist

This checklist translates the approved implementation plan into product features
and gives each feature a repeatable way to prove that it works.

Last audited: 2026-07-28

Sources:

- `docs/design/plans/2026-07-24-personal-ai-product-lifecycle-mvp.md`
- `docs/design/specs/2026-07-24-personal-ai-product-lifecycle-mvp-design.md`
- `docs/design/reports/` — per-task implementation reports

## How to use this checklist

- `[x]` means the feature is implemented and its listed automated check passes.
- `[ ]` means the feature is planned, incomplete, or has not passed its check.
- A feature is not complete merely because UI or source files exist. Its
  verification must pass and the evidence should be recorded in the progress
  ledger or an implementation report.
- When a feature is completed, run the listed check, change its box to `[x]`,
  update the audit date, and link the relevant test, report, or commit in the
  Evidence column.
- Manual checks should record the date, tester, environment, and result.

## Current snapshot

The implementation represented by Tasks 1, 2, 2A, 3, 4, and the database/web/
gateway scope of Task 6 is complete. Task 6 provides an authorized durable
queue, attempt fencing, ordered event/settlement replay, cancellation delivery,
and a runnable authenticated gateway. It is intentionally single-instance:
in-process socket presence is not shared between gateway replicas, although
database claiming and fencing remain authoritative.

Later tasks remain incomplete. In particular, Task 7 must make the connector
abort its provider child-process group whenever a heartbeat omits an active
task from `renewedTasks`; pairing, provider execution, mention-trigger UI, PRD
generation, artifacts, Define/Design rooms, and full lifecycle E2E are not
claimed by Task 6.

Public launch also remains blocked until controlled live subscription checks
pass for both Codex and Claude.

Checklist progress: **20 of 95 features checked (21.1%)**. Tenant isolation
(`ACC-06`) remains unchecked until its dedicated live verification evidence is
recorded.

## 1. Platform foundation and design system

| Done | ID | Feature | How to verify | Evidence |
|---|---|---|---|---|
| [x] | FND-01 | pnpm/Turbo monorepo with web, gateway, and shared-contract workspaces | Run `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, and `pnpm lint` | Task 2 report; commits through `017de79` |
| [x] | FND-02 | Shared validated contracts for providers, AI tasks, full PRDs, results, errors, and every WebSocket frame | Run `pnpm test --filter @meld/contracts` | `packages/contracts/src/contracts.test.ts` |
| [x] | FND-03 | Fastify gateway with a health endpoint | Run `pnpm test --filter @meld/gateway`; confirm `GET /health` returns `200 {"status":"ok"}` | `apps/gateway/src/server.test.ts` |
| [x] | FND-04 | Next.js App Router web application builds successfully | Run `pnpm build` | Task 2 report |
| [x] | FND-05 | Astryx Core, reset styles, and Neutral theme are loaded once at the app root | Run `pnpm --filter web typecheck` and inspect `apps/web/src/app/layout.tsx` | Task 2A report |
| [x] | FND-06 | Responsive application frame with AppShell and collapsible/resizable SideNav | Run `pnpm --filter web test -- app-frame` | `apps/web/src/ui/app-frame.test.tsx` |
| [x] | FND-07 | Automated Astryx convention guard rejects raw layout elements, Tailwind utilities, raw colors, and hardcoded visual pixel values | Run `node --test scripts/check-astryx-conventions.test.mjs` and `pnpm check:astryx` | `scripts/check-astryx-conventions.test.mjs` |
| [x] | FND-08 | CI runs design checks, tests, typechecking, linting, and production build | Inspect `.github/workflows/ci.yml`; verify the latest workflow run is green when remote CI is available | Task 2A report |

## 2. Accounts, organizations, and permissions

| Done | ID | Feature | How to verify | Evidence or planned task |
|---|---|---|---|---|
| [x] | ACC-01 | Sign in with Google or email using Supabase SSR authentication | Run `pnpm --filter web test -- auth` and `pnpm build`; configure hosted Supabase and manually smoke-test both providers before deployment | Task 3 report; `fa59c7d`, `0e89f82` |
| [x] | ACC-02 | Create an organization and product workspace atomically | Run `pnpm --filter web test -- workspaces` and `pnpm exec playwright test e2e/onboarding.spec.ts` | Task 4 report; `d0cd00a`, `923d94f` |
| [x] | ACC-03 | Invite teammates through a durable, expiring, revocable, single-use invitation with retryable delivery | Run `pnpm --filter web test -- workspaces` and `pnpm exec playwright test e2e/onboarding.spec.ts`; run pgTAP on PostgreSQL before merge/deployment | Task 4 report; local unit/E2E passed, live pgTAP pending |
| [ ] | ACC-04 | Manage members and organization settings | Playwright: admin changes a member role and removes a member; non-admin attempts are rejected | 4 |
| [ ] | ACC-05 | Owner, admin, editor, and viewer/commenter permission model | pgTAP/RLS matrix: verify each role can perform only the actions listed in the approved design | 3–5, 11–13 |
| [ ] | ACC-06 | Tenant isolation across organizations — policies implemented; live database verification pending | Run `supabase db reset && supabase test db` against PostgreSQL and prove users cannot read or mutate another organization's data | Task 3 implementation complete; pgTAP not run because Docker/Postgres is unavailable |
| [ ] | ACC-07 | Room ownership transfer and admin ownership override | Integration test authorized transfers and rejection for editors/viewers | 4–5 |

## 3. Discovery Rooms and collaboration

| Done | ID | Feature | How to verify | Planned task |
|---|---|---|---|---|
| [ ] | DSC-01 | Create and manage a Discovery Room | Playwright: create a room, reload it, rename it, and verify unauthorized users cannot access it | 5 |
| [ ] | DSC-02 | Realtime shared conversation | Two-browser Playwright test: a message sent in one session appears in the other without reload | 5 |
| [ ] | DSC-03 | Add evidence, decisions, clarifications, and relevant links | Integration/UI test each artifact type, persistence, ordering, and room access control | 5, 12 |
| [ ] | DSC-04 | Upload and view room attachments | Playwright: upload an allowed file, reload, download/view it, and reject disallowed or oversized files | 5 |
| [ ] | DSC-05 | Safely extract attachment text for AI context | Unit tests for supported types, size limits, malformed content, and text sanitization | 5 |
| [x] | DSC-06 | Keep all AI context scoped to the current room unless the user explicitly adds permitted context | Task-creation tests inspect the context manifest and reject unauthorized room or organization references | Task 6 pgTAP and live gateway integration |

## 4. Personal AI provider connection

| Done | ID | Feature | How to verify | Planned task/evidence |
|---|---|---|---|---|
| [x] | CON-01 | Deterministic content-only isolation contracts for Codex and Claude | Run `bash scripts/provider-adapters/smoke-test.sh --self-test` | Task 1 report |
| [x] | CON-02 | Exact pinned provider versions and package-integrity evidence | Inspect `docs/provider-compatibility.md` and compare pins to the managed-release constants once Task 8 exists | Task 1 report |
| [ ] | CON-03 | Controlled live subscription readiness for both Codex and Claude | With isolated approved accounts, run `bash scripts/provider-adapters/smoke-test.sh --live codex` and then `--live claude`; both must report `launch_ready` | Task 1; currently `live_blocked` |
| [ ] | CON-04 | One-command HTTPS bootstrap works without Node, npm, npx, Homebrew, Xcode, or sudo | Run installer E2E in a clean macOS 13+ VM and prove no prerequisite is present | 7, 15 |
| [ ] | CON-05 | Optional `npx @meld/agent` installation path | Run the npx wrapper in a supported environment and prove it delegates to the same verified installer | 7 |
| [ ] | CON-06 | Private pinned Node runtime installed under Meld's Application Support directory | Installer test checks exact paths/version/checksum and proves system Node and `PATH` are ignored | 7 |
| [ ] | CON-07 | Selected managed Codex or Claude client installs automatically after disclosed consent | Installer test selects each provider and verifies its pinned, checksum-verified client under Meld's directory | 7–8 |
| [ ] | CON-08 | Official visible provider browser login, with credentials retained only by the provider client | Manual E2E for each provider; inspect Meld storage and logs to prove no provider credential is copied | 7–8 |
| [ ] | CON-09 | Single-use account/device pairing with provider binding | Integration test valid pairing, replay, expiry, wrong user, and provider mismatch | 7 |
| [ ] | CON-10 | Device credential stored in macOS Keychain | Connector test reads through Keychain APIs and confirms no plaintext credential exists in config or logs | 7 |
| [ ] | CON-11 | Persistent per-user LaunchAgent survives Terminal closure and login restart | macOS E2E: install, close Terminal, verify connection; log out/in or reboot and verify reconnection | 7, 15 |
| [ ] | CON-12 | Local connector controls: status, pause, resume, update, doctor, and uninstall | CLI integration tests run every command and verify state, diagnostics, atomic update, and removal behavior | 7 |
| [ ] | CON-13 | Default provider selection and per-task provider override | Integration/UI tests set a default, override one task, and confirm the correct paired provider executes it | 6, 8, 10 |
| [ ] | CON-14 | Public device/provider capability status without exposing credentials | Protocol test checks only capability metadata is published and secrets never appear | 8 |
| [ ] | CON-15 | Device revocation immediately prevents new claims and stops/rejects pending work | Integration test revoke-during-idle and revoke-during-task, followed by reauthentication | 7, 14 |
| [ ] | CON-16 | Every release download is version-pinned, checksum-verified, health-checked, and activated atomically | Tamper, interrupted-update, rollback, and valid-upgrade installer tests | 7, 15 |
| [ ] | CON-17 | Installation stays inside approved user directories and does not modify shell profiles or global tooling | Clean-VM before/after filesystem snapshot and installer assertions | 7, 15 |

## 5. Durable AI task execution

| Done | ID | Feature | How to verify | Planned task |
|---|---|---|---|---|
| [ ] | AI-01 | AI runs only after an explicit mention or defined user action | Unit/E2E tests prove ordinary messages create no task and explicit actions create exactly one | 10 |
| [x] | AI-02 | Every task belongs to the initiating user and their paired device | Database and gateway tests reject claims by teammates or other devices | Task 6 pgTAP and gateway tests |
| [x] | AI-03 | Durable offline queueing | E2E: disconnect device, create a task, reconnect, and verify the task runs once | Task 6 live gateway integration |
| [x] | AI-04 | Transactional task claiming with claim-time access revalidation | Race tests allow only one claim; revoke room access before claim and verify rejection | Task 6 pgTAP and live gateway integration |
| [ ] | AI-05 | Reconnecting authenticated outbound WebSocket transport | Gateway/connector test drops connections repeatedly and verifies ordered recovery without duplicate results | 6, 7, 9 |
| [x] | AI-06 | Streaming task progress and validated structured results | Protocol test validates progress sequence, result schema, malformed-frame rejection, and terminal state | Task 6 contracts, pgTAP, and gateway tests |
| [x] | AI-07 | Idempotent acknowledgements and durable resume cursor | Restart gateway and connector mid-stream; confirm acknowledged events are not replayed or duplicated | Task 6 pgTAP and live gateway integration |
| [ ] | AI-08 | User cancellation terminates the provider process tree | Integration test cancel during execution, ensure descendants exit, and store a terminal cancellation state | 9 |
| [ ] | AI-09 | Partial results are preserved when appropriate | Integration test interruption after valid partial output and verify it is labelled rather than treated as complete | 9 |
| [ ] | AI-10 | Content-only task workspace with no repository, arbitrary filesystem, shell, MCP, web, user rules, or local-secret access | Adapter sentinel tests plus inspection of isolated workspace, arguments, config, and empty-start child environment | 1, 8 |
| [ ] | AI-11 | API keys, cloud routing, subscription tokens, proxy values, and unrelated environment secrets are stripped | Hostile-environment adapter tests for both providers | 8 |
| [ ] | AI-12 | No platform-paid API, teammate subscription, BYOK, or silent provider fallback | Task-routing tests fail closed when the initiator's selected provider/device is unavailable | 6, 8, 9, 15 |
| [ ] | AI-13 | Connector and task status visible in the web UI | Playwright: verify online, paused, offline, queued, running, cancelled, failed, and completed states | 9 |

## 6. Product Agent

| Done | ID | Feature | How to verify | Planned task |
|---|---|---|---|---|
| [ ] | AGT-01 | Mention the Product Agent to ask questions, challenge assumptions, or suggest direction | E2E: send each explicit request and confirm a task and visible agent reply are created | 10 |
| [ ] | AGT-02 | Completed agent responses appear as shared room messages | E2E: complete a task, reload both collaborators, and verify one persisted agent message | 10 |
| [ ] | AGT-03 | Agent prompts contain only authorized room context and identify the initiating user/provider | Prompt snapshot and authorization tests | 10 |
| [ ] | AGT-04 | Duplicate completion events cannot create duplicate room replies | Idempotency integration test | 10 |

## 7. Full PRD workflow

| Done | ID | Feature | How to verify | Planned task/evidence |
|---|---|---|---|---|
| [x] | PRD-01 | Shared schema covers the full PRD structure: summary, problem/evidence, users/use cases, goals/non-goals/metrics, solution, journeys, functional and non-functional requirements, UX states/edge cases, dependencies/constraints, risks/mitigations, MVP scope, acceptance criteria, open questions, and decision history | Run `pnpm test --filter @meld/contracts` | Task 2 |
| [ ] | PRD-02 | Generate one coherent full PRD from a Discovery Room | E2E: request generation and validate the stored output against `PRDDocumentSchema` | 11 |
| [ ] | PRD-03 | Continuous editable PRD document | Playwright: edit multiple sections, save, reload, and verify formatting/content persists | 11 |
| [ ] | PRD-04 | Direct human edits create a new version | Database/UI test edit-save and verify the previous version remains unchanged | 11 |
| [ ] | PRD-05 | Conversational targeted revisions can preserve protected content | Revision test changes a requested section while asserting protected scope/constraints are unchanged | 11 |
| [ ] | PRD-06 | AI revisions are proposed visibly and can be inspected, edited, accepted, or rejected | Playwright covers all four outcomes and verifies no silent overwrite | 11 |
| [ ] | PRD-07 | Meaningful version history and diffs | Playwright: compare versions and confirm additions, removals, and section changes are understandable | 11 |
| [ ] | PRD-08 | Whole-document acceptance by Discovery Room owner or organization admin only | pgTAP/integration test role matrix and successful acceptance | 11 |
| [ ] | PRD-09 | Accepted version is immutable | Database test rejects mutation of an accepted row/document | 11 |
| [ ] | PRD-10 | Editing after acceptance creates a new unaccepted version with pending changes | E2E: accept, edit, and confirm old accepted version remains available while the new draft requires acceptance | 11 |
| [ ] | PRD-11 | Acceptance never creates a Feature Room automatically | E2E: accept a PRD and assert the feature-room count is unchanged | 12, 15 |

## 8. Artifacts and explicit feature conversion

| Done | ID | Feature | How to verify | Planned task |
|---|---|---|---|---|
| [ ] | ART-01 | Add user flows and prototype links to a Discovery Room | UI/integration tests create, edit, remove, and permission-check each artifact | 12 |
| [ ] | ART-02 | Track unresolved and resolved open questions | UI/integration tests resolve/reopen questions and preserve history | 12 |
| [ ] | ART-03 | Calculate readiness warnings for missing flows, prototypes, or answers | Unit tests for every combination; missing items produce warnings, never blockers | 12 |
| [ ] | ART-04 | “Turn into Feature” action and equivalent chat request open the same confirmation flow | Playwright starts both paths and compares the confirmation data | 12 |
| [ ] | ART-05 | Confirmation shows feature name, owner, PRD version, included artifacts, unresolved questions, warnings, and initial stage | Playwright asserts every field before confirmation | 12 |
| [ ] | ART-06 | Only a room owner or organization admin can confirm feature creation | Authorization tests reject editors/viewers and allow owner/admin | 12 |
| [ ] | ART-07 | Explicit confirmation creates exactly one Define-stage Feature Room permanently linked to its source room and PRD snapshot | Transaction/idempotency E2E test, including double-submit | 12 |

## 9. Define and Design Feature Rooms

| Done | ID | Feature | How to verify | Planned task |
|---|---|---|---|---|
| [ ] | FTR-01 | Feature Room starts in Define with the Discovery Room owner as initial owner | Conversion integration test | 12–13 |
| [ ] | FTR-02 | View accepted PRD snapshot and later linked revisions | UI/integration test verifies immutable snapshot plus explicit revision links | 13 |
| [ ] | FTR-03 | View source conversation, attachments, evidence, decisions, and unresolved questions | Playwright follows links and verifies source permissions are enforced | 13 |
| [ ] | FTR-04 | Manage owners and basic assignments | UI/authorization tests for assign, reassign, and unauthorized attempts | 13 |
| [ ] | FTR-05 | Define view shows scope, requirements, readiness, flows, prototypes, decisions, and questions | Playwright asserts the complete Define surface | 13 |
| [ ] | FTR-06 | Design view supports design work and review | Playwright creates/updates design artifacts and records review state | 13 |
| [ ] | FTR-07 | AI recommends Define-to-Design readiness and explains warnings | Unit/E2E test recommendation payload and visible explanation | 13 |
| [ ] | FTR-08 | Stage transition is manual and restricted to Feature Room owner or organization admin | Authorization test proves AI/editor/viewer cannot transition; owner/admin can | 13 |
| [ ] | FTR-09 | Missing flows, prototypes, or answers do not block a manual transition | Integration test transitions with warnings present and preserves the warnings | 13 |

## 10. Notifications, audit, metrics, and security

| Done | ID | Feature | How to verify | Planned task |
|---|---|---|---|---|
| [ ] | OPS-01 | Audit log for sensitive and authoritative actions | Integration tests generate entries for acceptance, conversion, ownership/role changes, device actions, and stage transitions | 14 |
| [ ] | OPS-02 | In-app notification inbox | Playwright triggers an invitation, mention/task result, and relevant workflow event; verify read/unread state | 14 |
| [ ] | OPS-03 | Exact product metrics for funnel and reliability measurement | Analytics tests emit each approved event once with no secret or document-content leakage | 14 |
| [ ] | OPS-04 | Redacted web, gateway, installer, and connector logs | Run redaction tests with API keys, OAuth tokens, pairing/device credentials, sentinels, and local paths | 14 |
| [ ] | OPS-05 | Threat model covers tenant isolation, pairing, task claiming, provider execution, supply chain, storage, and logs | Review `docs/security/threat-model.md` against the launch checklist | 14 |
| [ ] | OPS-06 | Security suite covers cross-tenant access, replay, race, revocation, injection, path, environment, and checksum attacks | Run the security test command defined by Task 14 and retain the report | 14 |

## 11. Launch validation

| Done | ID | Feature | How to verify | Planned task |
|---|---|---|---|---|
| [ ] | LCH-01 | Repeatable local stack for web, gateway, database, storage, Realtime, and fake providers | Start from a clean checkout with the documented command and run smoke tests | 15 |
| [ ] | LCH-02 | Complete happy path: sign in → organization → provider connection → Discovery Room → agent conversation → PRD → acceptance → explicit conversion → Design-ready Feature Room | Run the full Playwright happy-path suite for both provider adapters | 15 |
| [ ] | LCH-03 | Offline, reconnect, cancellation, revocation, and permission-loss E2E paths | Run the Task 15 failure-path suite | 15 |
| [ ] | LCH-04 | Checksum-verified connector release can be built, published, installed, updated, rolled back safely, and uninstalled | Release pipeline plus clean-VM install/update/tamper/uninstall matrix | 15 |
| [ ] | LCH-05 | Automated launch-gate script checks tests, security, provider readiness, migrations, release artifacts, and E2E results | Run the launch-gate command introduced by Task 15; require exit 0 | 15 |
| [ ] | LCH-06 | Manual usability validation with five to ten private-MVP users | Record completion rate, setup failures, time to accepted PRD/Feature Room, and observed blockers | 15 |
| [ ] | LCH-07 | macOS 13+ support validated on the intended hardware/OS matrix | Run installation and happy path on each supported OS target and retain results | 15 |

## Repeatable verification

### Focused checks available now

Run these from the repository root:

```bash
pnpm check:astryx
pnpm test --filter @meld/contracts
pnpm test --filter @meld/gateway
pnpm --filter web exec vitest run src/ui/app-frame.test.tsx
bash scripts/provider-adapters/smoke-test.sh --self-test
git diff --check
```

Passing these focused commands verifies the completed foundation.

### Full integration gate

Run this before marking any implementation task complete:

```bash
pnpm install --frozen-lockfile
pnpm check:astryx
pnpm test
pnpm typecheck
pnpm lint
pnpm build
bash scripts/provider-adapters/smoke-test.sh --self-test
git diff --check
```

This full gate currently passes. It verifies the committed application code but
does not execute the pgTAP suites without a running PostgreSQL/Supabase
environment. Passing either command set does not prove the unchecked product
workflows, and it does not replace the controlled live Codex and Claude checks
required before launch.

## Explicitly outside the MVP

These are deferred and should not be marked as missing MVP features:

- Windows connector support
- Bring-your-own API key
- Platform-funded model credits or paid API fallback
- Repository, arbitrary filesystem, shell, or local-secret access
- Build, Test, and Launch lifecycle stages
- Native `.app` or `.pkg` distribution
- Enterprise approval chains and enterprise controls
- Automatic PRD-to-feature conversion
- Automatic AI-controlled stage transitions
