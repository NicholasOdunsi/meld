# Taste style-guide board — Plan 3: the frosted-ice composer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Taste composer its new look: a centred, floating frosted-ice panel (blurred glass, bright icy rim, thin light lettering, a glowing cyan brush stroke under the name "Orion"), a small resting pill that grows when used, and a round send button with an up arrow that replaces "Read it". No chains.

**Architecture:** The composer's logic (draft, limits, compose call, attachments) does not change. This plan adds small pure units for the three phases and their sizes (tested), a handful of focused visual pieces (glass modifier, frost specks, brush stroke, send button), and one new `FrostedComposer` view that replaces `TasteComposerView`'s look. `TasteScreen` mounts it as a floating overlay instead of a docked bottom bar.

**Tech Stack:** Swift 6.2 / SwiftUI (macOS 26 `glassEffect`) / Swift Testing.

**Spec:** `docs/superpowers/specs/2026-11-10-taste-style-guide-board-design.md` (Part A "The composer (new look)", B9). **Depends on:** Plans 1 and 2 merged (no Apple chip; `TasteScreen` is the board screen; `ComposerDraft.replyTargets` exists; `TasteModel` has `openSlot`).

## Global Constraints

- Sizes (verbatim from the spec, B9): resting pill **400 pt** wide, centred; open panel **560 pt** wide (never wider than the window minus **60 pt**), centred, grows upward. Send circle **30 pt** resting (dim), **34 pt** open (cyan with a dark arrow), **34 pt** dim while reading.
- Phases: **resting** (a "+", the placeholder "Tell Orion something…", a dim send circle), **open** (title "Orion" with the cyan stroke, thin 18 pt text, file and link chips, **+ File**, **+ Link**, the send circle), **reading** (title with the sweeping stroke, a status line, a dim send circle). No spinner.
- Send: the button is a **circle with an up arrow** (SF Symbol `arrow.up`). Dim when there is nothing to send, when the store cannot edit, or while reading. **Return sends; Shift-Return adds a line.** Accessibility label "Send to Orion".
- Glass: real macOS blur via `.glassEffect(.regular.tint(...), in: shape)`, a 1.5 pt white rim at about 55% opacity, an inner glow, a few frost specks near the edges. The cyan stroke is Orion cyan, `OrionColor.dayBreakBlue` (`#00E1F3`), drawn as a tapered brush path with a soft glow. Its sweep is a **1.6 s** ease-out (`timingCurve(0.2, 0, 0, 1)`) loop that auto-reverses. With macOS **Reduce Motion** on, the stroke stays still and full, and the panel resizes without animation.
- No chains. Limits and server rules from the Plan 3 composer (native-taste-3) are unchanged: text ≤ 4,000 chars, ≤ 6 files (PDF, DOCX, TXT/MD, PNG/JPG/WebP) of ≤ 10 MB each, ≤ 3 links.
- Copy: the button no longer says "Read it". The reading status line is `Looking for lettering, shape and spacing. Nothing changes until you press Keep.`
- The "Also save images to Inspiration" checkbox (off by default) stays, shown in the open panel when images are attached.
- Use `OrionSpacing`, `OrionColor`; strict concurrency (Swift language mode 6).
- All commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Commands: `cd apps/mac && swift build --build-tests && swift test --filter <Name>`.

## File Structure

| File | Job |
|---|---|
| `apps/mac/Sources/Orion/Taste/Composer/ComposerPhase.swift` (+ `Tests/OrionTests/ComposerPhaseTests.swift`) | `ComposerPhase`, `ComposerMetrics`, `ComposerStatusText`: pure |
| `.../Composer/IceGlass.swift` | The frosted-ice background modifier and `FrostSpecks` |
| `.../Composer/CyanBrushStroke.swift` (+ `Tests/OrionTests/BrushStrokeShapeTests.swift`) | `BrushStrokeShape` and the animated `CyanBrushStroke` |
| `.../Composer/ComposerSendButton.swift` | The round send button |
| `.../Composer/FrostedComposer.swift` | The composer view (resting, open, reading) |
| `.../Taste/ComposerAttachments.swift` | Frosted chip colours |
| `.../Taste/TasteScreen.swift` | Mount the composer as a floating overlay |
| `.../Taste/TasteComposerView.swift` | Deleted (logic moved) |

---

### Task 1: Phases, sizes and status text (pure)

