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
