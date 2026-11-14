# Composer Refresh (step 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Taste's composer, remove the Orion hat, the "Orion" title and the glowing brush line, and show errors and hints in a pill that slides up above the composer (outside it) and slides back down.

**Architecture:** A small pure model (`ComposerNotice` + `ComposerNoticeCenter`) holds the one message currently shown and knows how long it lives. A `ComposerStatusPill` view draws it. `FrostedComposer` owns a center, feeds it from the Taste compose state and the "copy a link" hint, and stacks the pill above its own glass. The model and pill live in a new shared `Composer/` folder because the chat composer (step 1 of the spec) will reuse them; the shared-shell extraction itself is **not** part of this plan.

**Tech Stack:** Swift 6.2, SwiftUI (macOS 26, Liquid Glass), Swift Testing (`@Test`, `#expect`), SwiftPM in `apps/mac`.

Spec: `docs/superpowers/specs/2026-11-14-project-stream-and-stars-design.md` (build step 0, Part C "Composer (shared)").

## Global Constraints

- Read `.claude/skills/swiftui-pro` before writing SwiftUI (repo rule in `apps/mac/README.md`).
- Run tests from `apps/mac` with `swift test --filter <Name>`; the whole suite with `swift test`. The toolchain is Swift 6.2 / macOS 26.
- Swift language mode v6 for every target; `Orion` target tests use `@testable import Orion`.
- Use `OrionSpacing` tokens (`xxs 4, xs 8, sm 12, md 16, lg 24`) from `OrionDesignSystem`, never raw numbers for new spacing (existing literals in `FrostedComposer` may stay).
- Hints leave by themselves after **5 seconds**; errors **stay until tapped or the next send**.
- The pill sits **outside** the composer glass, above it. It slides up from behind the composer and slides back down on dismiss. With Reduce Motion on it only fades.
- The Taste window-level alert ("Orion couldn't do that", fed by `TasteStore.errorMessage` for card edits) is **unchanged**: no composer error uses it today (compose failures live in `composeState`), so the spec's note about moving "composer errors" off the alert is satisfied without touching it.
- Resting text stays "Tell Orion something…" and the open placeholder stays "Tell Orion what you like, or drop files here…".
- No placeholder copy changes, no new colours: errors use `Color.red.opacity(0.95)` exactly as before.

## File Structure

| File | Responsibility |
|---|---|
| Create `Sources/Orion/Composer/ComposerNotice.swift` | `ComposerNotice` value + `ComposerNoticeCenter` (current message, show, dismiss) |
| Create `Sources/Orion/Composer/TasteComposerNotice.swift` | Pure mapping from `TasteStore.ComposeState` to a notice's text and kind |
| Create `Sources/Orion/Composer/ComposerStatusPill.swift` | The pill view |
| Modify `Sources/Orion/Taste/Composer/FrostedComposer.swift` | Own a center, stack the pill, drop title/hat/brush, reading indicator |
| Delete `Sources/Orion/Taste/Composer/CyanBrushStroke.swift` and `Tests/OrionTests/BrushStrokeShapeTests.swift` | No longer used |
| Create `Tests/OrionTests/ComposerNoticeTests.swift` | Tests for the center and the Taste mapping |

---

### Task 1: Notice model and Taste mapping

**Files:**
- Create: `apps/mac/Sources/Orion/Composer/ComposerNotice.swift`
- Create: `apps/mac/Sources/Orion/Composer/TasteComposerNotice.swift`
- Test: `apps/mac/Tests/OrionTests/ComposerNoticeTests.swift`

**Interfaces:**
- Produces:
  - `struct ComposerNotice: Equatable, Identifiable` with `enum Kind { case hint, error }`, `let id: UUID`, `let text: String`, `let kind: Kind`, `var lifetime: Duration?` (5 s for `.hint`, `nil` for `.error`).
  - `@MainActor @Observable final class ComposerNoticeCenter` with `private(set) var current: ComposerNotice?`, `@discardableResult func show(_ text: String, kind: ComposerNotice.Kind) -> ComposerNotice`, `func dismiss()`, `func dismiss(id: ComposerNotice.ID)`.
  - `struct TasteComposerNotice: Equatable { let text: String; let kind: ComposerNotice.Kind; static func from(_ state: TasteStore.ComposeState) -> TasteComposerNotice? }`.

- [ ] **Step 1: Write the failing tests**

Create `apps/mac/Tests/OrionTests/ComposerNoticeTests.swift`:

