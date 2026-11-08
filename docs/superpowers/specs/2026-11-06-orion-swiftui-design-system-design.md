# Orion SwiftUI Design System

**Date:** 2026-11-06

**Status:** Approved; implemented in `packages/orion-design-system`

**Scope:** A reusable Swift package for Orion's native Apple-platform interfaces

## Purpose

Orion needs one native design-system package that can be shared by the macOS
Shelf and later SwiftUI applications. The package translates the supplied
brand references into typed SwiftUI APIs rather than scattering font names,
hex values, spacing, or logo implementations through individual apps.

The package is independent of `apps/shelf`. It lives at
`packages/orion-design-system`, has no dependency on application models or
networking, and can be imported as `OrionDesignSystem` by any Swift package or
Xcode project in the repository.

## Source Material

The design system has four brand sources of truth:

1. The attached Orion SVG is the logo source. Its standalone geometric mark is
   used for compact contexts; its full outlined wordmark is used when space
   permits.
2. Space Grotesk Bold is the headline face.
3. Manrope Regular and Bold are the body and subheading faces.
4. The supplied palette and combination guide define the allowed brand colors
   and intentional light/dark pairings.

The implementation will retain the original SVG in package resources and
reproduce its paths as scalable SwiftUI shapes. It will not redraw the logo
with text or substitute an SF Symbol. The compact menu-bar treatment uses only
the Orion mark, rendered as a monochrome template image so macOS can apply the
correct menu-bar foreground automatically.

The approved primary brand color and default logo foreground are Day Break Blue
(`#00E1F3`). The production vector asset is `assets/brand/Orion.svg`, with both
the mark and wordmark in Day Break Blue and the supplied path geometry preserved.
The original attachment remains the geometry reference. SwiftUI logo shapes
default to `OrionColor.dayBreakBlue` and support a configurable foreground for
monochrome contexts. Primary buttons pair Day Break Blue with its
contrast-safe `textForeground` (Black). The macOS menu-bar adapter remains a
system-colored template image.

## Package Structure

```text
packages/orion-design-system/
  Package.swift
  Sources/OrionDesignSystem/
    Brand/
      OrionLogo.swift
      OrionLogoPaths.swift
    Color/
      OrionColor.swift
      OrionColorRole.swift
      OrionTone.swift
    Typography/
      OrionFont.swift
      OrionTextStyle.swift
      OrionTypographyModifier.swift
      FontRegistration.swift
    Tokens/
      OrionSpacing.swift
      OrionRadius.swift
      OrionSize.swift
      OrionMotion.swift
    Components/
      OrionButtonStyle.swift
      OrionCard.swift
      OrionStatusToken.swift
      OrionTextFieldStyle.swift
      OrionSurface.swift
    Resources/
      Orion.svg
      Fonts/
        SpaceGrotesk-Bold.ttf
        Manrope-Regular.ttf
        Manrope-Bold.ttf
        OFL.txt
  Sources/OrionDesignSystemCatalog/
    OrionDesignSystemCatalogApp.swift
    CatalogView.swift
  Tests/OrionDesignSystemTests/
```

The catalog is a small macOS SwiftUI executable that displays the logo,
primitive colors, semantic colors, typography scale, tone combinations, and
components. It is a development and review tool, not part of the Shelf bundle.

## Color System

### Primitive colors

`OrionColor` exposes every supplied palette value by brand name. These values
are immutable and are the only hard-coded RGB values in the package.

| Swift name | Brand name | Hex |
|---|---|---:|
| `summerYellow` | Summer Yellow | `#FFEA00` |
| `nectarineOrange` | Nectarine Orange | `#FF9800` |
| `partyOrange` | Party Orange | `#FF5A00` |
| `dayBreakBlue` | Day Break Light Blue | `#00E1F3` |
| `electricBlue` | Electric Blue | `#5151FC` |
| `openSkyBlue` | Open Sky Blue | `#5100C0` |
| `candyPink` | Candy Pink | `#FFC0FF` |
| `futuristicPink` | Futuristic Pink | `#FF6FFF` |
| `loudRed` | Loud Red | `#FC032D` |
| `kryptoniteGreen` | Kryptonite Green | `#ABFF5A` |
| `pineGreen` | Pine Green | `#00906C` |
| `deepGreen` | Deep Green | `#085E55` |
| `offWhite` | Off-white | `#F9F9F9` |
| `gray` | Gray | `#8F9193` |
| `black` | Black | `#090909` |