**Files:**
- Create: `apps/mac/Sources/Orion/Taste/Composer/ComposerPhase.swift`
- Test: `apps/mac/Tests/OrionTests/ComposerPhaseTests.swift`

**Interfaces:**
- Produces: `enum ComposerPhase { case resting, open, reading; static func of(isExpanded: Bool, hasContent: Bool, isReading: Bool) -> ComposerPhase }`; `enum ComposerMetrics { static let restingWidth: CGFloat = 400; static let openWidth: CGFloat = 560; static let windowMargin: CGFloat = 60; static func width(for: ComposerPhase, available: CGFloat) -> CGFloat; static func sendSize(for: ComposerPhase) -> CGFloat; static func cornerRadius(for: ComposerPhase) -> CGFloat }`; `enum ComposerSend { static func isBright(canSend: Bool, canEdit: Bool, isReading: Bool) -> Bool }`; `enum ComposerStatusText { static func reading(files: [String], links: [String]) -> String; static let readingDetail: String }`.

- [ ] **Step 1: Write the failing tests**

Create `apps/mac/Tests/OrionTests/ComposerPhaseTests.swift`:

```swift
import Foundation
import Testing
@testable import Orion

struct ComposerPhaseTests {
    @Test func theComposerIsRestingUntilUsedOrFilled() {
        #expect(ComposerPhase.of(isExpanded: false, hasContent: false, isReading: false) == .resting)
        #expect(ComposerPhase.of(isExpanded: true, hasContent: false, isReading: false) == .open)
        #expect(ComposerPhase.of(isExpanded: false, hasContent: true, isReading: false) == .open)
    }

    @Test func readingWinsOverEverything() {
        #expect(ComposerPhase.of(isExpanded: false, hasContent: false, isReading: true) == .reading)
        #expect(ComposerPhase.of(isExpanded: true, hasContent: true, isReading: true) == .reading)
    }

    @Test func widthsMatchTheSpecAndNeverExceedTheWindowMinusMargin() {
        #expect(ComposerMetrics.width(for: .resting, available: 1000) == 400)
        #expect(ComposerMetrics.width(for: .open, available: 1000) == 560)
        #expect(ComposerMetrics.width(for: .reading, available: 1000) == 560)
        #expect(ComposerMetrics.width(for: .open, available: 500) == 440)
        #expect(ComposerMetrics.width(for: .resting, available: 420) == 360)
        #expect(ComposerMetrics.width(for: .open, available: 40) == 0)
    }

    @Test func sendCircleSizes() {
        #expect(ComposerMetrics.sendSize(for: .resting) == 30)
        #expect(ComposerMetrics.sendSize(for: .open) == 34)
        #expect(ComposerMetrics.sendSize(for: .reading) == 34)
    }

    @Test func theSendCircleIsBrightOnlyWhenSendingIsPossible() {
        #expect(ComposerSend.isBright(canSend: true, canEdit: true, isReading: false))
        #expect(!ComposerSend.isBright(canSend: false, canEdit: true, isReading: false))
        #expect(!ComposerSend.isBright(canSend: true, canEdit: false, isReading: false))
        #expect(!ComposerSend.isBright(canSend: true, canEdit: true, isReading: true))
    }

    @Test func readingStatusNamesWhatIsBeingRead() {
        #expect(ComposerStatusText.reading(files: [], links: []) == "Reading what you wrote…")
        #expect(ComposerStatusText.reading(files: ["Brand-guide.pdf"], links: []) == "Reading Brand-guide.pdf…")
        #expect(ComposerStatusText.reading(files: ["Brand-guide.pdf"], links: ["stripe.com/design"]) == "Reading Brand-guide.pdf, then stripe.com/design…")
        #expect(ComposerStatusText.reading(files: ["a.pdf", "b.pdf"], links: ["c.com"]) == "Reading a.pdf, then b.pdf, and 1 more…")
        #expect(ComposerStatusText.readingDetail == "Looking for lettering, shape and spacing. Nothing changes until you press Keep.")
    }
}
```

- [ ] **Step 2: Run and see it fail**

Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -15`
Expected: FAIL (types do not exist).

- [ ] **Step 3: Implement**

Create `apps/mac/Sources/Orion/Taste/Composer/ComposerPhase.swift`:

```swift
import CoreGraphics
import Foundation

/// Which of its three looks the composer wears.
enum ComposerPhase: Equatable {
    case resting, open, reading

