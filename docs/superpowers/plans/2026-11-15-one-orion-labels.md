# One Orion: Website Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every user-visible label, message, toast and error on the website that says "Product Agent", "Research Agent" or "Design Agent" says "Orion" instead, so people know they are talking to one agent.

**Architecture:** Text-only changes in `apps/web/src` plus the unit and e2e assertions that quote those strings. No behaviour, data or contract change. The `@` mention handles are NOT touched (see Global Constraints).

**Tech Stack:** Next.js / TypeScript, vitest (run in `apps/web`), Playwright e2e specs under `e2e/` (run by CI).

## Global Constraints

Copied from `docs/superpowers/specs/2026-11-15-inline-star-references-design.md`:

- Rename only user-visible labels, messages, toasts and errors. Grammar adjusted ("The Product Agent couldn't reply" becomes "Orion couldn't reply").
- **Do not change:** `DISCOVERY_AGENTS` in `agent-marker.tsx`, `PRODUCT_AGENT_MENTION` in `brief-opener.ts`, the composer suggestion chips and `composer-test-harness.tsx`, the mention-stripping and name constants in `conversation.tsx` and `empty-room-start.tsx`, the setup hint in `workspace-setup.tsx`, `e2e-fake.ts` (test fakes), code comments, and internal identifiers (`agentKind`, `product_agent`, task kinds). These are the `@` mention handles and internals, not labels.
- Environment: `export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"`; web commands run in `apps/web`.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`

## File Structure

Files edited (strings only): `features/design/components/history-drawer.tsx`, `features/design/components/agents-transcript.tsx`, `features/ai/components/provider-setup-progress.tsx`, `features/ai/components/agent-activity.tsx`, `features/ai/components/agent-task-state.tsx`, `features/prd/create-prd-section-assist-task.ts`, `features/prd/actions.ts`, `features/prd/components/prd-assist-response.tsx`, `features/prd/components/prd-proposal-card.tsx`, `features/prd/components/prd-document.tsx`; plus the tests and e2e specs that assert those strings.

---

### Task 1: Rename the agent names the user reads

**Files:** the ten source files above (all under `apps/web/src/`); their `*.test.ts(x)` siblings; `e2e/prd-generate.spec.ts`, `e2e/prd-edit-acceptance.spec.ts`, `e2e/prd-revise.spec.ts`, `e2e/product-agent-room-reply.spec.ts` (only if they assert a renamed string).

**Interfaces:** none (text only). `PRD_ASSIST_THINKING_LABEL` (exported from `prd-assist-response.tsx`) keeps its name; its value changes.

**Wording (use exactly these):**

| File:line | Old | New |
|---|---|---|
| `design/components/history-drawer.tsx:50` | `"Product Agent"` | `"Orion"` |
| `design/components/history-drawer.tsx:51` | `"Research Agent"` | `"Orion"` |
| `design/components/agents-transcript.tsx:288` | `Design Agent` (label) | `Orion` |
| `ai/components/provider-setup-progress.tsx:105` | `Your Mac can now run the Product Agent.` | `Your Mac can now run Orion.` |
| `ai/components/agent-activity.tsx:100` | `agentKind === "research" ? "Research Agent" : "Product Agent"` | `"Orion"` (both kinds) |
| `ai/components/agent-task-state.tsx:196` | `The Product Agent couldn't reply` | `Orion couldn't reply` |
| `ai/components/agent-task-state.tsx:203` | `The Product Agent could not reply` | `Orion could not reply` |
| `ai/components/agent-task-state.tsx:204` | `Ask the Product Agent again to try a fresh reply.` | `Ask Orion again to try a fresh reply.` |
| `prd/create-prd-section-assist-task.ts:43` | `Could not send this to the Product Agent.` | `Could not send this to Orion.` |
| `prd/actions.ts:187` | `Could not send this to the Product Agent.` | `Could not send this to Orion.` |
| `prd/components/prd-assist-response.tsx:17` | `Product Agent is thinking` | `Orion is thinking` |
| `prd/components/prd-assist-response.tsx:35` | `so the Product Agent cannot suggest a change.` | `so Orion cannot suggest a change.` |
| `prd/components/prd-assist-response.tsx:50` | `The Product Agent's reply could not be used.` | `Orion's reply could not be used.` |
| `prd/components/prd-assist-response.tsx:90` | `The Product Agent could not answer this` | `Orion could not answer this` |
| `prd/components/prd-assist-response.tsx:120` | `Product Agent` (label) | `Orion` |
| `prd/components/prd-proposal-card.tsx:46` | `Product Agent suggestion` | `Orion's suggestion` |
| `prd/components/prd-document.tsx:255` | `You have 1 earlier Product Agent request` | `You have 1 earlier Orion request` |
| `prd/components/prd-document.tsx:256` | `` `You have ${requests.length} earlier Product Agent requests` `` | `` `You have ${requests.length} earlier Orion requests` `` |
| `prd/components/prd-document.tsx:661` | `The Product Agent proposal was applied.` | `Orion's proposal was applied.` |
| `prd/components/prd-document.tsx:686` | `The Product Agent proposal was discarded.` | `Orion's proposal was discarded.` |
| `prd/components/prd-document.tsx:857` | `Product Agent is preparing a proposal` | `Orion is preparing a proposal` |
| `prd/components/prd-document.tsx:865` | `The Product Agent could not prepare this proposal` | `Orion could not prepare this proposal` |