### Semantic roles

Orion's default presentation is dark. Apps pin that preference with
`.orionPreferredAppearance()` (`OrionAppearance.preferredColorScheme == .dark`),
so `canvas` resolves to Black and body text to Off-white unless the host
explicitly opts into light. Light appearance remains a first-class resolution
path for review, accessibility, and host override.

Views consume `OrionColorRole` rather than choosing primitives directly.
Roles resolve for light, dark, increased-contrast, and disabled states.

- `canvas`, `surface`, and `surfaceStrong`
- `textPrimary`, `textSecondary`, and `textInverse`
- `accent`, `focus`, and `selection`
- `success`, `warning`, `danger`, and `information`
- `border`, `borderStrong`, and `disabled`

The first release uses Day Break Blue as the primary interaction accent, Loud
Red for destructive/error feedback, Pine/Kryptonite Green for success, Summer
Yellow/Nectarine Orange for warning, and Open Sky Blue (light) / Day Break Blue
(dark) for information. Black and Off-white provide primary foreground/background
contrast. Gray is reserved for secondary content and disabled states, not body
text on Off-white where its contrast is insufficient at small sizes. Electric
Blue remains in the primitive palette for focus rings on light surfaces and for
blue tone combinations; it is not used for body text on Black.

### Tone combinations

`OrionTone` formalizes the four rows in the supplied combination sheet:
`green`, `warm`, `blue`, and `pink`. The public variants mirror columns A-G of
the source rather than collapsing visually different directions into one
"light" option:

- `offWhiteBackground` (A)
- `lightBackground` (B)
- `lightBackgroundDarkForeground` (C)
- `monotone` (D)
- `darkBackgroundLightForeground` (E)
- `disruptive` (F)
- `multicolor` (G; illustration and gallery use only)

The approved background/foreground mappings are:

| Tone | A | B | C | D | E | F |
|---|---|---|---|---|---|---|
| `green` | Off-white / Kryptonite Green | Kryptonite Green / Off-white | Kryptonite Green / Deep Green | Pine Green / Kryptonite Green + Deep Green | Deep Green / Kryptonite Green | Pine Green / Day Break Blue |
| `warm` | Off-white / Summer Yellow | Summer Yellow / Off-white | Summer Yellow / Party Orange | Nectarine Orange / Summer Yellow + Party Orange | Party Orange / Summer Yellow | Party Orange / Candy Pink |
| `blue` | Off-white / Day Break Blue | Day Break Blue / Off-white | Day Break Blue / Open Sky Blue | Electric Blue / Day Break Blue + Open Sky Blue | Open Sky Blue / Day Break Blue | Electric Blue / Kryptonite Green |
| `pink` | Off-white / Candy Pink | Candy Pink / Off-white | Candy Pink / Loud Red | Futuristic Pink / Candy Pink + Loud Red | Loud Red / Candy Pink | Futuristic Pink / Deep Green |

Column G exposes the six-color accent set shown for its tone, always on
Off-white. It is a composition palette, not a foreground/background pair, and
is never selected automatically for controls. Components can request a tone
and A-F variant without recreating pairings.

No component invents new hex colors. Transparency may be applied to a
primitive for overlays, pressed states, and separators.

## Typography

Font files are bundled with the package and registered from `Bundle.module`.
The reference images did not include font binaries, so implementation must use
the official upstream Space Grotesk and Manrope static font files, pin their
source revision, and preserve their Open Font License text in package
resources. Missing or failed font registration never crashes the application:
the implementation falls back to the system rounded/sans-serif design while
preserving the requested weight and relative size.

`OrionTextStyle` defines the semantic scale:

- `display` and `headline`: Space Grotesk Bold, uppercase by default, zero
  tracking, target line height `0.90 ×` the font size.
- `title` and `subheadline`: Manrope Bold, sentence case, tracking
  `-0.005 em`, target line height `1.20 ×`.
