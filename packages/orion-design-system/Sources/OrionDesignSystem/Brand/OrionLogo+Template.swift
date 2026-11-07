#if os(macOS)
import AppKit
import SwiftUI

extension OrionLogo {
    /// For NSStatusItem: macOS supplies the appropriate menu-bar color.
    @MainActor
    public static func menuBarImage(height: CGFloat = 18) -> NSImage? {
        guard height.isFinite, height > 0 else { return nil }
        let renderer = ImageRenderer(content: OrionLogo(form: .mark, foreground: .black)
            .frame(width: height * OrionLogoForm.mark.aspectRatio, height: height))
        renderer.scale = 2
        guard let image = renderer.nsImage else { return nil }
        image.isTemplate = true
        return image
    }
}
#endif
