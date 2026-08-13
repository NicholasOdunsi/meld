# User Flow Generation Navigation and Glow

## Goal

When an editor accepts a Product Agent proposal to create a user flow, Meld must immediately open the User Flows surface and show a clearly visible pulsing pink edge around the canvas until generation completes or fails.

## Current Failure

The proposal handler starts a client navigation and immediately wakes the room task-status poller. The poller's server-action request can race the navigation request, causing Next.js to discard the pending navigation. The optimistic task state can still reveal the User Flows tab, so the tab appears without becoming active.

The existing glow uses an inset box shadow on the canvas host. Canvas content can paint over that inset shadow, so the generation state can be active without a visible pulse.

## Design

### Navigation and task handoff

1. Accepting the proposal records the returned `user_flow_generate` task ID in `RoomTaskStatusProvider`.
2. The proposal handler navigates to `?tab=user-flows`.
3. A user-flow queue notification must not wake the task-status poller while navigation is pending.
4. After the User Flows canvas mounts, `useUserFlowGeneration` adopts the optimistic task ID and begins its existing generation polling.
5. The ordinary room-status polling lifecycle continues after mount and replaces the optimistic state with the projected task state.

This keeps the task handoff in the existing provider and avoids putting internal task IDs in the URL or adding a global event store.

### Pink generation edge

The canvas host treats both `queued` and `running` as generating. A non-interactive pseudo-element is positioned over the canvas perimeter with a pink border and glow. Its animation pulses continuously without covering or intercepting the canvas controls.

The edge is removed when generation reaches `completed`, `failed`, or another non-generating state. Under reduced-motion preferences, the edge remains visibly pink but does not animate.

### Error handling

Existing generation failure messages remain unchanged. A failed or timed-out task removes the pulse when the hook enters `failed`. Optimistic provider state remains bounded so a missing status projection cannot leave stale generation UI indefinitely.

## Verification

- Test that a user-flow queue notification records optimistic state without immediately waking the status poller.
- Test that accepting the proposal requests the User Flows URL and carries the queued task ID.
- Test that queued and running states apply the generation edge, while completed and failed states remove it.
- Run the focused canvas, proposal, and room-status tests plus TypeScript checking.
- Exercise the real click path in the browser and visually verify that the User Flows tab becomes active and the pink edge pulses above the canvas.
