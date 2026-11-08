# Orion SwiftUI Design System Implementation Plan

**Goal:** Ship the approved Orion brand as a reusable SwiftUI package and macOS catalog.
**Architecture:** Immutable primitive tokens feed appearance-aware semantic roles and native control styles. Bundled licensed fonts and original vector geometry supply branding.
**Tech Stack:** Swift 6, SwiftUI, CoreText, Swift Testing; macOS 26 and iOS 18.

Execution is inline under the user's approval to build.

## Task 1: Brand foundations
Files: Package.swift; Color/, Tokens/, Typography/, Brand/ under packages/orion-design-system/Sources/OrionDesignSystem.
- [x] Create library, macOS-only executable, and test targets.
- [x] Implement all 15 exact RGB values, semantic role resolution, A–G tone mappings and luminance contrast selection.
- [x] Bundle upstream fonts pinned to Google Fonts commit 86aced91de05cd4f96a06838124cca45be337b2b with separate OFL licenses.
- [x] Register fonts lazily on the main actor; scale typography using ScaledMetric and preserve system fallback.
- [x] Translate the supplied SVG commands into compiled paths, preserving even-odd fill; expose wordmark, mark and macOS template image.

Interfaces: OrionColor.color; OrionColorRole.resolve(in:contrast:); OrionTone.palette(for:); View.orionTextStyle(_:); OrionLogo(form:foreground:).

## Task 2: Reusable controls
Files: Components/OrionButtonStyle.swift, OrionTextFieldStyle.swift, OrionCard.swift, OrionSurface.swift, OrionStatusToken.swift.
- [x] Style native buttons with primary/secondary/quiet/destructive variants and 44-point targets.
- [x] Provide native text-field focus/error/disabled styling with accessible error description.
- [x] Build generic card/surface containers and status tokens with text plus symbols.
- [x] Honor appearance, increased contrast and reduced motion.

## Task 3: Catalog and verification
Files: Sources/OrionDesignSystemCatalog/, Tests/OrionDesignSystemTests/, README.md; root .gitignore.
- [x] Build catalog sections for brand, typography, palette, tone combinations and interactive component states.
- [x] Test exact palette, contrast, tone mappings, resource registration/fallback, logo geometry and tokens.
- [x] Run swift build and swift test with warnings as errors.
- [x] Compile library for iOS Simulator if SDK is installed.
- [x] Export and visually inspect light/dark/accessibility catalog snapshots in .context.
- [x] Document adoption, font provenance, practical typography limits and catalog commands.

Self-review: all approved scope is represented above. Shelf integration stays separate. The typography modifier styles existing views; OrionText handles locale-aware headline capitalization while retaining the original accessibility label.

Validation: seven Swift Testing tests pass with warnings as errors. iOS Simulator
library build passes for arm64 and x86_64. Astryx convention check passes.
Catalog snapshots cover light/dark and narrow width. macOS does not visibly scale
the accessibility3 request; iOS Dynamic Type and live assistive-technology interaction
still require platform QA. FontTools 4.60.2 generated the three static font weights
from the pinned upstream variable fonts; licenses are bundled.