    static func of(isExpanded: Bool, hasContent: Bool, isReading: Bool) -> ComposerPhase {
        if isReading { return .reading }
        return (isExpanded || hasContent) ? .open : .resting
    }
}

enum ComposerMetrics {
    static let restingWidth: CGFloat = 400
    static let openWidth: CGFloat = 560
    static let windowMargin: CGFloat = 60

    /// Spec B9: 400 resting, 560 open, never wider than the window minus 60.
    static func width(for phase: ComposerPhase, available: CGFloat) -> CGFloat {
        let target = phase == .resting ? restingWidth : openWidth
        return min(target, max(available - windowMargin, 0))
    }

    static func sendSize(for phase: ComposerPhase) -> CGFloat { phase == .resting ? 30 : 34 }
    static func cornerRadius(for phase: ComposerPhase) -> CGFloat { phase == .resting ? 30 : 28 }
}

enum ComposerSend {
    static func isBright(canSend: Bool, canEdit: Bool, isReading: Bool) -> Bool {
        canSend && canEdit && !isReading
    }
}

enum ComposerStatusText {
    static let readingDetail = "Looking for lettering, shape and spacing. Nothing changes until you press Keep."

    static func reading(files: [String], links: [String]) -> String {
        let names = files + links
        switch names.count {
        case 0: return "Reading what you wrote…"
        case 1: return "Reading \(names[0])…"
        case 2: return "Reading \(names[0]), then \(names[1])…"
        default: return "Reading \(names[0]), then \(names[1]), and \(names.count - 2) more…"
        }
    }
}
```

- [ ] **Step 4: Run and see it pass**

Run: `cd apps/mac && swift test --filter ComposerPhaseTests 2>&1 | tail -15`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/Orion/Taste/Composer/ComposerPhase.swift apps/mac/Tests/OrionTests/ComposerPhaseTests.swift
git commit -m "feat(mac): composer phases, sizes and status text

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The glass, the frost, the stroke and the send button

**Files:**
- Create: `apps/mac/Sources/Orion/Taste/Composer/IceGlass.swift`, `CyanBrushStroke.swift`, `ComposerSendButton.swift`
- Test: `apps/mac/Tests/OrionTests/BrushStrokeShapeTests.swift`

**Interfaces:**
- Produces: `View.iceGlass(cornerRadius: CGFloat) -> some View`; `BrushStrokeShape: Shape`; `CyanBrushStroke(isSweeping: Bool, width: CGFloat = 320)`; `ComposerSendButton(size: CGFloat, isBright: Bool, action: () -> Void)`.

- [ ] **Step 1: Write the failing test**

Create `apps/mac/Tests/OrionTests/BrushStrokeShapeTests.swift`:

```swift
import SwiftUI
import Testing
@testable import Orion

struct BrushStrokeShapeTests {
    @Test func theStrokeStaysInsideItsRectAndTapersAtBothEnds() {
        let rect = CGRect(x: 0, y: 0, width: 320, height: 8)
        let path = BrushStrokeShape().path(in: rect)
        let bounds = path.boundingRect
        #expect(!path.isEmpty)
        #expect(bounds.minX >= rect.minX - 0.5 && bounds.maxX <= rect.maxX + 0.5)
        #expect(bounds.minY >= rect.minY - 3 && bounds.maxY <= rect.maxY + 3)
        // Thicker in the middle than at the very start.
        let middle = BrushStrokeShape.thickness(at: 0.5, height: 8)
        let start = BrushStrokeShape.thickness(at: 0.0, height: 8)
        let end = BrushStrokeShape.thickness(at: 1.0, height: 8)
        #expect(middle > start)
        #expect(middle > end)
    }
}
```

- [ ] **Step 2: Run and see it fail**

Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -15`
Expected: FAIL (`BrushStrokeShape` does not exist).

- [ ] **Step 3: Implement**

`Composer/CyanBrushStroke.swift`:

