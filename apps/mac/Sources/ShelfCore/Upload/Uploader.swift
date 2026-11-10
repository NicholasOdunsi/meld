import Foundation

/// Sends outbox entries one at a time, oldest first. Files are deleted only
/// after Orion confirms; rejected entries are set aside; a 401 stops
/// everything and keeps the queue for after reconnecting.
public actor Uploader {
    private let outbox: Outbox
    private let tokenStore: any TokenStore
    private let schedule: BackoffSchedule
    private let client: any OrionClient
    private var consecutiveFailures = 0
    /// Coalesce overlapping drains. `upload` suspensions are re-entrant on this
    /// actor, so a second `drain()` must not re-read the same outbox entries.
    private var inFlight: Task<DrainReport, Never>?

    public init(outbox: Outbox, client: any OrionClient, tokenStore: any TokenStore, schedule: BackoffSchedule = .init()) {
        self.outbox = outbox
        self.client = client
        self.tokenStore = tokenStore
        self.schedule = schedule
    }

    public func drain() async -> DrainReport {
        if let inFlight { return await inFlight.value }
        let task = Task { await self.performDrain() }
        inFlight = task
        let report = await task.value
        inFlight = nil
        return report
    }

    private func performDrain() async -> DrainReport {
        var report = DrainReport()
        guard let token = try? tokenStore.token() else {
            report.isUnauthorized = true
            report.remaining = await pendingCount()
            return report
        }

        // Keep passing over the outbox until nothing new appears, so an image
        // captured while this drain was uploading (whose own drain() call
        // coalesced into this one) is sent now rather than on the next trigger.
        var attempted = Set<UUID>()
        passes: while true {
            let entries = ((try? await outbox.pending()) ?? []).filter { !attempted.contains($0.id) }
            if entries.isEmpty { break }
            for entry in entries {
                attempted.insert(entry.id)
                guard let data = try? await outbox.imageData(for: entry) else {
                    try? await outbox.reject(entry)
                    report.rejected.append(.unreadable)
                    continue
                }
                do {
                    let response = try await client.upload(ShelfUpload(entry: entry, data: data), token: token)
                    // If removal fails the entry is re-sent later; Orion dedupes by content hash.
                    try? await outbox.remove(entry)
                    consecutiveFailures = 0
                    report.uploaded.append(UploadedItem(entryID: entry.id, response: response))
                } catch {
                    switch error.code {
                    case .unauthorized:
                        report.isUnauthorized = true
                        break passes
                    case .unsupportedType, .tooLarge, .invalidImage, .unreadable, .notFound, .invalidRequest:
                        try? await outbox.reject(entry)
                        report.rejected.append(error)
                    case .invalidCode, .rateLimited, .conflict, .unavailable, .network:
                        consecutiveFailures += 1
                        report.retryAfter = schedule.delay(afterFailures: consecutiveFailures)
                        break passes
                    }
                }
            }
        }
        report.remaining = await pendingCount()
        return report
    }

    private func pendingCount() async -> Int {
        ((try? await outbox.pending()) ?? []).count
    }
}
