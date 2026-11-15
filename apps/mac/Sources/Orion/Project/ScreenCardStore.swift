import AppKit
import Observation
import OrionAppCore

@MainActor
@Observable
final class ScreenCardStore {
    typealias Renderer = @MainActor (_ html: String, _ size: CGSize) async -> NSImage?

    static let shared = ScreenCardStore(
        directory: FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(Bundle.main.bundleIdentifier ?? "Orion")
            .appendingPathComponent("ScreenCards"),
        renderer: { html, size in await ScreenSnapshotter.render(html: html, size: size) }
    )

    private(set) var images: [String: NSImage] = [:]
    @ObservationIgnored private var diskImages: [String: NSImage] = [:]
    private var inFlight: Set<String> = []
    private let directory: URL
    private let renderer: Renderer

    init(directory: URL, renderer: @escaping Renderer) {
        self.directory = directory
        self.renderer = renderer
    }

    func image(for screen: StreamScreen) -> NSImage? {
        guard let key = screen.cacheKey else { return nil }
        if let image = images[key] ?? diskImages[key] { return image }
        if let image = NSImage(contentsOf: file(for: key)) {
            diskImages[key] = image
            return image
        }
        return nil
    }

    func receive(_ document: ScreenDocument) async {
        let key = document.cacheKey
        guard images[key] == nil, !inFlight.contains(key) else { return }
        if let image = diskImages[key] ?? NSImage(contentsOf: file(for: key)) { images[key] = image; return }
        inFlight.insert(key)
        defer { inFlight.remove(key) }
        let size = StreamScreen.pixelSize(formFactor: document.formFactor)
        // One retry: a slow first load must not leave the card on "Loading…" for the session.
        var rendered = await renderer(document.html, size)
        if rendered == nil {
            try? await Task.sleep(for: .seconds(1))
            rendered = await renderer(document.html, size)
        }
        guard let image = rendered else { return }
        images[key] = image
        save(image, to: file(for: key))
    }

    private func file(for key: String) -> URL {
        directory.appendingPathComponent(key.replacingOccurrences(of: "/", with: "_") + ".png")
    }

    private func save(_ image: NSImage, to url: URL) {
        guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
              let png = rep.representation(using: .png, properties: [:]) else { return }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? png.write(to: url)
    }
}