```swift
import OrionDesignSystem
import SwiftUI

/// A tapered, slightly rough brush stroke, drawn from deterministic maths so it never flickers.
struct BrushStrokeShape: Shape {
    /// Full thickness at `t` (0...1) along the stroke: thin at both ends, fullest in the middle, with a little roughness.
    static func thickness(at t: Double, height: CGFloat) -> CGFloat {
        let taper = sin(Double.pi * min(max(t, 0), 1))
        let rough = 1 + 0.18 * sin(t * 37) + 0.12 * sin(t * 91)
        return height * CGFloat((0.25 + 0.75 * taper) * rough)
    }

    func path(in rect: CGRect) -> Path {
        let steps = 28
        var top: [CGPoint] = []
        var bottom: [CGPoint] = []
        for index in 0...steps {
            let t = Double(index) / Double(steps)
            let x = rect.minX + rect.width * CGFloat(t)
            let half = Self.thickness(at: t, height: rect.height) / 2
            top.append(CGPoint(x: x, y: rect.midY - half))
            bottom.append(CGPoint(x: x, y: rect.midY + half * 0.8))
        }
        var path = Path()
        guard let first = top.first else { return path }
        path.move(to: first)
        top.dropFirst().forEach { path.addLine(to: $0) }
        bottom.reversed().forEach { path.addLine(to: $0) }
        path.closeSubpath()
        return path
    }
}

/// The glowing cyan stroke under "Orion". Sweeps back and forth while Orion reads.
struct CyanBrushStroke: View {
    var isSweeping: Bool
    var width: CGFloat = 320

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var extent: CGFloat = 1

    private var cyan: Color { OrionColor.dayBreakBlue.color }

    var body: some View {
        BrushStrokeShape()
            .fill(LinearGradient(
                stops: [
                    .init(color: .clear, location: 0),
                    .init(color: cyan, location: 0.10),
                    .init(color: Color(red: 0.75, green: 0.98, blue: 1.0), location: 0.34),
                    .init(color: cyan, location: 0.62),
                    .init(color: cyan.opacity(0.25), location: 0.92),
                    .init(color: .clear, location: 1),
                ],
                startPoint: .leading,
                endPoint: .trailing
            ))
            .frame(width: width, height: 8)
            .shadow(color: cyan.opacity(0.9), radius: 6)
            .shadow(color: .white.opacity(0.5), radius: 1.5)
            .scaleEffect(x: extent, y: 1, anchor: .leading)
            .onChange(of: isSweeping, initial: true) { _, sweeping in
                guard !reduceMotion else { extent = 1; return }
                if sweeping {
                    extent = 0.15
                    withAnimation(.timingCurve(0.2, 0, 0, 1, duration: 1.6).repeatForever(autoreverses: true)) { extent = 1 }
                } else {
                    withAnimation(.linear(duration: 0)) { extent = 1 }
                }
            }
            .accessibilityHidden(true)
    }
}
```

`Composer/IceGlass.swift`:

```swift
import SwiftUI

/// Frost specks near the rim: fixed positions, so the panel never shimmers on its own.
struct FrostSpecks: View {
    private static let dots: [(x: Double, y: Double, r: Double, a: Double)] = [
        (0.06, 0.18, 1.1, 0.60), (0.11, 0.82, 1.0, 0.50), (0.93, 0.22, 1.2, 0.60), (0.87, 0.76, 1.0, 0.40),
        (0.30, 0.04, 1.0, 0.50), (0.68, 0.97, 1.0, 0.45), (0.03, 0.55, 1.4, 0.40), (0.97, 0.50, 1.4, 0.40),
        (0.18, 0.07, 0.8, 0.50), (0.82, 0.93, 0.8, 0.50), (0.45, 0.03, 0.7, 0.35), (0.55, 0.98, 0.7, 0.35),
    ]

    var body: some View {
        Canvas { context, size in
            for dot in Self.dots {
                let rect = CGRect(x: dot.x * size.width - dot.r, y: dot.y * size.height - dot.r, width: dot.r * 2, height: dot.r * 2)
                context.fill(Path(ellipseIn: rect), with: .color(.white.opacity(dot.a)))
            }
        }
        .blendMode(.screen)
        .allowsHitTesting(false)
    }
}

private struct IceGlass: ViewModifier {
    let cornerRadius: CGFloat

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        content
            .glassEffect(.regular.tint(.black.opacity(0.35)), in: shape)
            .overlay {
                ZStack {
                    // inner glow near the rim
                    shape.strokeBorder(Color.white.opacity(0.28), lineWidth: 10).blur(radius: 8).clipShape(shape)
                    // the bright icy rim
                    shape.strokeBorder(Color.white.opacity(0.55), lineWidth: 1.5)
                }
                .allowsHitTesting(false)
            }
            .overlay { FrostSpecks().clipShape(shape) }
            .shadow(color: .black.opacity(0.45), radius: 24, y: 12)
    }
}

extension View {
    /// The frosted-ice look: real blur, a bright rim, an inner glow and a few frost specks.
    func iceGlass(cornerRadius: CGFloat) -> some View { modifier(IceGlass(cornerRadius: cornerRadius)) }
}
```

