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
