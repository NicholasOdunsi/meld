import Foundation
import ShelfCore
import Testing
@testable import Orion

struct ComposerDraftTests {
    @Test func acceptsSupportedFilesAndRefusesTheRest() {
        var draft = ComposerDraft()
        #expect(draft.addFile(name: "Brand.pdf", data: Data([1])) == .added)
        #expect(draft.addFile(name: "shot.png", data: Data([1])) == .added)
        #expect(draft.addFile(name: "tool.exe", data: Data([1])) == .unsupported)
        #expect(draft.addFile(name: "big.pdf", data: Data(count: ComposerDraft.maxFileBytes + 1)) == .tooBig)
        #expect(draft.files.map(\.name) == ["Brand.pdf", "shot.png"])
    }

    @Test func capsFilesAtSix() {
        var draft = ComposerDraft()
        for i in 0..<6 { #expect(draft.addFile(name: "f\(i).txt", data: Data([1])) == .added) }
        #expect(draft.addFile(name: "f6.txt", data: Data([1])) == .full)
    }

    @Test func linksMustBeWebAndUnique() {
        var draft = ComposerDraft()
        #expect(draft.addURL(URL(string: "https://linear.app")!) == .added)
        #expect(draft.addURL(URL(string: "https://linear.app")!) == .duplicate)
        #expect(draft.addURL(URL(string: "file:///etc/passwd")!) == .notWeb)
        for host in ["a", "b"] { _ = draft.addURL(URL(string: "https://\(host).com")!) }
        #expect(draft.addURL(URL(string: "https://d.com")!) == .full)
    }

    @Test func pastedLinksMoveOutOfTheWords() {
        var draft = ComposerDraft(words: "feel like https://linear.app/ but warmer")
        draft.extractLinks()
        #expect(draft.urls == [URL(string: "https://linear.app/")!])
        #expect(draft.words == "feel like but warmer")
    }

    @Test func canReadNeedsSomethingAndRespectsTheLimit() {
        var draft = ComposerDraft()
        #expect(!draft.canRead)
        draft.words = "calm"
        #expect(draft.canRead)
        draft.words = String(repeating: "a", count: ComposerDraft.maxWords + 1)
        #expect(!draft.canRead)
        draft.words = ""
        _ = draft.addFile(name: "a.txt", data: Data([1]))
        #expect(draft.canRead)
    }

    @Test func requestCarriesEverythingAndTheReplyContext() {
        var draft = ComposerDraft(words: " calm ")
        _ = draft.addFile(name: "a.txt", data: Data([1]))
        _ = draft.addURL(URL(string: "https://linear.app")!)
        let request = draft.request(replyTo: ["c1"], tile: .density)
        #expect(request.words == "calm")
        #expect(request.files.map(\.name) == ["a.txt"])
        #expect(request.urls.count == 1)
        #expect(request.replyTo == ["c1"])
        #expect(request.tile == .density)
    }

    @Test func imageFilesAreTheOnesWorthSavingToInspiration() {
        var draft = ComposerDraft()
        _ = draft.addFile(name: "a.pdf", data: Data([1]))
        _ = draft.addFile(name: "b.png", data: Data([1]))
        #expect(draft.imageFiles.map(\.name) == ["b.png"])
    }
}

struct ComposerDraftReplyTests {
    private func card(_ id: String, origin: String?) -> TasteCard {
        TasteCard(id: id, tile: .density, op: "set", value: .string("dense"), reason: "", evidenceItemIds: [], origin: origin)
    }

    @Test func aWordsOnlyFollowUpRepliesToPendingComposerCards() {
        var draft = ComposerDraft()
        draft.words = "make it less airy"
        let pending = [card("a", origin: "composer"), card("b", origin: "learning")]
        #expect(draft.replyTargets(pending: pending) == ["a"])
    }

    @Test func aDraftWithFilesOrLinksStartsFresh() {
        var draft = ComposerDraft()
        draft.words = "use this"
        _ = draft.addFile(name: "brand.txt", data: Data("x".utf8))
        #expect(draft.replyTargets(pending: [card("a", origin: "composer")]).isEmpty)
    }

    @Test func emptyWordsReplyToNothing() {
        let draft = ComposerDraft()
        #expect(draft.replyTargets(pending: [card("a", origin: "composer")]).isEmpty)
    }
}