```swift
import Foundation
import ShelfCore
import Testing
@testable import Orion

@MainActor
struct ComposerNoticeTests {
    @Test func aHintLeavesAfterFiveSecondsAnErrorStays() {
        #expect(ComposerNotice(text: "x", kind: .hint).lifetime == .seconds(5))
        #expect(ComposerNotice(text: "x", kind: .error).lifetime == nil)
    }

    @Test func showingReplacesTheCurrentNotice() {
        let center = ComposerNoticeCenter()
        #expect(center.current == nil)
        let first = center.show("first", kind: .hint)
        let second = center.show("second", kind: .error)
        #expect(center.current == second)
        #expect(first.id != second.id)
    }

    @Test func dismissingByIDOnlyClearsThatNotice() {
        let center = ComposerNoticeCenter()
        let old = center.show("old", kind: .hint)
        let newer = center.show("newer", kind: .hint)
        center.dismiss(id: old.id) // an old timer firing late must not clear the newer notice
        #expect(center.current == newer)
        center.dismiss(id: newer.id)
        #expect(center.current == nil)
    }

    @Test func dismissClearsWhateverIsShowing() {
        let center = ComposerNoticeCenter()
        center.show("x", kind: .error)
        center.dismiss()
        #expect(center.current == nil)
    }

    @Test func tasteStatesBecomeNotices() {
        #expect(TasteComposerNotice.from(.idle) == nil)
        #expect(TasteComposerNotice.from(.reading) == nil)
        #expect(TasteComposerNotice.from(.failed("Try again.")) == TasteComposerNotice(text: "Try again.", kind: .error))
        let skipped = [
            TasteComposeSkipped(name: "a.pdf", reason: "bad"),
            TasteComposeSkipped(name: "b.png", reason: "bad"),
        ]
        #expect(TasteComposerNotice.from(.noResult(skipped: skipped))
            == TasteComposerNotice(text: "Couldn't read: a.pdf, b.png. Add a few words, or try another link.", kind: .error))
        #expect(TasteComposerNotice.from(.noResult(skipped: []))
            == TasteComposerNotice(text: "Nothing new fit your Taste. Lists may be full, or try saying what to change.", kind: .error))
        #expect(TasteComposerNotice.from(.done(skipped: skipped))
            == TasteComposerNotice(text: "Couldn't read: a.pdf, b.png", kind: .error))
        #expect(TasteComposerNotice.from(.done(skipped: [])) == nil)
    }
}
```

`ComposerNotice(text:kind:)` must be callable without an id (it generates one), and `TasteComposerNotice` must have a memberwise init.

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/mac`): `swift test --filter ComposerNoticeTests`
Expected: build FAIL with "cannot find 'ComposerNotice' in scope".

- [ ] **Step 3: Write the minimal implementation**

Create `apps/mac/Sources/Orion/Composer/ComposerNotice.swift`:

```swift
import Foundation
import Observation

/// One short message shown in the pill above a composer.
struct ComposerNotice: Equatable, Identifiable {
    enum Kind: Equatable { case hint, error }

    let id: UUID
    let text: String
    let kind: Kind

    init(text: String, kind: Kind) {
        self.id = UUID()
        self.text = text
        self.kind = kind
    }

    /// How long it stays before leaving by itself. Errors stay until dismissed.
    var lifetime: Duration? { kind == .hint ? .seconds(5) : nil }
}

/// Holds the one notice a composer is showing. A new notice replaces the old one.
@MainActor
@Observable
final class ComposerNoticeCenter {
    private(set) var current: ComposerNotice?

    @discardableResult
    func show(_ text: String, kind: ComposerNotice.Kind) -> ComposerNotice {
        let notice = ComposerNotice(text: text, kind: kind)
        current = notice
        return notice
    }

    func dismiss() { current = nil }

    /// Clears the notice only if it is still the one the caller started a timer for.
    func dismiss(id: ComposerNotice.ID) {
        if current?.id == id { current = nil }
    }
}
```

Create `apps/mac/Sources/Orion/Composer/TasteComposerNotice.swift`:

```swift
import ShelfCore

/// What the Taste composer says after Orion reads something. Wording is unchanged from the old in-composer text.
struct TasteComposerNotice: Equatable {
    let text: String
    let kind: ComposerNotice.Kind

