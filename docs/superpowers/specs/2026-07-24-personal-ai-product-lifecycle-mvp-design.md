# Personal-AI Product Lifecycle MVP Design

**Date:** 2026-07-24  
**Status:** Approved; updated for CLI-installed connector and private managed runtime

## 1. Summary

The MVP is a collaborative product-discovery platform for small product teams. It turns an unstructured Discovery Room conversation into a full, reviewable PRD and then, when the team explicitly decides to proceed, into a Feature Room supporting Define and Design work.

AI usage is user-funded by design. The platform never supplies model credits, never invokes a model with a platform-owned API key, and never silently transfers a task to another teammate's subscription. Each AI task runs locally through the initiating user's authenticated Codex or Claude subscription.

The primary success condition is:

> A small product team can move from an unstructured conversation to an accepted full PRD and a Design-ready Feature Room in one working session, using a personal Codex or Claude subscription and no API key.

## 2. Product principles

1. **No platform-funded AI**
   The company pays ordinary software infrastructure costs but never pays users' model-token costs.

2. **AI acts explicitly**
   The Product Agent runs only when a user mentions it or requests a defined action. It does not consume subscription allowance proactively.

3. **Usage belongs to the initiator**
   The person who initiates an AI task supplies the provider, device, and subscription used for that task.

4. **Conversation becomes a durable product artifact**
   Discovery discussion, evidence, decisions, PRD revisions, and feature conversion remain connected.

5. **Human decisions remain authoritative**
   AI can draft, revise, and recommend. Humans accept the PRD, decide whether to create a feature, and move the feature between stages.

6. **Missing artifacts inform rather than block**
   Incomplete user flows, prototypes, and unresolved questions create warnings, not hard gates.

7. **Local access stays narrow**
   The MVP connector generates product content. It does not receive repository access, arbitrary filesystem access, shell access, or local-secret access.

## 3. Target user and MVP boundary

The initial users are product managers and designers in small product teams. They need a normal product experience after a one-time connector setup; they should not need to leave a terminal window open.

The private MVP supports macOS first. Windows follows after the core workflow and connector experience are validated.

The MVP validates:

- Collaborative product discovery
- Mention-triggered AI participation
- Full PRD creation and conversational revision
- Explicit PRD acceptance
- Optional enrichment with flows and prototypes
- Intentional feature creation
- Define and Design stage continuity
- Personal-subscription AI execution without API keys

It does not attempt to validate repository execution, coding agents, deployment, or the full software-delivery lifecycle.

## 4. Core user journey

### 4.1 Workspace setup

1. A user signs in with Google or email.
2. The user creates or joins an organization.
3. The user creates a product workspace and invites teammates.
4. The user copies one bootstrap command from the web app. The command works when Node, npm, and npx are absent, requires no `sudo`, and exits after installing and starting the connector.
5. The connector detects Codex and Claude availability. If a client is missing, setup offers an explicit **Install for me** action that uses the provider's supported distribution, followed by the provider's official browser authentication flow.
6. The user connects at least one provider, chooses it as their default, and may connect the other provider later.

The connector does not extract provider credentials. Any managed provider installation remains isolated under Meld's application-support directory and is removable with Meld. "Both providers supported" means either can be connected through the same setup experience; a user does not have to install or authenticate both.

### 4.2 Discovery conversation

1. A user creates a Discovery Room.
2. Teammates discuss the idea, attach evidence, record decisions, and add relevant links.
3. A user mentions the Product Agent to ask a question, challenge an assumption, or suggest a direction.
4. The task uses that user's default provider unless they explicitly override it.
5. The response is posted visibly into the shared room.

The Product Agent never joins a conversation or spends subscription allowance without an explicit mention or action.

### 4.3 PRD generation and review

1. An editor asks the Product Agent to generate a full PRD from the room.
2. The platform creates a room-scoped context package.
3. The user's connector executes the task through their selected provider.
4. The resulting PRD appears as one editable document.
5. Team members review it, edit it directly, or request conversational revisions.
6. A revision instruction may protect content, for example: "Change the user flow, preserve the scope, and do not remove the stated constraints."
7. The platform records document versions and shows meaningful changes.
8. The room owner or an organization admin accepts the complete PRD.

Acceptance applies to the whole PRD. There is no section-by-section approval workflow.

The accepted version is immutable. Editing PRD content after acceptance creates a new unaccepted draft and marks the room as having pending changes. That newer version must be accepted before it can be selected for a new Feature Room; the prior accepted version remains available in history.

### 4.4 Enrichment and feature conversion

