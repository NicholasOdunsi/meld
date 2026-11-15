import AppKit
import OrionAppCore
import Testing
@testable import Orion

@MainActor
struct ScreenCardStoreTests {
    private func tempDirectory() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("screen-cards-\(UUID().uuidString)")
    }
    private func screen(version: String?) -> StreamScreen {
        StreamScreen(id: "s1", name: "Balance", state: .built, versionID: version, formFactor: "mobile",
                     createdAt: Date(), updating: false)
    }
    private func solidImage() -> NSImage {
        let image = NSImage(size: NSSize(width: 4, height: 4))
        image.lockFocus(); NSColor.red.setFill(); NSRect(x: 0, y: 0, width: 4, height: 4).fill(); image.unlockFocus()
        return image
    }

    @Test func rendersOncePerVersionAndKeepsThePictureOnDisk() async {
        var renders = 0
        let directory = tempDirectory()
        let store = ScreenCardStore(directory: directory) { _, _ in renders += 1; return self.solidImage() }
        let document = ScreenDocument(roomID: "r1", screenID: "s1", versionID: "v1", formFactor: "mobile", html: "<html></html>")
        await store.receive(document)
        await store.receive(document)
        #expect(renders == 1)
        #expect(store.image(for: screen(version: "v1")) != nil)
        let relaunched = ScreenCardStore(directory: directory) { _, _ in renders += 1; return nil }
        #expect(relaunched.image(for: screen(version: "v1")) != nil)
        #expect(renders == 1)
    }

    @Test func aNewVersionRendersAgain() async {
        var renders = 0
        let store = ScreenCardStore(directory: tempDirectory()) { _, _ in renders += 1; return self.solidImage() }
        await store.receive(ScreenDocument(roomID: "r1", screenID: "s1", versionID: "v1", formFactor: "mobile", html: "a"))
        await store.receive(ScreenDocument(roomID: "r1", screenID: "s1", versionID: "v2", formFactor: "mobile", html: "b"))
        #expect(renders == 2)
        #expect(store.image(for: screen(version: "v2")) != nil)
        #expect(store.image(for: screen(version: nil)) == nil)
    }
}
