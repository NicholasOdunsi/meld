# Animated Mascot Workspace Setup Design

**Date:** 2026-07-25
**Status:** Approved design; ready for implementation planning

## 1. Summary

Replace the Meld mark on the six-second post-invite workspace setup
interstitial with the approved general Meld mascot, The Spark. The mascot uses
a transparent background and performs a repeating playful hop with
squash-and-stretch and a responsive ground shadow.

This change adds a branded moment without changing the setup screen's timing,
tips, authorization, or navigation behavior.

Related design documents:

- [Workspace Setup Interstitial](./2026-07-25-workspace-setup-interstitial-design.md)
- [Meld Mascot Family Design](./2026-07-25-meld-mascot-family-design.md)

## 2. Existing flow

The target is the existing `WorkspaceSetup` interstitial shown after the user
selects either **Done** or **Skip for now** on the invitation onboarding step.

The current flow:

1. Opens `/onboarding/<organization-id>/setup`.
2. Verifies that the signed-in user belongs to the organization.
3. Shows three product tips for two seconds each.
4. Prefetches the Discovery Rooms destination.
5. Replaces the setup route with `/<organization-id>/discovery` after six
   seconds.

The interstitial does not represent measured background work. The animation is
a brand treatment, not a progress indicator.

## 3. Interface change

The existing 48 px Meld mark above the heading is replaced with The Spark.

The mascot:

- Uses the approved cobalt, coral, and chrome Spark design.
- Is rendered from a dedicated transparent-background asset, not cropped from
  the family concept board.
- Appears at approximately 120 px within a stable layout slot.
- Has no surrounding tile, image background, frame, or card.
- Retains a soft oval ground shadow as part of its animated presentation.
- Remains decorative and uses empty alternative text.

The existing wash background, centered column, heading, rotating tips, and text
width remain unchanged. The larger mascot replaces only the reserved brand
slot; the rest of the page does not move as the animation runs.

## 4. Motion design

The selected treatment is a continuous playful hop loop.

Each loop lasts approximately 1.45 seconds and contains:

1. A short grounded anticipation.
2. A soft upward hop.
3. Slight vertical stretch during lift.
4. A squash on landing.
5. A smaller settling hop.
6. A brief grounded pause before the loop repeats.

The mascot's transform origin sits near its lower edge so the body feels
grounded. Motion uses Meld's standard easing curve. The loop should feel soft
and toy-like rather than springy, frantic, or mechanical.

The oval ground shadow animates in coordination:

- It narrows and becomes lighter while the mascot rises.
- It returns to full width and opacity when the mascot lands.
- It does not detach from the mascot's stage or move the surrounding layout.

No other element bounces. Tip transitions continue to use their existing fade.

## 5. Reduced motion

When `prefers-reduced-motion: reduce` is enabled:

- The mascot remains completely still.
- The shadow remains completely still.
- No entrance bounce or looping movement runs.
- Tip changes continue to appear without their existing fade transition.
- The six-second navigation timing remains unchanged.

The static mascot must still look intentional and correctly grounded.

## 6. Component boundary

The mascot presentation should be isolated from `WorkspaceSetup` in a small,
focused component responsible for:

- Rendering the transparent Spark asset.
- Providing the stable mascot stage.
- Rendering the ground shadow.
- Applying normal and reduced-motion behavior.

`WorkspaceSetup` remains responsible for tips, timers, prefetching, and
navigation. The mascot component receives no organization data and does not
control interstitial timing.

This separation allows the mascot animation to change without risking the
onboarding flow.

## 7. Asset requirements

The implementation requires a dedicated Spark cutout rather than the approved
family board.

The asset must:

- Match the approved top-left Spark concept in the family board.
- Preserve the cobalt body, coral inner surface, chrome detail, and shared eye
  construction.
- Use a transparent background with clean antialiased edges.
- Contain no baked-in floor, background, text, frame, or watermark.
- Include enough transparent padding to avoid clipping at full stretch.
- Remain clear on Meld's light wash background.
- Be optimized for web delivery without visible degradation at its intended
  size.

The ground shadow is rendered separately by the interface so it can react to
the bounce and remain tunable.

## 8. Accessibility

- The mascot is decorative and has empty alternative text.
- The existing `Setting up your workspace.` heading remains the accessible
  description of the page.
- The animation never communicates progress, status, success, or failure.
- Role, state, and navigation remain understandable if the image fails to
  load.
- Reduced-motion preferences are honored without affecting navigation.

## 9. Error and loading behavior

The mascot asset is a bundled local application asset, so it does not require a
network fetch from a third-party service.

If the image cannot render:

- The stable mascot slot remains reserved, preventing layout shift.
- The heading, tips, and timed redirect continue normally.
- No text error is shown because the image is decorative.

The animation must not delay page rendering or the six-second redirect.

## 10. Testing

Component tests should prove:

- The Spark asset renders with empty alternative text.
- The mascot stage and separate shadow are present.
- The normal motion treatment is attached.
- Reduced-motion preference disables both mascot and shadow animation.
- The setup heading and all three tips remain unchanged.
- Tips still rotate at two-second intervals.
- Destination prefetch still occurs on mount.
- Navigation still replaces the route after six seconds.
- The final tip remains visible until navigation.

Project checks should include:

- The focused workspace setup test.
- Astryx convention checks.
- Web typechecking.
- Web linting.
- The onboarding end-to-end test.
- The production build.

## 11. Acceptance criteria

The feature is complete when:

1. The Spark appears above the setup heading with no visible image background.
2. The mascot performs the approved repeating hop and settling motion.
3. The separate oval shadow stays synchronized with the mascot.
4. The mascot remains fully static under reduced motion.
5. The layout does not shift during the loop or tip changes.
6. Existing tip text, six-second timing, prefetching, and navigation remain
   unchanged.
7. Failure to display the decorative asset does not block entry to the
   workspace.
8. Automated checks for the setup flow and project conventions pass.

## 12. Non-goals

- Changing invitation behavior.
- Changing the setup screen's duration or copy.
- Presenting real setup progress.
- Adding a spinner or progress bar.
- Animating other mascot-family members.
- Replacing the Meld mark elsewhere in onboarding.
- Adding sound, interaction, or user-controlled playback.