An accepted PRD remains in its Discovery Room. Acceptance means that the document is ready, not that the organization has committed to building it.

The team may continue to add:

- User flows
- Prototype links
- Evidence
- Decisions
- Clarifications
- Resolved open questions

When ready, an authorized user selects **Turn into Feature** or asks for the same action through chat. A conversational request opens the same confirmation experience; it never creates a Feature Room silently.

The confirmation shows:

- Feature name
- Owner
- Included PRD version
- Included artifacts
- Unresolved questions
- Readiness warnings
- Initial stage

Missing flows, prototypes, or answers create warnings. After confirmation, the platform creates a Feature Room in the Define stage and links it permanently to its source Discovery Room.

### 4.5 Feature Room

The MVP Feature Room supports:

- Accepted PRD snapshot and later linked revisions
- Source conversation and attachments
- Decisions and unresolved questions
- Owners and basic assignments
- User flows and prototype links
- Define-stage readiness
- Design-stage work and review
- AI recommendations for stage readiness

The Discovery Room owner becomes the initial Feature Room owner. Stage transitions are manual and may be performed by the Feature Room owner or an organization admin. AI may recommend moving from Define to Design and explain why, but it cannot perform the transition.

## 5. PRD structure

The Product Agent generates one coherent PRD with:

- Executive summary
- Problem statement and supporting evidence
- Target users and use cases
- Goals, non-goals, and success metrics
- Proposed solution
- User journeys
- Functional requirements
- Non-functional requirements
- UX states and edge cases
- Dependencies and constraints
- Risks and mitigations
- MVP scope
- Acceptance criteria
- Open questions
- Decision history

The PRD is presented as a complete document rather than an approval form made of independent sections. Internally, the editor may retain section boundaries so targeted AI revisions can update one portion without rewriting unrelated content.

AI revisions never silently overwrite the authoritative version. A requested revision creates a visible proposed change that the editor can inspect, edit, accept, or reject. Direct human edits create a new document version.

## 6. Roles and permissions

The MVP uses a deliberately small permission model.

### Organization admin

- Manages members and organization settings
- Can accept a PRD
- Can turn an accepted PRD into a feature
- Can change room ownership
- Can revoke paired devices

### Discovery Room owner

- Manages the room
- Can accept the PRD
- Can turn an accepted PRD into a feature
- Can transfer ownership

### Editor

- Participates in discussion
- Adds evidence and attachments
- Edits the PRD
- Requests AI responses and revisions using their own connector
- Adds flows and prototype links

### Viewer/commenter

- Reads room content and PRD versions
- Adds comments where permitted
- Cannot edit, accept, or create a feature

Editing access does not grant final acceptance authority. Designated and multi-step approvers are deferred until customer demand demonstrates the need.

## 7. AI access architecture

### 7.1 Chosen approach

The primary architecture is a CLI-installed persistent local connector, not a native macOS application. Installation begins with a one-line HTTPS bootstrap command. The bootstrap downloads a pinned private Node runtime and the Meld connector into `~/Library/Application Support/Meld/`, verifies published checksums, writes a per-user LaunchAgent, starts it with `launchctl`, and exits. Closing Terminal does not stop the connector because `launchd`, rather than the shell, owns the process.

The connector always uses Meld's private runtime, even when a compatible system Node is present. This avoids login-time `PATH` failures, Node version-manager differences, global-package permission errors, and changes to the user's development environment. It does not install Homebrew, modify the system Node installation, change shell startup files, or require `sudo`.

Browser BYOK is deferred. It must never become a hidden fallback.

### 7.2 Connector behavior

The macOS connector:

- Pairs with the user's account through a short-lived, single-use code
- Installs an auto-starting per-user LaunchAgent
- Detects supported local provider clients
- Offers explicit managed provider installation when a client is absent
- Guides official Codex and Claude browser authentication
- Lets the user select a default provider
- Maintains an encrypted outbound connection to the connector gateway
- Receives only tasks assigned to that user and device
- Invokes the chosen provider through its official local client
- Streams task progress and output to the web platform
- Supports cancellation
- Reconnects automatically after restart or network loss
- Reports health and version compatibility
- Can be paused, disconnected, updated, and revoked

Provider credentials remain managed by the official provider client and operating-system credential facilities. The connector does not read, copy, upload, or proxy those credentials.

The primary installation command is:

```sh
curl -fsSL https://get.meld.app/install.sh | sh -s -- --pair ABCD-EFGH
```