Line numbers are as of the plan date; find each by its old text if a number has shifted. If `agent-activity.tsx` line 100 leaves an unused branch or variable, simplify it (no dead code).

- [ ] **Step 1: Find every test and e2e assertion on these strings** — run from the repo root:

```bash
grep -rIn --exclude-dir=node_modules -E "Product Agent|Research Agent|Design Agent" apps/web/src e2e --include='*.ts' --include='*.tsx' \
  | grep -E "\.test\.|e2e/" 
```
List which of them assert one of the strings in the table above (as opposed to the excluded mention handles).

- [ ] **Step 2: Update those assertions first** (tests describe the wanted behaviour): change the expected strings to the "New" column. Run the affected unit tests and watch them FAIL against the old source: `cd apps/web && pnpm exec vitest run <the test files> 2>&1 | tail -15`.

- [ ] **Step 3: Apply the table to the source files.**

- [ ] **Step 4: Run the affected tests, then the whole web suite and checks** — `cd apps/web && pnpm exec vitest run 2>&1 | grep -E "×|FAIL|Tests |Test Files"` (all pass); `pnpm exec tsc --noEmit` (clean); `pnpm exec eslint src --quiet` (clean); from the repo root `pnpm check:astryx` and `pnpm test:colocation` (pass).

- [ ] **Step 5: Prove nothing user-visible was missed** — run the grep from Step 1 on source files only, excluding tests:

```bash
grep -rIn --exclude-dir=node_modules -E "(Product|Research|Design) Agent" apps/web/src --include='*.ts' --include='*.tsx' \
  | grep -v "\.test\." | grep -vE ":[0-9]+:\s*(//|\*|/\*)"
```
Every remaining line must be one of the excluded items in Global Constraints (`agent-marker.tsx`, `brief-opener.ts`, `composer.tsx` suggestion chips, `composer-test-harness.tsx`, `conversation.tsx`, `empty-room-start.tsx`, `workspace-setup.tsx`, `e2e-fake.ts`). Write the remaining list in the report.

- [ ] **Step 6: Commit**

```bash
git add apps/web e2e
git commit -m "feat(web): say Orion instead of Product, Research and Design Agent" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(The controller pushes and opens the PR after review. The e2e specs run in CI, not locally.)

---

## Self-review

**Spec coverage:** every user-visible occurrence outside the excluded mention handles is in the table (cross-checked against a repo-wide grep on the plan date) → Task 1; the exclusions match the spec's "Deliberately not changed" paragraph; Step 5 proves nothing was missed; no data or behaviour change.

**Placeholders:** none; the wording table is exact.
