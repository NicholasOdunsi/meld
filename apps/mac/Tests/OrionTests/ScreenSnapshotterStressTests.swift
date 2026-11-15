import AppKit
import Foundation
import Testing
@testable import Orion

@MainActor
struct ScreenSnapshotterStressTests {
    @Test func repeatedRendersDoNotOverRelease() async throws {
        for i in 0..<8 {
            let html = "<html><body style='background:#2563eb'>\(i)</body></html>"
            _ = await ScreenSnapshotter.render(html: html, size: CGSize(width: 390, height: 844))
            // Let the main run loop drain autorelease pools between renders.
            try await Task.sleep(for: .milliseconds(100))
        }
    }
}
