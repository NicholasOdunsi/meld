import AppKit
import Foundation
import Testing
@testable import Orion

@MainActor
struct ScreenSnapshotterTests {
    // Needs a real GPU/window server: the headless macOS CI runner crashes tearing down the web view.
    @Test(.enabled(if: ProcessInfo.processInfo.environment["CI"] == nil))
    func rendersColourNotBlankOrGreyscale() async throws {
        let html = """
        <html><body style="margin:0;background:#2563eb"><div style="height:200px;background:#f97316"></div></body></html>
        """
        let image = try #require(await ScreenSnapshotter.render(html: html, size: CGSize(width: 390, height: 844)))
        let tiff = try #require(image.tiffRepresentation)
        let rep = try #require(NSBitmapImageRep(data: tiff))
        func pixel(_ fx: Double, _ fy: Double) -> (Int, Int, Int) {
            let c = rep.colorAt(x: Int(Double(rep.pixelsWide) * fx), y: Int(Double(rep.pixelsHigh) * fy))!.usingColorSpace(.sRGB)!
            return (Int(c.redComponent * 255), Int(c.greenComponent * 255), Int(c.blueComponent * 255))
        }
        let top = pixel(0.5, 0.05), bottom = pixel(0.5, 0.8)
        print("PIXELS top=\(top) bottom=\(bottom)")
        #expect(top.0 > 200 && top.2 < 100)      // orange
        #expect(bottom.2 > 200 && bottom.0 < 100) // blue
    }
}
