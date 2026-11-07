import SwiftUI
import AppKit
import OrionDesignSystem

@MainActor
enum CatalogSnapshot {
    static func export(to directory: String) {
        do {
            try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
            for (name, scheme, size, width) in [
                ("dark", ColorScheme.dark, DynamicTypeSize.large, OrionSize.catalogWidth),
                ("light", .light, .large, OrionSize.catalogWidth),
                ("accessible", .dark, .accessibility3, OrionSize.catalogWidth),
                ("compact", .dark, .large, CGFloat(420))
            ] {
                // Native macOS text fields cannot be captured by ImageRenderer.
                let hosting = NSHostingView(rootView: CatalogContent()
                    .padding(OrionSpacing.xl)
                    .frame(width: width)
                    .fixedSize(horizontal: false, vertical: true)
                    .background(OrionColorRole.canvas.resolve(in: scheme))
                    .environment(\.colorScheme, scheme)
                    .environment(\.dynamicTypeSize, size))
                let size = hosting.fittingSize
                hosting.frame = CGRect(origin: .zero, size: size)
                let window = NSWindow(contentRect: hosting.frame, styleMask: [.borderless], backing: .buffered, defer: false)
                window.contentView = hosting
                window.appearance = NSAppearance(named: scheme == .dark ? .darkAqua : .aqua)
                hosting.layoutSubtreeIfNeeded()
                window.display()
                guard let bitmap = hosting.bitmapImageRepForCachingDisplay(in: hosting.bounds) else {
                    throw CocoaError(.fileWriteUnknown)
                }
                hosting.cacheDisplay(in: hosting.bounds, to: bitmap)
                let data = bitmap.representation(using: .png, properties: [:])
                guard let data else { throw CocoaError(.fileWriteUnknown) }
                try data.write(to: URL(filePath: directory).appending(path: "orion-\(name).png"))
            }
        } catch {
            fputs("Catalog snapshot failed: \(error)\n", stderr)
            Foundation.exit(1)
        }
    }
}
