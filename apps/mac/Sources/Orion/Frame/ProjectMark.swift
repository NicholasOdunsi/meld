import AppKit
import OrionAppCore
import SwiftUI

/// A project's company logo, or a stable gradient monogram until one is chosen.
struct ProjectMark: View {
    let project: FrameProject
    let revision: Int

    var body: some View {
        Group {
            if let image = ProjectLogoStore.image(for: project.id) {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Text(String(project.name.prefix(1)).uppercased())
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(gradient)
            }
        }
        .frame(width: 22, height: 22)
        .clipShape(.rect(cornerRadius: 5))
        .accessibilityHidden(true)
        .id(revision)
    }

    private var gradient: LinearGradient {
        // A stable hash gives projects distinct marks even when they share a colour.
        let hash = project.id.utf8.reduce(UInt64(14695981039346656037)) {
            ($0 ^ UInt64($1)) &* 1099511628211
        }
        let hue = Double(hash % 360) / 360
        return LinearGradient(
            colors: [Color(hue: hue, saturation: 0.8, brightness: 0.95),
                     Color(hue: (hue + 0.11).truncatingRemainder(dividingBy: 1), saturation: 0.72, brightness: 0.64)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

/// Logos belong to this Mac's app data and are keyed by the project UUID.
@MainActor
enum ProjectLogoStore {
    /// Tests point this at a temp folder so they don't touch real app support.
    nonisolated(unsafe) static var directoryOverride: URL?

    private static var directory: URL {
        directoryOverride
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Orion/ProjectLogos", isDirectory: true)
    }

    private static func destination(for id: String) -> URL? {
        guard let uuid = UUID(uuidString: id) else { return nil }
        return directory.appendingPathComponent(uuid.uuidString).appendingPathExtension("png")
    }

    static func image(for id: String) -> NSImage? {
        guard let url = destination(for: id) else { return nil }
        return NSImage(contentsOf: url)
    }

    static func save(_ source: URL, for id: String) throws {
        guard let destination = destination(for: id) else { throw CocoaError(.fileReadInvalidFileName) }
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        guard let image = NSImage(contentsOf: source),
              let tiff = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiff),
              let png = bitmap.representation(using: .png, properties: [:]) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try png.write(to: destination, options: .atomic)
    }

    static func remove(for id: String) {
        guard let url = destination(for: id) else { return }
        try? FileManager.default.removeItem(at: url)
    }
}
