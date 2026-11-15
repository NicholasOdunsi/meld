import Testing
@testable import OrionAppCore

struct ChatComposerStateTests {
    @Test func restsWhenEmptyAndNotFocused() {
        #expect(!ChatComposerState.isExpanded(draft: "", hasAttachments: false, isFocused: false))
    }

    @Test func whitespaceAloneDoesNotKeepItOpen() {
        #expect(!ChatComposerState.isExpanded(draft: "  \n ", hasAttachments: false, isFocused: false))
    }

    @Test func opensOnFocus() {
        #expect(ChatComposerState.isExpanded(draft: "", hasAttachments: false, isFocused: true))
    }

    @Test func staysOpenWhileThereIsADraftEvenWithoutFocus() {
        #expect(ChatComposerState.isExpanded(draft: "hello", hasAttachments: false, isFocused: false))
    }

    @Test func staysOpenWithAStagedFile() {
        #expect(ChatComposerState.isExpanded(draft: "", hasAttachments: true, isFocused: false))
    }

    @Test func staysOpenWhileTheFilePickerIsUp() {
        #expect(ChatComposerState.isExpanded(draft: "", hasAttachments: false, isFocused: false, isInteracting: true))
    }

    @Test func collapsesAgainOnceEmptyAndUnfocused() {
        #expect(ChatComposerState.isExpanded(draft: "hi", hasAttachments: false, isFocused: false))
        #expect(!ChatComposerState.isExpanded(draft: "", hasAttachments: false, isFocused: false))
    }

    @Test func textAreaGrowsThenStops() {
        #expect(ChatComposerState.visibleLines(forContentLines: 0, isStarThread: false) == 2)
        #expect(ChatComposerState.visibleLines(forContentLines: 5, isStarThread: false) == 5)
        #expect(ChatComposerState.visibleLines(forContentLines: 40, isStarThread: false) == 8)
        #expect(ChatComposerState.visibleLines(forContentLines: 40, isStarThread: true) == 6)
    }

    @Test func placeholdersAreTheOrionPhrasings() {
        #expect(ChatComposerState.placeholder(isStarThread: false) == "Ask Orion for something…")
        #expect(ChatComposerState.placeholder(isStarThread: true) == "Reply to Orion…")
    }
}