- `body`, `callout`, `caption`, and `label`: Manrope Regular, with Bold
  available for emphasis, tracking `+0.005 em`, target line height `1.30 ×`.

Sizes use `@ScaledMetric` relative to the corresponding Dynamic Type text
style. Callers apply typography through `.orionTextStyle(_:)`; they do not use
raw font names. The modifier owns font registration, size scaling, tracking,
line spacing, and optional headline capitalization.

Uppercasing is a headline presentation rule, not a mutation of stored or
accessibility text. VoiceOver receives the original readable string.

## Core Tokens

The package exposes small, typed token namespaces:

- `OrionSpacing`: `xxs`, `xs`, `sm`, `md`, `lg`, `xl`, `xxl`
- `OrionRadius`: `none`, `small`, `medium`, `large`, `pill`
- `OrionSize`: minimum control height, icon sizes, content widths, and minimum
  hit target
- `OrionMotion`: quick, standard, and expressive durations plus spring values

Token values are internal implementation details of the system. App views use
the semantic names. Motion-producing components honor
`accessibilityReduceMotion` and replace movement with an opacity transition or
no transition.

## Initial Components

The first package release includes a deliberately small set of primitives
needed by the Shelf and common Orion screens:

- `OrionButtonStyle`: primary, secondary, quiet, and destructive variants
- `OrionTextFieldStyle`: branded focus, error, and disabled states
- `OrionCard`: a grouped-content surface, not a wrapper for dense list rows
- `OrionStatusToken`: semantic state plus optional label; never decorative
- `OrionSurface`: canvas/surface container with an approved tone variant
- `OrionLogo`: `.mark` and `.wordmark` forms with configurable foreground

Components use native SwiftUI controls and preserve keyboard, focus,
accessibility, hover, disabled, and pressed behavior. They do not depend on
AppKit except for the optional macOS template-image adapter used by the Shelf's
status item.

## Public API Boundary

The package exposes value types, styles, and views. It owns no global mutable
theme singleton. Environment-aware values read SwiftUI's `colorScheme`,
`colorSchemeContrast`, `dynamicTypeSize`, and accessibility settings.

The Swift package declares macOS 26, matching the Shelf plan, and iOS 18 so
the shared API is compiled and tested as a cross-platform SwiftUI library.
macOS-only status-item adaptation is isolated behind conditional compilation.

Apps may select an `OrionTone` at a composition boundary, but cannot override
the primitive palette. This keeps brand decisions centralized while allowing
the green, warm, blue, and pink families shown in the source guide.

## Accessibility and Platform Behavior

- All foreground/background pairs used for text meet WCAG AA for their intended
  size; failing pairs remain illustration-only.
- Controls retain native focus rings and keyboard activation.
- Minimum hit targets are enforced by the component styles.
- Dynamic Type is supported, including accessibility sizes where the platform
  exposes them.
- Logo views have a localized `Orion` accessibility label when meaningful and
  are hidden when purely decorative.
- The menu-bar logo is monochrome and template-rendered; brand colors are used
  in panels and windows, not forced into the system menu bar.
- The library supports the current macOS Shelf deployment target and is written
  without macOS-only APIs in its shared views so future iOS targets can import
  it. The status-item adapter is conditionally compiled for macOS.

## Validation

Automated tests verify:

- every primitive color's exact RGB and alpha values;
- semantic role resolution in light and dark schemes;
- approved tone-pair mappings;
- font resource presence, registration, and fallback behavior;
- logo path bounds and aspect ratios for mark and wordmark;
- token ordering and nonnegative dimensions/durations;
- public components compile in representative light/dark catalog fixtures.

The catalog is visually reviewed at standard and accessibility text sizes,
light and dark appearance, increased contrast, and reduced motion. The logo is
compared against the supplied SVG at both wordmark and menu-bar sizes.

## Integration Boundary

This work creates and validates the reusable package and catalog. Updating the
Shelf plan to import `OrionDesignSystem`, replacing its `sparkles` status icon
with the Orion mark, and restyling Shelf views are the next integration step.
They are intentionally separate so the design system can be reviewed and
versioned before application-specific adoption.
