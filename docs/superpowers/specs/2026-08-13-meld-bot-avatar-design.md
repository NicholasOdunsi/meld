# Meld Bot Avatar Design

## Goal

Create a separate pixel-art Meld bot avatar that feels capable and approachable without replacing or modifying the Meld logo. The bot must be structurally ready for independent limb animation.

## Visual Design

Use the approved restrained full-body silhouette on a `36x36` pixel grid. The character has a stepped rectangular head, compact torso, two arms, two visibly separated legs, a small antenna, neutral eyes, a straight friendly expression, and a pixel Meld mark on its chest.

The avatar uses exactly two colors on a transparent background:

- Porcelain shell: `#F1F0ED`
- Ink details: `#1E293B`

Porcelain covers the head, torso, arms, and legs. Ink is limited to the eyes, expression, Meld chest mark, antenna cap, and soles. The asset uses no gradients, shadows, filters, masks, or additional accent colors.

## Asset Structure

Create `apps/web/public/meld-bot.svg` as a standalone SVG with:

- `viewBox="0 0 36 36"`
- `shape-rendering="crispEdges"`
- A transparent background
- Semantic groups named `antenna`, `head`, `torso`, `left-arm`, `right-arm`, `left-leg`, and `right-leg`

Each arm and leg must be geometrically independent. The legs must retain a visible gap from hip to sole so either leg can translate or rotate without exposing joined artwork. Limb shapes must not share paths with the torso or each other.

## Motion Readiness

The delivered asset is static and contains no embedded animation. Its group boundaries and independent geometry allow a future inline-SVG or component consumer to animate each limb around its own pivot. This task does not add runtime animation or wire the bot into an existing UI surface.

## Compatibility

The new asset is separate from `apps/web/public/meld-mark.svg` and `apps/web/src/app/icon.svg`. Existing logo references remain unchanged. Consumers may display the bot as a normal image when animation is not needed; animation-capable consumers can inline the SVG structure later.

## Verification

- Parse the SVG with `xmllint`.
- Confirm the expected viewBox, crisp-edge rendering, two color values, and semantic group IDs.
- Confirm the SVG contains no gradients, filters, masks, embedded raster images, or animation elements.
- Render a thumbnail and visually inspect the silhouette, color count, leg separation, and small-size readability.
- Run `git diff --check`.
