# Orion Design System

Reusable SwiftUI branding and native controls for macOS 26+ and iOS 18+.
Requires Swift 6.2+; no external Swift dependencies.

Day Break Blue (`#00E1F3`) is the interaction accent and default logo color.
The library includes all 15 supplied colors, the four A–G tone families,
Space Grotesk Bold, Manrope Regular/Bold, spacing, shape and motion tokens.

## Add to an app

In Xcode, add this directory as a local package and link `OrionDesignSystem`.
For another Swift package:

```swift
dependencies: [.package(path: "../orion-design-system")],
targets: [
    .target(name: "MyApp", dependencies: [
        .product(name: "OrionDesignSystem", package: "orion-design-system")
    ])
]
```

```swift
import SwiftUI
import OrionDesignSystem

struct CollectionView: View {
    @State private var name = ""

    var body: some View {
        OrionSurface {
            VStack(alignment: .leading, spacing: OrionSpacing.lg) {
                OrionLogo().frame(width: OrionSize.wordmarkWidth)
                OrionText("Your next idea", style: .headline)
                TextField("Collection name", text: $name)
                    .textFieldStyle(OrionTextFieldStyle())
                Button("Save inspiration", systemImage: "plus", action: save)
                    .buttonStyle(OrionButtonStyle(.primary))
                OrionStatusToken(.success, label: "Synced")
            }
            .padding(OrionSpacing.lg)
        }
        .tint(OrionColor.dayBreakBlue.color)
        .orionPreferredAppearance()
    }

    private func save() { /* App-owned action */ }
}
```

For validation feedback, use `OrionTextFieldStyle(error: "Give your collection a name.")`.
Native fields retain editing, selection and keyboard behavior. Buttons retain native
activation/focus behavior, provide hover/pressed feedback, and use minimum 44×44 targets.
Cards group content; use ordinary native list rows for dense lists.

## Color and appearance

Orion defaults to dark appearance: Black canvas (`#090909`) with Off-white text.
Apply `.orionPreferredAppearance()` at the app or window root so semantic roles
resolve to the dark palette even when the system is in light mode. Light
appearance remains fully supported for review and accessibility.

Resolve semantic roles with the view's `colorScheme` and `colorSchemeContrast`:

```swift
@Environment(\.colorScheme) private var scheme
@Environment(\.colorSchemeContrast) private var contrast

// In body:
Text("Saved inspiration")
    .foregroundStyle(OrionColorRole.textPrimary.resolve(in: scheme, contrast: contrast))
```

`surface` and `surfaceStrong` are translucent overlays intended over `canvas`.
`accent`, `selection`, `warning`, `danger`, and `disabled` are interaction or
signal colors, not universal body-text foregrounds. In particular, yellow and
red should not be used for small text on Off-white. Status tokens and destructive
buttons select a contrasting foreground automatically. Use `textPrimary` for
validation messages and pair status colors with symbols and readable labels.

`OrionTone.blue.palette(for: .monotone)` exposes a background and decorative
accents. `textForeground` is selected separately to meet 4.5:1 contrast on that
solid background. A–G preserve the supplied combinations, including combinations
that are unsuitable for text. `OrionSurface(tone: .blue, variant: .disruptive)`
automatically supplies the readable text foreground. G is an illustration palette.

## Typography

Use `.orionTextStyle(.body, emphasized: true)` on existing views, or
`OrionText("A new idea", style: .headline)` for automatic locale-aware uppercase
headlines with the original localized VoiceOver label. Pass a
`LocalizedStringResource` from the consuming app's localization bundle.

Fonts register once from package resources on the main actor. Missing resources
fall back to system sans-serif with the requested size and weight. Sizes scale
relative to semantic Dynamic Type styles through `ScaledMetric`; macOS currently
does not scale these metrics like iOS does.

Tracking follows the guide: zero for headlines, −0.005 em for subheadings,
+0.005 em for body. The guide's leading ratios are exposed by
`OrionTextStyle.lineHeightMultiple`. SwiftUI line spacing is additive to native
font metrics: the modifier adds positive spacing for body/subheadings and retains
natural headline metrics. It does not force 90% headline line boxes or claim
pixel-exact print leading. Optical kerning uses the font's native shaping.

## Logo

`OrionLogo(form: .mark)` and `.wordmark` use compiled original vector paths,
including the even-odd cutout. Both default to Day Break Blue. Set `foreground`
for another composition, or `decorative: true` to hide a repeated logo from
VoiceOver. On macOS, `OrionLogo.menuBarImage()` returns a monochrome template
`NSImage?` for `NSStatusItem`; it does not force blue into the system menu bar.
The canonical production SVG is also stored at `assets/brand/Orion.svg` in the
repository and copied into package resources.

## Catalog and checks

From the repository root:

```sh
swift run --package-path packages/orion-design-system OrionDesignSystemCatalog
swift test --package-path packages/orion-design-system -Xswiftc -warnings-as-errors
swift run --package-path packages/orion-design-system OrionDesignSystemCatalog --snapshot "$PWD/.context/orion-catalog"
```

The catalog includes light/dark appearance, typography, all colors and semantic
roles, native fields, enabled/disabled buttons, status tokens and all 28 tone
combinations. Resize the window to review adaptive layouts. Snapshot export uses
AppKit hosting because ImageRenderer cannot draw native macOS text fields.
The accessibility-size snapshot requests accessibility3, subject to macOS's
scaling behavior. Check increased contrast, Reduce Motion, keyboard navigation,
focus and VoiceOver in the live app using system accessibility settings; static
snapshots do not establish those interactions.

For an iOS Simulator compilation check, run from this directory:

```sh
xcodebuild -scheme OrionDesignSystem -destination 'generic/platform=iOS Simulator' \
    CODE_SIGNING_ALLOWED=NO SWIFT_TREAT_WARNINGS_AS_ERRORS=YES build
```

Tests cover exact palette values, readable solid-color foregrounds, appearance
roles, tone mappings, font registration/fallback, vector geometry and token
invariants. Shelf integration remains a separate step.

## Font provenance

Source: Google Fonts repository, commit
`86aced91de05cd4f96a06838124cca45be337b2b`:

- `ofl/spacegrotesk/SpaceGrotesk[wght].ttf`
- `ofl/manrope/Manrope[wght].ttf`
- The respective `OFL.txt` files are bundled separately in `Resources/Fonts`.

Static weights were instantiated from those upstream variable files using
FontTools 4.60.2:

```sh
fonttools varLib.instancer 'SpaceGrotesk[wght].ttf' wght=700 --update-name-table --no-recalc-timestamp -o SpaceGrotesk-Bold.ttf
fonttools varLib.instancer 'Manrope[wght].ttf' wght=400 --update-name-table --no-recalc-timestamp -o Manrope-Regular.ttf
fonttools varLib.instancer 'Manrope[wght].ttf' wght=700 --update-name-table --no-recalc-timestamp -o Manrope-Bold.ttf
```

Keep the OFL licenses with redistributed fonts.