`Composer/ComposerSendButton.swift`:

```swift
import OrionDesignSystem
import SwiftUI

/// A circle with an up arrow. Dim when there is nothing to send, bright cyan when there is.
struct ComposerSendButton: View {
    let size: CGFloat
    let isBright: Bool
    let action: () -> Void

    private var cyan: Color { OrionColor.dayBreakBlue.color }

    var body: some View {
        Button(action: action) {
            Image(systemName: "arrow.up")
                .font(.system(size: size * 0.42, weight: .bold))
                .foregroundStyle(isBright ? Color(red: 0.016, green: 0.15, blue: 0.17) : Color.white.opacity(0.55))
                .frame(width: size, height: size)
                .background {
                    if isBright {
                        Circle().fill(LinearGradient(colors: [Color(red: 0.56, green: 0.96, blue: 1.0), cyan], startPoint: .top, endPoint: .bottom))
                    } else {
                        Circle().fill(Color.white.opacity(0.14))
                    }
                }
                .overlay { if !isBright { Circle().strokeBorder(Color.white.opacity(0.28), lineWidth: 1) } }
                .shadow(color: isBright ? cyan.opacity(0.55) : .clear, radius: 9)
        }
        .buttonStyle(.plain)
        .disabled(!isBright)
        .accessibilityLabel("Send to Orion")
    }
}
```

- [ ] **Step 4: Build and test**

Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -20 && swift test --filter BrushStrokeShapeTests 2>&1 | tail -10`
Expected: builds; test PASS. Fix any compiler API mismatch (for example if `Glass.tint` has a different spelling in the installed SDK, use the nearest available `.glassEffect` form with a dark tint) while keeping the look above.

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/Orion/Taste/Composer apps/mac/Tests/OrionTests/BrushStrokeShapeTests.swift
git commit -m "feat(mac): frosted-ice glass, cyan brush stroke and round send button

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The frosted composer, mounted as a floating overlay

**Files:**
- Create: `apps/mac/Sources/Orion/Taste/Composer/FrostedComposer.swift`
- Modify: `apps/mac/Sources/Orion/Taste/ComposerAttachments.swift`, `TasteScreen.swift`
- Delete: `apps/mac/Sources/Orion/Taste/TasteComposerView.swift`

**Interfaces:**
- Consumes: Task 1 (`ComposerPhase`, `ComposerMetrics`, `ComposerSend`, `ComposerStatusText`), Task 2 (`iceGlass`, `CyanBrushStroke`, `ComposerSendButton`), existing `ComposerDraft`, `ComposerAttachments`, `TasteModel`, `TasteStore.compose`, `AppModel.capture`.
- Produces: `FrostedComposer(model:appModel:draft:availableWidth:)`; `FrostedComposer.loadFile(at:) async -> (name: String, data: Data)?` (moved from `TasteComposerView`).

This is view code; correctness of the logic it drives is already covered by `ComposerDraftTests` and `TasteStoreTests`. Verification is the build plus the visual check in Task 4.

- [ ] **Step 1: Restyle the attachment chips for glass**

In `ComposerAttachments.swift`'s `chip(...)`: change the foreground to `isSkipped ? Color.red.opacity(0.9) : Color.white.opacity(0.92)` and replace the background with:

```swift
        .background(
            (isSkipped ? Color.red.opacity(0.18) : Color.white.opacity(0.12)),
            in: Capsule(style: .continuous)
        )
        .overlay { Capsule(style: .continuous).strokeBorder(isSkipped ? Color.red.opacity(0.5) : Color.white.opacity(0.28), lineWidth: 1) }
```

- [ ] **Step 2: Create the composer view**

Create `apps/mac/Sources/Orion/Taste/Composer/FrostedComposer.swift`:

```swift
import AppKit
import OrionDesignSystem
import ShelfCore
import SwiftUI
import UniformTypeIdentifiers

/// The floating, frosted-ice composer: words, files and links in, suggestions on the board out.
struct FrostedComposer: View {
    @Bindable var model: TasteModel
    let appModel: AppModel
    @Binding var draft: ComposerDraft
    let availableWidth: CGFloat

