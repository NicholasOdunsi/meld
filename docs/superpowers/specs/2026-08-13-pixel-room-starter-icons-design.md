# Pixel Room Starter Icons

## Goal

Replace the three large, illustrative empty-room starter images with compact pixel-art SVGs that read clearly at the existing 32px display size and match the pixel icon language already used in the room UI.

## Design

Use a shared 16x16 pixel grid and a two-tone outline treatment:

- A light neutral outline defines the main silhouette.
- Each action gets one restrained accent: warm terracotta for feature planning, coral pink for user-flow mapping, and mint green for brainstorming.
- `shape-rendering="crispEdges"` keeps the artwork sharp when the browser scales it to the existing starter icon box.
- No gradients, filters, animation, or layout changes.

The three symbols are action-specific:

- Plan a Feature: a document with folded corner and requirement lines.
- Map a User Flow: a branching flow with square nodes and connectors.
- Brainstorm: a lightbulb with a pixel base.

## Scope and Compatibility

Replace only:

- `apps/web/public/room-starters/plan-feature.svg`
- `apps/web/public/room-starters/map-user-flow.svg`
- `apps/web/public/room-starters/brainstorm.svg`

Keep filenames, URLs, alt behavior, and `EmptyRoomStart` unchanged. The existing contain-fit 32px icon box remains the sizing contract.

## Verification

Run the focused `empty-room-start` test and the web type/lint checks available from the repository. Inspect the SVGs for valid XML, consistent viewBox dimensions, and absence of gradients or raster dependencies.