The bootstrap is intentionally small and auditable. It downloads only version-pinned artifacts, verifies SHA-256 checksums before activation, installs through an atomic version switch, and leaves the prior connector version available for automatic rollback. The pairing code expires after ten minutes and is single-use, so a stale shell-history entry cannot pair another device.

The installed control executable lives at `~/Library/Application Support/Meld/bin/meld`. The web app remains the primary control surface; the local executable supports `status`, `pause`, `resume`, `update`, `doctor`, and `uninstall` for support and recovery without requiring a global `PATH` change.

Current official product documentation supports the technical premise:

- Codex supports ChatGPT subscription authentication, cached session refresh, and non-interactive CLI execution.
- Claude Code supports paid-plan authentication and non-interactive structured output.

Relevant documentation:

- [OpenAI authentication](https://learn.chatgpt.com/docs/auth)
- [OpenAI CLI commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
- [Claude subscription access](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)
- [Claude CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage)

Technical CLI support does not by itself establish permanent permission for every commercial third-party orchestration pattern. Provider terms, branding requirements, authentication behavior, and automation limits must be validated before public launch and rechecked as provider policies change.

### 7.3 Provider selection

Each user chooses a default provider during setup. For any task, they may explicitly override that choice.

There is no silent provider rerouting. If the chosen provider cannot execute the task, the task pauses and presents the available choices to the user.

### 7.4 User-owned execution

Every task records:

- Initiating user
- Organization and room
- Selected provider
- Selected device
- Context scope
- Creation and execution times
- Current status
- Resulting artifact

A task may run only on a device paired to the initiating user. Organization administrators cannot redirect it to another teammate's subscription.

## 8. Context and task lifecycle

### 8.1 Context boundaries

The default AI context contains only:

- Current Discovery Room messages
- Attachments the initiating user may access
- Current PRD and relevant prior versions
- Room evidence and decisions
- Explicitly selected product context
- The current task instruction

Unrelated rooms and organization-wide history are excluded unless the user explicitly adds them and has access.

Queued tasks revalidate the initiating user's access immediately before execution. If access changed, the task fails without sending stale context to the device.

### 8.2 Task states

AI tasks use these user-visible states:

- Queued
- Waiting for device
- Ready to run
- Running
- Needs reauthentication
- Usage limit reached
- Needs review
- Completed
- Cancelled
- Failed

If a device is offline, the task remains queued and can be cancelled. When the device reconnects, the task may run automatically after permission and context revalidation.

### 8.3 Data flow

1. The web client submits an explicit agent action.
2. The server checks room permission and provider/device ownership.
3. The server creates the scoped context package and durable task.
4. The connector gateway notifies the paired device or keeps the task queued.
5. The connector claims the task with its device credential.
6. The connector executes the provider client in an app-owned temporary workspace.
7. Progress events stream through the gateway.
8. The platform stores the result as an agent message or proposed PRD revision.
9. Human review determines whether a proposed revision becomes authoritative.
10. Temporary local task material is deleted according to the connector's cleanup policy.

## 9. System components

### Web client

Provides onboarding, Discovery Rooms, PRD editing and review, artifacts, feature conversion, Feature Rooms, notifications, and connector status.

### Workspace service

Owns organizations, members, roles, invitations, and organization-level permissions.

### Discovery service

Owns rooms, participants, messages, mentions, attachments, evidence, decisions, and room ownership.

### PRD service

Owns PRD documents, versions, proposed AI revisions, diffs, acceptance state, and accepted-version identity.

### Feature service

Owns feature conversion, source links, warnings, Feature Room owners, Define and Design stages, artifacts, and owner/admin-controlled stage transitions.

### AI task broker

Owns durable tasks, context scope, status transitions, cancellation, retries, provider/device selection, and result registration.

### Connector gateway

Authenticates paired devices, maintains outbound device sessions, advertises available tasks, and carries progress events.

### Notification service

Owns mentions, review requests, task-state notifications, offline-device notices, and reauthentication prompts.

### Audit service

Records membership changes, PRD acceptance, feature conversion, stage transitions, device events, and AI task activity.

### Persistent storage

PostgreSQL stores structured product and collaboration data. Object storage stores attachments and artifact files. A durable queue or workflow engine manages offline and long-running tasks.

## 10. Core data model

The MVP requires the following principal records:

- `Organization`
- `User`
- `Membership`
- `Invitation`
- `Product`
- `DiscoveryRoom`
- `RoomParticipant`
- `Message`
- `Mention`
- `Attachment`
- `Evidence`
- `Decision`
- `PRD`
- `PRDVersion`
- `PRDRevisionProposal`
- `PRDAcceptance`
- `Artifact`
- `UserFlowArtifact`
- `PrototypeLink`
- `Feature`
- `FeatureStage`
- `ReadinessWarning`
- `Assignment`
- `AIConnection`
- `ExecutionDevice`
- `AITask`
- `AITaskEvent`
- `ProviderInvocation`
- `Notification`
- `AuditEvent`

The accepted PRD version is immutable. Later edits create an unaccepted draft and do not retroactively change what was accepted or what was used to create a feature. Feature conversion may select only an accepted version.

## 11. Security design

### Cloud controls

- Tenant isolation on every organization-owned record
- Role and room permission checks
- TLS in transit and encryption at rest
- Short-lived single-use pairing codes
- Revocable, device-scoped credentials
- Rate limits for pairing and task creation
- Audit history for sensitive actions
- Attachment validation and malware scanning where practical
- Sensitive-value redaction in operational logs

### Local controls

- Auditable TLS bootstrap with pinned versions and verified SHA-256 checksums
- Private runtime and connector versions under `~/Library/Application Support/Meld/`
- Per-user LaunchAgent under `~/Library/LaunchAgents/`; no daemon, root process, or `sudo`
- Atomic update, health check, rollback, and complete uninstall
- App-owned working and configuration directories
- Provider credentials left with the official provider client
- Narrow product-content task capability
- No repository or arbitrary folder access in the MVP
- No arbitrary shell tool access
- Temporary task workspace cleanup
- Safe update mechanism with version compatibility checks
- Visible pause, disconnect, and uninstall controls

The connector must invoke provider clients with the narrowest supported tool and filesystem permissions. If a provider adapter cannot enforce the MVP's content-only boundary reliably, that adapter is not eligible for public release until the boundary is solved.

## 12. Failure handling

### Device offline

Keep the task queued, show **Waiting for device**, and allow cancellation.

### Provider authentication expired

Pause the task, show **Needs reauthentication**, and direct the user through the official provider login flow.

### Subscription allowance reached

Pause the task and explain the provider-reported limit. The user may wait for reset or explicitly select another connected provider. The platform does not switch to paid API usage.

### Provider unavailable

Preserve the task and offer manual retry, continued queueing, cancellation, or an explicit provider change.

### Connector incompatible or outdated

Do not send unsupported tasks. Explain the required checksum-verified update and restore queued execution after compatibility is re-established.

### Partial output

Preserve and label partial output as incomplete. Let the user resume, restart, discard, or retain it as a non-authoritative draft.

### Cancellation

Signal the local process to stop. Keep partial output only if the user explicitly chooses to retain it.

### Permission or context change

Revalidate immediately before execution. Fail closed if the initiating user no longer has access.

### Malformed AI output

Keep the raw output as a recoverable diagnostic artifact, do not replace the current PRD, and offer a safe retry.

## 13. MVP scope

### Included

- Google and email authentication
- Organizations and invitations
- Small-team roles and room ownership
- Discovery Room conversation and attachments
- Product Agent mentions
- Codex and Claude personal-subscription execution
- CLI-installed persistent macOS connector that requires no preinstalled Node or npx
- Meld-owned private runtime with checksum verification and no global environment changes
- Explicit managed provider installation followed by official provider login
- Default provider and per-task override
- Durable offline task queue
- Full PRD generation
- Direct editing and conversational revision
- PRD version history and diff review
- Whole-document acceptance
- User flows and prototype links
- Explicit feature conversion with warnings
- Define and Design Feature Room stages
- Manual stage transitions with AI recommendations
- Connector and AI task notifications
- Device revocation and audit history

### Deferred

- Managed AI credits
- Platform-owned model credentials
- Browser BYOK and API-key execution
- Windows connector
- Repository access
- Code generation and code execution
- Build, Test, and Launch execution
- Automatic deployment
- Deep Figma synchronization
- Voice notes and advanced realtime document collaboration
- Designated or multi-step approval chains
- SSO, SCIM, data residency, and other enterprise controls

## 14. Testing and validation

### Workflow tests

Cover organization creation, invitation, room creation, agent mentions, PRD generation, targeted revision, direct edits, acceptance permissions, artifact enrichment, feature confirmation, readiness warnings, and manual stage transitions.

### Connector tests

Cover installation, pairing, auto-start, provider detection, provider selection, device reconnection, queued delivery, streaming, cancellation, reauthentication, update compatibility, and revocation.

Provider adapters use deterministic simulated CLI output in automated tests. Separate controlled smoke tests validate current authenticated Codex and Claude client behavior.

### Security tests

Cover tenant isolation, room-scoped context, permission changes during queueing, pairing-code replay, device credential revocation, malicious attachments, redacted logs, temporary-workspace cleanup, denial of local filesystem access, and absence of any platform-key or teammate-subscription fallback.

### PRD quality evaluation

Use realistic discovery transcripts to measure:

- Required-section completeness
- Evidence traceability
- Unsupported claims
- Internal contradictions
- Targeted revision accuracy
- Preservation of protected content
- Acceptance-criteria quality
- Usefulness of readiness recommendations

### Usability validation

Test with 5–10 product managers and designers. Observe connector setup, first provider authentication, room collaboration, AI mentions, PRD review, revision requests, artifact enrichment, and feature conversion.

## 15. Success metrics

### Primary

- Percentage of test teams reaching an accepted PRD in one working session
- Percentage reaching a Design-ready Feature Room without an API key

### Supporting

- Connector setup completion rate
- Median time from account creation to connected provider
- Median time from first room message to accepted PRD
- Number of AI revision rounds before acceptance
- Percentage of accepted PRDs converted into features
- Percentage of tasks delayed by offline devices
- Authentication and connector failures requiring technical help
- User-rated PRD usefulness and trust
- Rate of AI revisions accepted, edited, and rejected

## 16. Cost model

The platform incurs normal SaaS costs:

- Web hosting and background services
- Database and object storage
- Realtime connections and durable task queue
- Transactional email
- Monitoring and error reporting
- Connector distribution and updates

The platform incurs no model-token costs. Users or their organizations pay providers through their own subscriptions. Product pricing should charge for collaboration, product memory, workflow, and coordination—not resold AI tokens.

## 17. Key risks and mitigations

### Provider rules or client behavior change

Maintain isolated provider adapters, compatibility tests, explicit version support, and a provider-policy review before public launch. Never promise indefinite subscription interoperability.

### Connector setup is too technical

Use one copyable bootstrap command, explicit progress, clear connection health, automatic startup, diagnostics, and human-readable recovery steps. Do not require users to understand Node, npm, npx, Homebrew, or LaunchAgents. Validate onboarding with nontechnical users before widening the beta.

### Subscription usage limits interrupt collaboration

Show provider-specific status where available, queue safely, preserve work, and allow an explicit per-task provider override.

### Coding-oriented clients are a poor fit for product documents

Evaluate PRD quality separately for each provider and prompt version. Keep the provider adapter and Product Agent prompt independent so either can improve without changing the product workflow.

### Local clients expose excessive machine access

Run tasks in app-owned temporary workspaces with the narrowest supported permissions. Do not ship an adapter that cannot enforce the content-only MVP boundary.

### MVP expands into the full lifecycle platform

Treat Discovery-to-PRD-to-Define/Design as the single release objective. Repository, Build, Test, Launch, deployment, and enterprise work require later design cycles.

## 18. Launch gates

The private MVP may launch when:

1. Both provider adapters pass authenticated smoke tests on supported macOS versions.
2. Provider usage and authentication behavior have been reviewed against current official terms and documentation.
3. The connector passes install, update, revocation, and cleanup tests.
4. Tenant and room permission tests pass.
5. No execution path can use a platform key, teammate subscription, or paid API fallback.
6. At least five target users complete the core workflow.
7. The majority can connect a provider without engineering assistance.
8. Generated PRDs meet the agreed completeness and revision-preservation quality bar.

## 19. Design decisions

- Personal subscriptions are primary; BYOK is secondary and deferred.
- Both Codex and Claude are supported in the MVP.
- A CLI-installed persistent background connector is the primary execution method.
- The installer works without Node or npx by installing a private pinned runtime.
- The connector runs as a per-user LaunchAgent and survives Terminal closure and login restart.
- The MVP is not a native macOS application and does not require an Apple Developer account.
- Provider installation is explicit, managed, isolated, and followed by official provider authentication.
- macOS is the first supported operating system.
- Tasks belong to the initiating user and queue while their device is offline.
- AI acts only when explicitly mentioned or requested.
- AI context is room-scoped by default.
- The main AI artifact is a full PRD.
- PRD review is conversational and whole-document based.
- Room owners and organization admins accept PRDs.
- PRD acceptance does not create a feature automatically.
- Feature creation requires an explicit confirmation.
- Missing flows, prototypes, and answers produce warnings rather than blockers.
- Feature Rooms implement Define and Design in the MVP.
- Stage transitions are manual with AI recommendations.