    @FocusState private var isFocused: Bool
    @State private var isExpanded = false
    @State private var isImporting = false
    @State private var linkHint = false

    private var composerEnabled: Bool { model.store.snapshot?.composerEnabled != false }
    private var isReading: Bool {
        if case .reading = model.store.composeState { return true }
        return false
    }
    private var hasContent: Bool { !draft.words.isEmpty || !draft.files.isEmpty || !draft.urls.isEmpty }
    private var phase: ComposerPhase { .of(isExpanded: isExpanded, hasContent: hasContent, isReading: isReading) }
    private var skipped: [TasteComposeSkipped] {
        switch model.store.composeState {
        case .done(let skipped), .noResult(let skipped): skipped
        default: []
        }
    }
    private var sendIsBright: Bool {
        ComposerSend.isBright(canSend: draft.canRead, canEdit: model.store.canEdit, isReading: isReading)
    }

    var body: some View {
        Group {
            if !composerEnabled {
                disabledPill
            } else {
                switch phase {
                case .resting: restingPill
                case .open: openPanel
                case .reading: readingPanel
                }
            }
        }
        .frame(width: ComposerMetrics.width(for: phase, available: availableWidth))
        .iceGlass(cornerRadius: ComposerMetrics.cornerRadius(for: phase))
        .foregroundStyle(.white)
        .animation(.snappy(duration: 0.2), value: phase)
        .fileImporter(isPresented: $isImporting, allowedContentTypes: Self.allowedTypes, allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            Task { await importFiles(urls) }
        }
    }

    // MARK: Phases

