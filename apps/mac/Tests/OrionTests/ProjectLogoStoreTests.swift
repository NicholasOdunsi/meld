import AppKit
import Foundation
import Testing
@testable import Orion

@MainActor
struct ProjectLogoStoreTests {
    @Test func saveThenImageRoundTripsAndRemoveClears() throws {
        let folder = URL.temporaryDirectory.appending(
            path: "project-logos-\(UUID().uuidString)",
            directoryHint: .isDirectory
        )
        ProjectLogoStore.directoryOverride = folder
        defer {
            ProjectLogoStore.directoryOverride = nil
            try? FileManager.default.removeItem(at: folder)
        }

        let projectID = UUID().uuidString
        let source = folder.appendingPathComponent("source.png")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try solidPNG().write(to: source)

        #expect(ProjectLogoStore.image(for: projectID) == nil)
        try ProjectLogoStore.save(source, for: projectID)
        #expect(ProjectLogoStore.image(for: projectID) != nil)

        ProjectLogoStore.remove(for: projectID)
        #expect(ProjectLogoStore.image(for: projectID) == nil)

        // A logo picked in the New Project sheet is saved once the project exists.
        try ProjectLogoStore.save(ProjectLogoStore.loadImage(from: source), for: projectID)
        #expect(ProjectLogoStore.image(for: projectID) != nil)
    }

    @Test func saveRejectsNonUUIDProjectIDs() {
        let folder = URL.temporaryDirectory.appending(
            path: "project-logos-\(UUID().uuidString)",
            directoryHint: .isDirectory
        )
        ProjectLogoStore.directoryOverride = folder
        defer {
            ProjectLogoStore.directoryOverride = nil
            try? FileManager.default.removeItem(at: folder)
        }

        #expect(throws: (any Error).self) {
            try ProjectLogoStore.save(folder, for: "not-a-uuid")
        }
    }

    private func solidPNG() throws -> Data {
        let image = NSImage(size: NSSize(width: 8, height: 8))
        image.lockFocus()
        NSColor.red.setFill()
        NSRect(x: 0, y: 0, width: 8, height: 8).fill()
        image.unlockFocus()
        guard let tiff = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiff),
              let png = bitmap.representation(using: .png, properties: [:]) else {
            throw CocoaError(.fileWriteUnknown)
        }
        return png
    }
}
