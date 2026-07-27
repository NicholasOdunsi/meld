# Frameless Sign-In Design

## Goal

Restyle the existing Meld sign-in page to match the reference image's centered, open composition while preserving Meld's Astryx design system and the existing authentication behavior. The page will continue to offer an email magic link and Google OAuth only.

## Visual Direction

- Use a full-page, frameless authentication layout with no enclosing Card.
- Center a single narrow content column horizontally and position it slightly above the visual midpoint on larger screens.
- Let the column flow naturally with design-system padding and scrolling on small screens.
- Place the Meld mark above the heading. Render the mark in white on a compact inverted design-system surface so it remains legible in both light and dark theme modes.
- Use the heading “Welcome back” and supporting copy that explains the email-link and Google options.
- Order the controls as: email field, primary magic-link button, labeled divider, and secondary Google button.
- Use the supplied mark for the browser favicon, placed on a contrasting background so it remains recognizable across browser themes.

All colors, typography, borders, radii, spacing, sizing, focus states, hover states, and responsive behavior will come from Astryx components, component props, and design tokens. The reference image controls composition only; it does not introduce a separate black theme.

## Component Structure

The page remains a client component because it uses `useActionState`, `useFormStatus`, and controlled input state.

- `AppShell` provides the full-page frame.
- `Center` provides page-level placement.
- `VStack` groups the logo, introduction, feedback, and forms.
- `Heading` and `Text` provide the introduction.
- `Banner` displays magic-link, Google, and callback feedback.
- `FormLayout` and `TextInput` preserve accessible email entry and validation.
- `Button` provides the primary email action and secondary Google action.
- `Divider` separates the authentication methods.
- A small local logo presentation component renders the supplied SVG without creating a parallel layout system.

The current `MagicLinkForm` and `SubmitButton` boundaries remain intact unless a small adjustment is needed to support the approved presentation.

## Authentication and State

No server action behavior changes.

- The email form continues to call `requestMagicLink`.
- The Google form continues to call `signInWithGoogle`.
- The safe `next` path remains attached to both submissions.
- Pending submissions continue to show the Button loading state.
- After a magic link is sent, the email field and submit button remain disabled.
- Field errors, provider errors, and callback failures remain visible near the affected controls.

## Assets and Metadata

- Copy the supplied SVG mark into the web app's public or app asset structure.
- Create a white presentation variant for the sign-in surface without changing its geometry.
- Configure the mark as the Next.js favicon using the app-router metadata convention.
- Keep the favicon self-contained and scalable as SVG.

## Responsive and Accessibility Requirements

- The form column must remain usable without horizontal scrolling at narrow viewport widths.
- Vertical overflow must scroll when viewport height is constrained.
- Existing visible labels, required semantics, disabled semantics, and status messages remain accessible.
- The logo is decorative on the sign-in page and should not duplicate the heading for assistive technology.
- Google sign-in retains a clear text label; any Google icon is decorative.
- Focus indication and color contrast come from the Astryx theme.

## Verification

- Extend the sign-in component tests to verify the approved heading, both authentication methods, and preserved post-success disabled state.
- Verify favicon and logo assets exist at their intended paths.
- Run the sign-in tests, Astryx convention check, typecheck, and lint.
- Perform a production build or equivalent page render check.
- Inspect the page at desktop and mobile widths in both light and dark system themes.

## Out of Scope

- Password authentication
- GitHub authentication
- Sign-up or account-recovery links
- Authentication server-action changes
- A custom page-specific color theme
- Unrelated application-shell or onboarding redesigns
