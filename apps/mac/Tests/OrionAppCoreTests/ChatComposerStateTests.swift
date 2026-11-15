import Testing
@testable import OrionAppCore

struct ChatComposerStateTests {
    @Test func restsWhenEmptyAndNotUserOpened() {
        #expect(!ChatComposerState.isExpanded(draft: "", hasAttachments: false, isUserOpened: false))
    }

    @Test func focusByDefaultDoesNotOpenIt() {
        #expect(!ChatComposerState.isExpanded(draft: "", hasAttachments: false, isUserOpened: false, isFocused: true))
    }

    @Test func whitespaceAloneDoesNotKeepItOpen() {
        #expect(!ChatComposerState.isExpanded(draft: "  \n ", hasAttachments: false, isUserOpened: false, isFocused: true))
    }

    @Test func opensWhenTheUserOpensIt() {
        #expect(ChatComposerState.isExpanded(draft: "", hasAttachments: false, isUserOpened: true))
        #expect(ChatComposerState.isExpanded(draft: "", hasAttachments: false, isUserOpened: true, isFocused: true))
    }

    @Test func opensWhenThereIsADraft() {
        #expect(ChatComposerState.isExpanded(draft: "hello", hasAttachments: false, isUserOpened: false))
    }

    @Test func opensWithAStagedFile() {
        #expect(ChatComposerState.isExpanded(draft: "", hasAttachments: true, isUserOpened: false))
    }

    @Test func staysOpenWhileTheFilePickerIsUp() {
        #expect(ChatComposerState.isExpanded(draft: "", hasAttachments: false, isUserOpened: false, isInteracting: true))
    }

    @Test func collapsesAgainOnceEmptyAndNotUserOpened() {
        #expect(ChatComposerState.isExpanded(draft: "hi", hasAttachments: false, isUserOpened: false))
        #expect(!ChatComposerState.isExpanded(draft: "", hasAttachments: false, isUserOpened: false))
    }

    @Test func placeholderShowsWhileTheDraftIsEmpty() {
        #expect(ChatComposerState.showsPlaceholder(draft: ""))
        #expect(!ChatComposerState.showsPlaceholder(draft: "h"))
        #expect(!ChatComposerState.showsPlaceholder(draft: " "))
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