    private var restingPill: some View {
        HStack(spacing: OrionSpacing.sm) {
            plusButton
            Text("Tell Orion something…")
                .font(.system(size: 15, weight: .light))
                .foregroundStyle(.white.opacity(0.6))
                .frame(maxWidth: .infinity, alignment: .leading)
            ComposerSendButton(size: ComposerMetrics.sendSize(for: .resting), isBright: false, action: {})
        }
        .padding(.leading, OrionSpacing.md)
        .padding(.trailing, OrionSpacing.sm)
        .padding(.vertical, 11)
        .contentShape(.rect)
        .onTapGesture { isExpanded = true }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isButton)
    }

    private var openPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            title(isSweeping: false)
            ComposerAttachments(draft: $draft, skipped: skipped)
                .padding(.top, OrionSpacing.sm)
            TextField("Tell Orion what you like, or drop files and links here…", text: $draft.words, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 18, weight: .light))
                .lineLimit(1...6)
                .focused($isFocused)
                .padding(.top, OrionSpacing.sm + 2)
                .onChange(of: draft.words) { _, newValue in
                    if newValue.contains("http") { draft.extractLinks() }
                }
                .onKeyPress(keys: [.return]) { press in
                    guard !press.modifiers.contains(.shift) else { return .ignored }
                    guard sendIsBright else { return .handled }
                    Task { await send() }
                    return .handled
                }
                .onKeyPress(keys: [.escape]) { _ in
                    if !hasContent { isExpanded = false }
                    isFocused = false
                    return .handled
                }
            if draft.words.count > 3500 {
                Text("\(draft.words.count)/\(ComposerDraft.maxWords)")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(draft.words.count > ComposerDraft.maxWords ? Color.red : Color.white.opacity(0.6))
                    .padding(.top, OrionSpacing.xxs)
            }
            if linkHint {
                Text("Copy a link, then tap + Link, or paste it into the box.")
                    .font(.caption).foregroundStyle(.white.opacity(0.7)).padding(.top, OrionSpacing.xxs)
            }
            statusLine
            HStack(spacing: OrionSpacing.xs) {
                chip("+ File") { isImporting = true }
                chip("+ Link") { addLinkFromClipboard() }
                if !draft.imageFiles.isEmpty {
                    Toggle("Also save images to Inspiration", isOn: $draft.saveImagesToInspiration)
                        .toggleStyle(.checkbox)
                        .font(.caption)
                        .help("When on, attached images are also saved to Inspiration after a successful read.")
                }
                Spacer(minLength: OrionSpacing.sm)
                ComposerSendButton(size: ComposerMetrics.sendSize(for: .open), isBright: sendIsBright) {
                    Task { await send() }
                }
            }
            .padding(.top, OrionSpacing.md)
        }
        .padding(.horizontal, 30)
        .padding(.top, 20)
        .padding(.bottom, 18)
        .onAppear { isFocused = true }
    }

    private var readingPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            title(isSweeping: true)
            Text(ComposerStatusText.reading(files: draft.files.map(\.name), links: draft.urls.map { $0.host() ?? $0.absoluteString }))
                .font(.system(size: 18, weight: .light))
                .padding(.top, OrionSpacing.sm + 2)
            HStack(alignment: .center) {
                Text(ComposerStatusText.readingDetail)
                    .font(.system(size: 13, weight: .light))
                    .foregroundStyle(Color(red: 0.75, green: 0.94, blue: 0.96))
                Spacer(minLength: OrionSpacing.sm)
                ComposerSendButton(size: ComposerMetrics.sendSize(for: .reading), isBright: false, action: {})
            }
            .padding(.top, OrionSpacing.sm)
        }
        .padding(.horizontal, 30)
        .padding(.top, 20)
        .padding(.bottom, 18)
    }

    private var disabledPill: some View {
        Text("Add a DeepSeek key to let Orion read things. You can still edit everything by hand.")
            .font(.system(size: 13, weight: .light))
            .foregroundStyle(.white.opacity(0.75))
            .multilineTextAlignment(.leading)
            .padding(.horizontal, OrionSpacing.lg)
            .padding(.vertical, OrionSpacing.sm + 2)
    }

    // MARK: Pieces

    private func title(isSweeping: Bool) -> some View {
        Text("Orion")
            .font(.system(size: 22, weight: .light))
            .padding(.bottom, 4)
            .overlay(alignment: .bottomLeading) {
                CyanBrushStroke(isSweeping: isSweeping, width: 320).offset(x: -14, y: 5)
            }
    }

    private var plusButton: some View {
        Button { isImporting = true } label: {
            Image(systemName: "plus")
                .font(.system(size: 14, weight: .light))
                .frame(width: 26, height: 26)
                .background(Circle().fill(Color.white.opacity(0.14)))
                .overlay { Circle().strokeBorder(Color.white.opacity(0.3), lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .disabled(!model.store.canEdit)
        .accessibilityLabel("Attach a file")
    }

    private func chip(_ title: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 11.5))
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(Color.white.opacity(0.10), in: Capsule(style: .continuous))
                .overlay { Capsule(style: .continuous).strokeBorder(Color.white.opacity(0.24), lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .disabled(!model.store.canEdit)
    }

    @ViewBuilder private var statusLine: some View {
        switch model.store.composeState {
        case .failed(let message):
            Text(message).font(.caption).foregroundStyle(Color.red.opacity(0.9)).padding(.top, OrionSpacing.xxs)
        case .noResult:
            Text("Orion couldn't find anything usable in that. Try adding a few words about what you like.")
                .font(.caption).foregroundStyle(.white.opacity(0.7)).padding(.top, OrionSpacing.xxs)
        case .done(let skipped) where !skipped.isEmpty:
            Text("Couldn't read: \(skipped.map(\.name).joined(separator: ", "))")
                .font(.caption).foregroundStyle(.white.opacity(0.7)).padding(.top, OrionSpacing.xxs)
        default:
            EmptyView()
        }
    }

    // MARK: Actions

    private func send() async {
        let saveImages = draft.saveImagesToInspiration
        let images = draft.imageFiles
        let request = draft.request(replyTo: draft.replyTargets(pending: model.store.pendingCards), tile: nil)
        guard await model.store.compose(request) else { return }
        if saveImages, !images.isEmpty {
            let captured = images.map { CapturedImage(data: $0.data, sourceURL: nil) }
            await appModel.capture(captured, note: nil, roomID: nil)
        }
        draft = ComposerDraft()
        isExpanded = false
    }

    private func addLinkFromClipboard() {
        linkHint = false
        let text = NSPasteboard.general.string(forType: .string) ?? ""
        if let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)), draft.addURL(url) == .added { return }
        linkHint = true
        isFocused = true
    }

    private func importFiles(_ urls: [URL]) async {
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            guard let loaded = await Self.loadFile(at: url) else { continue }
            _ = draft.addFile(name: loaded.name, data: loaded.data)
        }
    }

    private static var allowedTypes: [UTType] {
        var types: [UTType] = [.pdf, .plainText, .png, .jpeg, .webP, .text]
        if let docx = UTType(filenameExtension: "docx") { types.append(docx) }
        return types
    }

    /// Adds dropped or pasted file URLs into the draft off the main actor.
    static func loadFile(at url: URL) async -> (name: String, data: Data)? {
        let name = url.lastPathComponent
        do {
            let data = try await Task.detached { try Data(contentsOf: url) }.value
            return (name, data)
        } catch {
            return nil
        }
    }
}
```

- [ ] **Step 3: Mount it as a floating overlay and delete the old view**

In `TasteScreen.swift`:
1. Delete the `.safeAreaInset(edge: .bottom, spacing: 0) { if showsComposer { TasteComposerView(...) } }` block and add this overlay in its place (same position in the modifier chain):

```swift
        .overlay {
            if showsComposer {
                GeometryReader { proxy in
                    let panel: CGFloat = model.openSlot == nil ? 0 : 360
                    FrostedComposer(model: model, appModel: appModel, draft: $draft, availableWidth: proxy.size.width - panel)
                        .frame(width: proxy.size.width - panel, alignment: .center)
                        .frame(maxHeight: .infinity, alignment: .bottom)
                        .padding(.bottom, OrionSpacing.lg)
                }
            }
        }
