# Orion talking hat mascot

**Date:** 2026-11-09  
**Status:** Visual direction approved by user

## Purpose

Create a standalone mascot for Orion based on the supplied reference: a crooked, weathered talking hat whose face is formed by the hat's folds. This is an original interpretation, not a traced copy of the photo. The mascot is reusable before a specific product placement is chosen.

## Visual design

- A tall, asymmetric cone, bent tip, broad uneven brim, and soft sculptural folds.
- Brow, nose and mouth folds are part of the same leather form. Real eyes (aged whites, hazel irises, catchlights) sit in almond openings under heavy leather lids; lid height and gaze change per expression. *(Revised 2026-11-09 at the user's request; originally fold-only eyes.)*
- Warm brown body with layered shading, restrained grain and stitch details, and a small cyan Orion accent.
- A transparent background so the silhouette works on light and dark surfaces.
- Clear facial and hat silhouette at illustration size, with a simplified small-size rendering for avatars.

## Implementation

Build an inline SVG React component in the web app. SVG paths and gradients provide shape and depth; no external image or 3D runtime is needed. Public props control size through normal SVG attributes, expression (`neutral`, `curious`, `speaking`), and accessible labeling. Speaking state changes the mouth shape and may use subtle motion; reduced-motion preferences disable animation. A static SVG export can be added for contexts outside React.

Provide a local preview that shows the mascot at illustration and avatar scales and demonstrates the expression states. Do not place it into an existing product screen yet.

## Acceptance

1. The mascot reads as a talking hat at a glance and retains a distinct face at small sizes.
2. It renders without a background and uses Orion's cyan only as a restrained accent.
3. Expressions are controllable without changing the basic silhouette.
4. The component is accessible and respects reduced motion.
5. The web typecheck and relevant focused checks pass.
