# User Flow Generation Navigation and Glow

## Goal

When an editor accepts a Product Agent proposal to create a user flow, Meld must immediately open the User Flows surface and show a clearly visible pulsing pink edge around the canvas until generation completes or fails.

## Current Failure

The proposal handler originally started a client navigation and immediately woke the room task-status poller. The poller's server-action request could race the navigation request, causing Next.js to discard the pending navigation.

Avoiding that request race allowed the User Flows tab to open, but the queued task ID was still held only in client context. The App Router navigation can remount that context. In the reproduced failure, the task completed and materialized successfully while the destination canvas remained idle and initially left the generation unapplied. Client-only optimistic state is therefore not a reliable handoff across this navigation.

The existing glow uses an inset box shadow on the canvas host. Canvas content can paint over that inset shadow, so the generation state can be active without a visible pulse.

## Design

### Navigation and task handoff

1. Accepting the proposal navigates to `?tab=user-flows` without starting a competing server-action request.
2. Both room backends derive `activeUserFlowTaskIds` from the same room task-status projection they already load for `activePrdTaskIds`.
3. `RoomPageData` carries those IDs into the server-rendered room page, which passes the first active ID to the User Flows surface.
4. The User Flows dynamic loader, canvas-session loading state, and mounted canvas all receive that task ID. The visual generation state therefore begins as soon as the destination surface renders and survives dynamic import and gateway connection.
5. `useUserFlowGeneration` initializes from the server-provided task ID and polls the materialized result without depending on client context surviving navigation.
6. Room-level optimistic and projected task status remain fallback recovery paths for tasks started from the mounted canvas or observed after a reload.

This avoids exposing internal task IDs in the URL, avoids blind polling, and makes the navigation response itself the durable task handoff.

### Pink generation edge

The whole User Flows surface treats a server-provided generation task ID, plus the canvas hook's `queued` and `running` states, as generating. The dynamic loading screen and canvas-session loading screen use the same non-interactive pink perimeter treatment as the mounted canvas, so there is no unindicated gap before tldraw is ready.

On the mounted canvas, a non-interactive pseudo-element is positioned over the perimeter with a pink border and glow. Its animation pulses continuously without covering or intercepting the canvas controls.

The edge is removed when generation reaches `completed`, `failed`, or another non-generating state. Under reduced-motion preferences, the edge remains visibly pink but does not animate.

### Error handling

Existing generation failure messages remain unchanged. A failed or timed-out task removes the pulse when the hook enters `failed`. Optimistic provider state remains bounded so a missing status projection cannot leave stale generation UI indefinitely.

## Verification

- Test that both room backends return active user-flow task IDs from the task projection.
- Test that the room page passes an active user-flow task ID into the destination surface.
- Test that the dynamic import and canvas-session loading states render the generation edge when that ID is present.
- Test that `useUserFlowGeneration` immediately adopts and polls a server-provided initial task ID.
- Test that queued and running states apply the generation edge, while completed and failed states remove it after shape insertion or failure.
- Run the focused canvas, proposal, and room-status tests plus TypeScript checking.
- Exercise the real click path in the browser and visually verify that the User Flows tab becomes active and the pink edge pulses above the canvas.