```
2. Replace every `TasteComposerView.loadFile(at:)` with `FrostedComposer.loadFile(at:)` (in `addDroppedFiles` and any paste helper).
3. In the board's `ScrollView` content (Plan 2 Task 10) change `.padding(.bottom, OrionSpacing.xl)` to `.padding(.bottom, 140)` so the last row is never hidden behind the composer.

`git rm apps/mac/Sources/Orion/Taste/TasteComposerView.swift`.

- [ ] **Step 4: Build and test**

Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -30 && swift test 2>&1 | tail -30`
Expected: builds and all tests PASS. Fix compiler API mismatches (for example `onKeyPress` signatures) while keeping: Return sends, Shift-Return passes through, Escape collapses an empty composer.

- [ ] **Step 5: Commit**

```bash
git add -A apps/mac
git commit -m "feat(mac): the frosted-ice composer, a centred floating panel with a round send button

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Verify everything

**Files:** none (verification; fix anything found in the files named).

- [ ] **Step 1: Sweep for leftovers**

Run:
```bash
grep -rnE "Read it|TasteComposerView|Make it feel like Apple|chain" apps/mac/Sources apps/mac/Tests
```
Expected: no output (a hit on the word "chain" in unrelated code such as a "responder chain" comment is fine; anything about decorative chains is a miss).

- [ ] **Step 2: Run every suite**

```bash
cd apps/mac && swift build && swift test
pnpm --filter web test
pnpm --filter @meld/contracts test
```
Expected: all green.

- [ ] **Step 3: Look at the real app**

Run `apps/mac/scripts/preview.sh` and capture the window with `screencapture -l <windowid>` (the owner's screen may be on another Space). Save to `.context/`:
1. `composer-resting.png`: a small centred pill about 400 wide with a "+", the placeholder and a dim round send button; the board is fully visible around it and the glass visibly blurs the tiles behind it.
2. `composer-open.png`: click it; the panel grows upward to about 560 wide, "Orion" with the glowing cyan stroke, thin light text, `+ File` and `+ Link` chips, a bright cyan round send button once text is typed.
3. `composer-attachments.png`: attach a PDF and paste a link; frosted chips appear above the box.
4. `composer-reading.png`: send (needs a DeepSeek key, or the demo mode's fake compose); the stroke sweeps, the status line names the file and link, the send circle is dim.
5. `composer-narrow.png`: a window narrower than 700 pt; the panel is the window minus 60 pt.
6. `composer-with-panel.png`: open a tile panel on the right; the composer stays centred in the remaining space and does not overlap the panel.
7. `composer-reduce-motion.png`: Reduce motion on; the stroke is still and full; resizing is not animated.

- [ ] **Step 4: Check the behaviour by hand**

- Return sends when the circle is bright, and does nothing when it is dim; Shift-Return adds a line.
- Escape collapses an empty open composer back to the pill.
- Dropping a file anywhere on the Taste screen adds a chip (the drop handlers live on `TasteScreen`).
- A words-only follow-up ("make it less airy") while composer suggestions are pending replaces them (the Plan 2 reply behaviour).
- With no DeepSeek key the panel shows the one-line message and no send button.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: finish the frosted composer

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(Skip if nothing changed.)
