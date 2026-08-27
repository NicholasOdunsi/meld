# Chained screen generation

**Date:** 2026-08-25
**Status:** Approved in brainstorm, ready for planning

---

## In plain language

Asking for a whole flow builds nothing at all.

A generation writes nothing to the database until the model has finished the entire batch. The provider cuts a run off at 12 minutes. So a request like "design the full flow" tries for nine or more screens, runs past the ceiling, and every screen it had already written is thrown away. Observed three times on the same request: **722 seconds, not one screen saved.**

Instead of one long run, a request now becomes a short run that saves its screens, then another, then another. Screens appear a few at a time while the rest are still being built. If the fourth run dies, the first three are already on the canvas.

That also answers "how do I know it's working": screens appearing one by one is the progress indicator, and it is real output rather than an animation.

---

## Why not stream a single run

The obvious idea — show each screen as the model writes it — is not available.

The connector asks for structured output via `--json-schema`. That arrives as **one block at the end** of the run. The `text.delta` events the adapter already parses carry prose only, never screens. There is no moment mid-run at which screen one exists as parseable data.

There is even a `result_json.partial` flag in the schema, and `materialize_design_screen_generate` explicitly returns early on anything marked partial — infrastructure for a stream that was never built. Chaining short runs is the same idea achieved with what the provider actually gives us.

---

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Trigger | Automatic, ceiling of 3 follow-ups | One ask should feel like one piece of work. The ceiling bounds cost — this account already hit `usage_limit_reached` once |
| What to build next | The **frozen list**: screens run 1 linked to but did not build | The flow's extent is decided once, so the chain has a known end before it starts |
| Where the chain runs | The database | It survives closing the tab. A chain that only advances while you watch would stop the moment you looked away, and you would not know |
| In the transcript | **One reply**, updating in place | One ask, one answer — the rule already set for batch replies |

### Rejected, and why

- **Chaining on any dangling target.** `computeDanglingTargets` counts layout nav targets, so a generated six-item nav bar creates six dangling targets immediately. Chaining on those builds an app nobody asked for.
- **A "more screens remain" field the model sets.** More honest in principle, but today's evidence is that long runs already fail to return valid output; adding a field it must use correctly makes the fragile path more fragile.
- **One reply per batch.** Four bubbles for one request — the "spamming" the batch-reply work already rejected.
- **Chaining in the browser.** A third of the work, and wrong for how this is used: kick off a generation, go elsewhere, come back.

---

## Architecture

### The chain

1. **Run 1** — a normal generation, capped at 4 screens by the prompt rule. Whatever it links to but does not build becomes the **frozen list**.
2. **Run 2..4** — instructed with specific keys (`build prospect_verify, prospect_activate`), not a re-description of the flow. Short, targeted, well inside the ceiling.
3. **Stop** when the list empties or three follow-ups have run.

Every run stands alone. Its screens materialise through the existing path the moment it completes.

### Chain state

Three columns on `design_screen_generations`, which already links a task to its screen:

| Column | Holds |
|---|---|
| `chain_id uuid` | Groups every run of one request. What lets the transcript show one reply |
| `chain_remaining text[]` | Frozen list of screen keys still to build |
| `chain_step integer` | Which follow-up this is, so the ceiling is enforceable |

Run 1 sets `chain_id` to its own task id, `chain_step` to 0, and `chain_remaining` to the dangling keys it created. Each follow-up inherits `chain_id`, increments `chain_step`, and carries the shrunken list.

**The ceiling is three follow-ups, so four runs at most.** Run 1 is step 0; follow-ups are steps 1, 2 and 3; a task at step 3 queues nothing further. At four screens a run, that is a ceiling of 16 screens — comfortably past any flow this is meant for.

### Queueing the follow-up

`materialize_design_screen_generate` queues the next run after it has written the batch's screens.

**It cannot call `create_design_screen_generate_task`.** That function reads `auth.uid()` and refuses when it is null; inside a trigger there is no JWT. The chain needs a variant taking the initiating user explicitly, read from the completed task's `initiating_user_id`.

**The follow-up inherits `provider`, `model` and `device_id` from the parent task** rather than re-deriving them from user preferences. This sidesteps the `auth.uid()` problem and is also more correct: a chain started on Opus finishes on Opus instead of silently switching to a default partway through.

### Instruction for a follow-up

Names the keys and nothing else:

```
build these screens for the flow: prospect_verify, prospect_activate
```

The existing generation context still applies — reference screen, existing screens, dangling targets — so a follow-up matches the established look for the same reason run 1's siblings do.

### The transcript

`groupDesignTurnsBySend` currently folds turns sharing a prompt within 60 seconds, which chained runs will not satisfy: minutes apart, different instructions. It gains a rule that turns sharing a `chain_id` are one turn, regardless of gap or wording.

The reply reads `Built 4 of 9 · building the next…`, the carousel growing as batches land, settling to `Built 9 screens`. When the ceiling stops it early: `Built 8 of 11. Ask again to continue.`

The denominator is **the flow's total size as run 1 saw it** — the screens run 1 built plus the frozen list it named — fixed for the chain's life. It never moves, so the count cannot appear to go backwards when a later run finds one of its targets already built.

---

## Error handling

| Case | Behaviour |
|---|---|
| A run fails or times out | Chain stops. Earlier screens stay. The reply says what was built and that it stopped |
| The person cancels | The whole chain stops, not just the current run — one ask, one stop |
| A frozen-list screen gets built by something else meanwhile | Dropped from the list; never built twice |
| Ceiling reached with screens left | Stops and says so. Never silently truncates |
| A follow-up cannot be queued (no device, provider gone) | Chain ends quietly; the batch already written is untouched |
| Room deleted mid-chain | Chain dies with the room |

---

## Testing

**pgTAP**, against the real trigger, because that is where the chain lives:

- a completed batch with remaining keys queues exactly one follow-up
- the follow-up inherits `chain_id`, `provider`, `model`, `device_id`, and a decremented list
- a task at `chain_step` 3 queues nothing — three follow-ups, four runs in total
- a failed or cancelled run queues nothing
- a key already built is dropped from the list rather than rebuilt
- an empty list queues nothing

**Unit:** turns sharing a `chain_id` group into one reply regardless of the time gap; the reply's count text tracks screens built against the frozen list's original size.

**Manual, and stated rather than assumed:** whether a real chained run actually produces a coherent flow can only be judged by running one and looking at it. No test covers that.

---

## Out of scope

- Streaming within a single run — not available; structured output arrives as one block
- Changing the 4-screen prompt cap or the 12-minute provider ceiling
- Retrying a failed run automatically
- Letting the chain add screens the first run did not name
