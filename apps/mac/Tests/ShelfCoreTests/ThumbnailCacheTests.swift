import CoreGraphics
import Foundation
import ShelfTestSupport
import Synchronization
import Testing
@testable import ShelfCore

struct ThumbnailCacheTests {
    let host = "thumbs-\(UUID().uuidString.lowercased()).test"
    let directory = URL.temporaryDirectory.appending(path: "thumbs-\(UUID().uuidString)", directoryHint: .isDirectory)

    private func item() -> LibraryItem {
        LibraryItem(id: UUID(), width: 800, height: 400, mimeType: .png, note: nil, sourceUrl: nil,
                    createdAt: .now, description: nil, labelState: .pending, rooms: [],
                    imageUrl: URL(string: "http://\(host)/a.png"))
    }

    @Test func downsamplesOnceThenServesFromDisk() async throws {
        defer { try? FileManager.default.removeItem(at: directory) }
        let downloads = Mutex(0)
        let png = TestImages.png(width: 800, height: 400)
        StubURLProtocol.register(host: host) { _ in
            downloads.withLock { $0 += 1 }
            return (200, png)
        }
        let cache = ThumbnailCache(directory: directory, session: StubURLProtocol.session())
        let item = item()
        let first = try #require(await cache.thumbnail(for: item, maxPixels: 200))
        #expect(max(first.width, first.height) <= 200)
        _ = await cache.thumbnail(for: item, maxPixels: 200)
        #expect(downloads.withLock { $0 } == 1)
    }

    @Test func failedDownloadIsNil() async {
        defer { try? FileManager.default.removeItem(at: directory) }
        StubURLProtocol.register(host: host) { _ in (500, Data()) }
        let cache = ThumbnailCache(directory: directory, session: StubURLProtocol.session())
        #expect(await cache.thumbnail(for: item(), maxPixels: 200) == nil)
    }

    @Test func fullImageFileKeepsTheExtension() async throws {
        defer { try? FileManager.default.removeItem(at: directory) }
        StubURLProtocol.register(host: host) { _ in (200, TestImages.png(width: 10, height: 10)) }
        let cache = ThumbnailCache(directory: directory, session: StubURLProtocol.session())
        let file = try await cache.fullImageFile(for: item())
        #expect(file.pathExtension == "png")
        #expect(FileManager.default.fileExists(atPath: file.path()))
    }
}
