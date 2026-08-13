# Meld Bot Avatar Design

## Goal

Create a pixel-art Meld bot family that feels capable and approachable without replacing or modifying the Meld logo. Use the base bot to replace the current workspace-setup illustration, then use color variants for Product Agent and Research Agent avatars throughout Rooms. Every bot must be structurally ready for independent limb animation.

## Visual Design

Use the approved restrained full-body silhouette on a `36x36` pixel grid. The character has a stepped rectangular head, compact torso, two arms, two visibly separated legs, a small antenna, neutral eyes, a straight friendly expression, and a pixel Meld mark on its chest.

The base Meld bot uses exactly two colors on a transparent background:

- Porcelain shell: `#F1F0ED`
- Ink details: `#1E293B`

Porcelain covers the head, torso, arms, and legs. Ink is limited to the eyes, expression, Meld chest mark, antenna cap, and soles.

The two Room agent variants use the same geometry and two-color allocation:

- Product Agent: pink shell `#D87587` with porcelain `#F1F0ED` details.
- Research Agent: teal shell `#3C9B8B` with porcelain `#F1F0ED` details.

The bot family uses no gradients, shadows, filters, masks, or additional accent colors.

## Asset Structure

Create a shared inline-SVG React component at `apps/web/src/ui/meld-bot.tsx` with a `variant` prop accepting `"meld"`, `"product"`, or `"research"`. The component uses:

- `viewBox="0 0 36 36"`
- `shape-rendering="crispEdges"`
- A transparent background
- Semantic groups/classes named `antenna`, `head`, `torso`, `left-arm`, `right-arm`, `left-leg`, and `right-leg`

Each arm and leg must be geometrically independent. The legs must retain a visible gap from hip to sole so either leg can translate or rotate without exposing joined artwork. Limb shapes must not share paths with the torso or each other.

Also create `apps/web/public/meld-bot.svg` as the standalone static Porcelain + Ink avatar. It shares the same `36x36` geometry and semantic group IDs for use outside React.

## Workspace Setup

Replace the `meld-spark.png` image inside `WorkspaceSetupMascot` with the inline `MeldBot` using the `meld` variant. Preserve the existing stage size, shadow, test ID, six-second setup flow, and reduced-motion behavior.

Replace the whole-image squash-and-hop animation with a restrained bot animation:

- The torso and head move together in a one-pixel idle bounce.
- Left and right legs alternate independently with clear hip separation.
- Arms move independently with a small counter-swing.
- The antenna makes a minimal two-step tilt.
- Reduced motion disables every transform animation.

No runtime animation is embedded in the SVG asset or shared bot component; `WorkspaceSetupMascot` owns the animation CSS.

## Room Agent Avatars

Replace the robot/search icons and colored circular containers in `AgentMarker` with the shared full-body `MeldBot` component:

- Product Agent renders the pink variant.
- Research Agent renders the teal variant.
- The SVG has a transparent background with no circle, pill, border, or containing color field.
- Existing `sm`, `md`, and `lg` marker footprints, accessible names, test IDs, and grouped spacing remain supported.
- Room avatars are static so repeated avatars do not create ambient motion across conversation and header surfaces.

## Motion Readiness

The standalone asset and Room avatars are static. Their group boundaries and independent geometry allow future consumers to animate each limb around its own pivot. This task adds animation only to the existing workspace-setup mascot surface.

## Compatibility

The new bot family is separate from `apps/web/public/meld-mark.svg` and `apps/web/src/app/icon.svg`. Existing logo references remain unchanged. The obsolete Spark PNG may remain in `public` if another surface references it; otherwise it can remain unused without affecting this change.

## Verification

- Parse the SVG with `xmllint`.
- Confirm the expected viewBox, crisp-edge rendering, approved color values, and semantic group IDs/classes.
- Confirm the SVG contains no gradients, filters, masks, embedded raster images, or animation elements.
- Render thumbnails and visually inspect the silhouette, color count, leg separation, and small-size readability for all three variants.
- Verify the workspace-setup bot animates at desktop and mobile viewport sizes and is static under reduced motion.
- Verify Product and Research bot variants appear without circles anywhere `AgentMarker` is used in Rooms.
- Run focused workspace setup and room agent/avatar tests.
- Run `git diff --check`.