    static func from(_ state: TasteStore.ComposeState) -> TasteComposerNotice? {
        switch state {
        case .failed(let message):
            return TasteComposerNotice(text: message, kind: .error)
        case .noResult(let skipped) where !skipped.isEmpty:
            return TasteComposerNotice(
                text: "Couldn't read: \(skipped.map(\.name).joined(separator: ", ")). Add a few words, or try another link.",
                kind: .error
            )
        case .noResult:
            return TasteComposerNotice(
                text: "Nothing new fit your Taste. Lists may be full, or try saying what to change.",
                kind: .error
            )
        case .done(let skipped) where !skipped.isEmpty:
            return TasteComposerNotice(
                text: "Couldn't read: \(skipped.map(\.name).joined(separator: ", "))",
                kind: .error
            )
        case .idle, .reading, .done:
            return nil
        }
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `swift test --filter ComposerNoticeTests`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/Orion/Composer apps/mac/Tests/OrionTests/ComposerNoticeTests.swift
git commit -m "feat(mac): composer notice model and Taste notice mapping

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Status pill above the Taste composer

**Files:**
- Create: `apps/mac/Sources/Orion/Composer/ComposerStatusPill.swift`
- Modify: `apps/mac/Sources/Orion/Taste/Composer/FrostedComposer.swift` (the `linkHint` state, `statusMessage`, `body`, `title(isSweeping:)` status text, `collapseToRest`, `send`, `addLinkFromClipboard`)

**Interfaces:**
- Consumes (Task 1): `ComposerNotice`, `ComposerNoticeCenter`, `TasteComposerNotice.from(_:)`.
- Produces: `struct ComposerStatusPill: View { init(notice: ComposerNotice, onDismiss: @escaping () -> Void) }`.

- [ ] **Step 1: Write the pill view**

Create `apps/mac/Sources/Orion/Composer/ComposerStatusPill.swift`:

```swift
import AppKit
import OrionDesignSystem
import SwiftUI

/// A short message that rides just above a composer, outside its glass. Tap to dismiss.
struct ComposerStatusPill: View {
    let notice: ComposerNotice
    let onDismiss: () -> Void

    var body: some View {
        Button(action: onDismiss) {
            HStack(spacing: OrionSpacing.xs) {
                if notice.kind == .error {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(Color.red.opacity(0.95))
                        .accessibilityHidden(true)
                }
                Text(notice.text)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(.white.opacity(0.92))
                    .multilineTextAlignment(.leading)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, OrionSpacing.md)
            .padding(.vertical, OrionSpacing.xs + 2)
            .glassEffect(.regular.tint(.black.opacity(0.35)), in: .capsule)
            .shadow(color: .black.opacity(0.3), radius: 12, y: 4)
        }
        .buttonStyle(.plain)
        .pointerStyle(.link)
        .help("Dismiss")
        .accessibilityElement(children: .combine)
        .accessibilityHint("Dismisses this message")
        .onAppear {
            NSAccessibility.post(
                element: NSApp as Any,
                notification: .announcementRequested,
                userInfo: [.announcement: notice.text, .priority: NSAccessibilityPriorityLevel.high.rawValue]
            )
        }
    }
}
```

- [ ] **Step 2: Own a notice center in `FrostedComposer` and stack the pill**

In `apps/mac/Sources/Orion/Taste/Composer/FrostedComposer.swift`:

1. Replace the `@State private var linkHint = false` line with:

```swift
    @State private var notices = ComposerNoticeCenter()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
```

2. Delete the whole `statusMessage` computed property (the block starting `/// Hints and errors under the field — red when something went wrong.` through its closing brace).

3. In `body`, inside the outer `VStack(spacing: 0)`, directly **above** the `Group { if !composerEnabled { ... } }` line, insert:

```swift
            if let notice = notices.current {
                ComposerStatusPill(notice: notice) { notices.dismiss(id: notice.id) }
                    .padding(.bottom, OrionSpacing.sm)
                    // Slides up from behind the composer; Reduce Motion only fades.
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                    .zIndex(-1)
            }
```

4. On the outer `VStack`, directly after the existing `.animation(grow, value: phase)` modifier, add:

```swift
        .animation(reduceMotion ? .easeInOut(duration: 0.2) : .smooth(duration: 0.28), value: notices.current?.id)
        .onChange(of: TasteComposerNotice.from(model.store.composeState)) { _, notice in
            // Only react when something new appears. Collapsing resets the store to .idle (nil) and must not remove a message the user has not read yet.
            guard let notice else { return }
            notices.show(notice.text, kind: notice.kind)
        }
        .task(id: notices.current?.id) {
            guard let notice = notices.current, let lifetime = notice.lifetime else { return }
            do { try await Task.sleep(for: lifetime) } catch { return }
            notices.dismiss(id: notice.id)
        }
```

5. In `title(isSweeping:)`, delete the whole `if let status = statusMessage, !isSweeping { ... }` block (the `Text(status.text)` view and its modifiers). Leave the `Spacer(minLength:)` line above it in place for now (Task 3 removes the whole title).

6. In `collapseToRest()`, delete the line `linkHint = false`.

7. In `send()`, replace `linkHint = false` with `notices.dismiss()`.

8. Replace the whole `addLinkFromClipboard()` body with:

```swift
    private func addLinkFromClipboard() {
        notices.dismiss()
        let text = NSPasteboard.general.string(forType: .string) ?? ""
        if let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)), draft.addURL(url) == .added { return }
        notices.show("Copy a link, then tap +, or paste it into the box.", kind: .hint)
        isFocused = true
    }
```

- [ ] **Step 3: Build**

Run (from `apps/mac`): `swift build`
Expected: Build complete with no errors and no new warnings from these files. If `NSAccessibility.post(... .announcementRequested ...)` is rejected by the compiler on this SDK, replace the `.onAppear` block with `AccessibilityNotification.Announcement(notice.text).post()` (SwiftUI, macOS 14+) and keep everything else.

- [ ] **Step 4: Run the whole Orion test target**

Run: `swift test --filter OrionTests`
Expected: all PASS (nothing else referenced `linkHint` or `statusMessage`).

- [ ] **Step 5: Look at it**

Run (from the repo root): `apps/mac/scripts/preview.sh`
In "Orion Preview" open Taste, click the composer to open it, then:
- Press **+ → Add a link from the clipboard** with plain text (not a link) on the clipboard. A hint pill must slide up above the composer, outside its glass, and slide back down by itself after about 5 seconds.
- With the network off (or a bad key), send a request. A red-icon error pill must slide up and **stay** until you tap it; tapping slides it down.
- Turn on System Settings ▸ Accessibility ▸ Display ▸ Reduce motion: the pill must fade instead of sliding.
Save a screenshot of the hint pill to `.context/composer-pill.png`.

- [ ] **Step 6: Commit**

```bash
git add apps/mac/Sources/Orion/Composer/ComposerStatusPill.swift apps/mac/Sources/Orion/Taste/Composer/FrostedComposer.swift
git commit -m "feat(mac): show composer errors and hints in a sliding pill above the composer

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Remove the hat, "Orion" title and brush line

**Files:**
- Modify: `apps/mac/Sources/Orion/Taste/Composer/FrostedComposer.swift`
- Delete: `apps/mac/Sources/Orion/Taste/Composer/CyanBrushStroke.swift`
- Delete: `apps/mac/Tests/OrionTests/BrushStrokeShapeTests.swift`
- Modify: `apps/mac/README.md` (one line)

**Interfaces:**
- Consumes (Task 2): `FrostedComposer` already routes all status text through the pill, so the title row no longer carries any message.

- [ ] **Step 1: Delete the title and its animation state in `FrostedComposer.swift`**

1. Delete the property and its doc comment:
```swift
    /// Orion hat + name fade in after the shell starts growing.
    @State private var chromeOpacity: Double = 0
```
2. Delete the whole `title(isSweeping:)` function (from `private func title(isSweeping: Bool) -> some View {` through its closing brace, including the `.opacity(chromeOpacity)` modifier).
3. In `.onChange(of: isReading) { _, reading in ... }` delete the whole modifier (its only job was `chromeOpacity = 1`).
4. In `expand()` delete the two lines:
```swift
        // Hat + "Orion" ease in slightly after the grow starts.
        withAnimation(.easeOut(duration: 0.28).delay(0.06)) { chromeOpacity = 1 }
```
5. In `collapseToRest()` change
```swift
        withAnimation(.easeIn(duration: 0.12)) {
            chromeOpacity = 0
            sendReveal = 0.85
        }
```
to
```swift
        withAnimation(.easeIn(duration: 0.12)) {
            sendReveal = 0.85
        }
```
6. In `expandedTop`, replace the reading branch and the start of the else branch so it reads:

```swift
    @ViewBuilder private var expandedTop: some View {
        if isReading {
            HStack(spacing: OrionSpacing.xs) {
                ProgressView()
                    .controlSize(.small)
                    .tint(.white)
                Text(ComposerStatusText.reading(files: draft.files.map(\.name), links: draft.urls.map { $0.host() ?? $0.absoluteString }))
                    .font(.system(size: 15, weight: .light))
            }
            Text(ComposerStatusText.readingDetail)
                .font(.system(size: 13, weight: .light))
                .foregroundStyle(Color(red: 0.75, green: 0.94, blue: 0.96))
                .padding(.top, OrionSpacing.sm)
                .padding(.bottom, OrionSpacing.sm)
        } else {
            ComposerAttachments(draft: $draft, skipped: skipped)
            TextField("Tell Orion what you like, or drop files here…", text: $draft.words, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 15, weight: .light))
                .lineLimit(1...6)
                .focused($isFocused)
                .padding(.top, OrionSpacing.xs)
```
Keep the existing `.onChange(of: draft.words)`, `.onKeyPress`, `.onAppear`, and the over-3500-words counter exactly as they are after the `TextField` modifiers.

- [ ] **Step 2: Delete the unused brush files**

```bash
git rm apps/mac/Sources/Orion/Taste/Composer/CyanBrushStroke.swift apps/mac/Tests/OrionTests/BrushStrokeShapeTests.swift
```
Then confirm nothing else uses them:
Run: `grep -rn "CyanBrushStroke\|BrushStrokeShape\|OrionHatMark" apps/mac/Sources/Orion/Taste`
Expected: no output. (`OrionHatMark` is still used in other folders such as `Frame/`; only the Taste composer stops using it.)

- [ ] **Step 3: Build and run all tests**

Run (from `apps/mac`): `swift build && swift test`
Expected: Build complete; the whole suite PASSES (the brush test is gone, so the count drops by one test).

- [ ] **Step 4: Look at it**

Run (repo root): `apps/mac/scripts/preview.sh`. In Taste:
- Resting composer: unchanged ("Tell Orion something…").
- Open composer: no hat, no "Orion", no glowing line. The text field starts near the top with comfortable padding (about the same gap above the text as below the `+` row). If the top gap looks too tight or too loose, adjust only `.padding(.top, OrionSpacing.xs)` on the `TextField` and the shell's `.padding(.top, phase == .resting ? 11 : 14)`.
- Press send with a file: while Orion reads, a small spinner sits left of "Reading <name>…" and the detail line is below. No sweeping line.
- Trigger an error: the pill (from Task 2) still appears above the composer.
Save screenshots to `.context/composer-open.png` and `.context/composer-reading.png`.

- [ ] **Step 5: Note it in the README and commit**

In `apps/mac/README.md`, replace the line `Taste has a composer: type, drop files or paste links and Orion suggests changes as cards you Keep or Remove.` with:

```
Taste has a composer: type, drop files or paste links and Orion suggests changes as cards you Keep or Remove. Problems and hints appear in a small pill above the composer.
```

```bash
git add -A apps/mac
git commit -m "feat(mac): remove the Orion hat, title and brush line from the Taste composer

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review (against the spec)

- **Spec, Part A "composer is the Taste composer… hat and title removed… errors become a pill that slides up above, outside it":** Task 2 (pill, slide, outside the glass, Reduce Motion) + Task 3 (hat, title, glowing line removed, reading indicator replaced).
- **Spec Part C status pill rules (hints ~5 s, errors stay until tapped or next send, sends dismiss):** `ComposerNotice.lifetime` (Task 1), the `.task(id:)` timer and `send()` dismiss (Task 2).
- **"Taste's current in-composer error text … move to it":** `statusMessage` deleted and replaced by `TasteComposerNotice` (Tasks 1–2). The window alert for card-edit errors is intentionally untouched (see Global Constraints).
- **Shared composer shell extraction and the model selector:** deliberately **not** here; they belong to step 1, which will consume `ComposerNotice`, `ComposerNoticeCenter` and `ComposerStatusPill` from `Sources/Orion/Composer/`.
- **Type consistency:** `ComposerNotice(text:kind:)`, `ComposerNoticeCenter.show(_:kind:)`, `dismiss()`, `dismiss(id:)`, `TasteComposerNotice.from(_:)` are named identically in all tasks. `linkHint`, `statusMessage`, `chromeOpacity` and `title(isSweeping:)` are removed everywhere they were referenced (Tasks 2 and 3 cover every use).
