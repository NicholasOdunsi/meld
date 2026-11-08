import AppKit
import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

@MainActor
struct PasteboardReaderTests {
    let reader = PasteboardReader()

    private func makePasteboard() -> NSPasteboard {
        let pasteboard = NSPasteboard(name: NSPasteboard.Name("orion-test-\(UUID().uuidString)"))
        pasteboard.clearContents()
        return pasteboard
    }

    @Test func readsImageBytesAndTheBrowserURL() {
        let pasteboard = makePasteboard()
        let png = TestImages.encoded(width: 8, height: 8, as: .png)
        let item = NSPasteboardItem()
        item.setData(png, forType: .png)
        item.setString("https://www.pinterest.com/pin/123/", forType: .URL)
        pasteboard.writeObjects([item])

        let images = reader.images(from: pasteboard)

        #expect(images == [CapturedImage(data: png, sourceURL: URL(string: "https://www.pinterest.com/pin/123/"))])
    }

    @Test func ignoresNonWebURLs() {
        let pasteboard = makePasteboard()
        let item = NSPasteboardItem()
        item.setData(TestImages.encoded(width: 8, height: 8, as: .png), forType: .png)
        item.setString("javascript:alert(1)", forType: .URL)
        pasteboard.writeObjects([item])

        #expect(reader.images(from: pasteboard).first?.sourceURL == nil)
    }

    @Test func readsAnImageFileDraggedFromFinder() throws {
        let png = TestImages.encoded(width: 8, height: 8, as: .png)
        let file = URL.temporaryDirectory.appending(path: "\(UUID().uuidString).png")
        try png.write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }
        let pasteboard = makePasteboard()
        pasteboard.writeObjects([file as NSURL])

        #expect(reader.images(from: pasteboard) == [CapturedImage(data: png, sourceURL: nil)])
    }

    @Test func returnsNothingForPlainText() {
        let pasteboard = makePasteboard()
        pasteboard.setString("hello", forType: .string)

        #expect(reader.images(from: pasteboard).isEmpty)
    }
}
