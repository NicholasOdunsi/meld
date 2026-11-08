import AppKit
import Observation
import ShelfCore

/// The shelf's single source of truth. Views and the status item only read it
/// and call its methods; all decisions live here or in ShelfCore.
@MainActor
@Observable
final class AppModel {
    private enum DefaultsKey {
        static let baseURL = "baseURL"
        static let workspaceID = "workspaceID"
        static let workspaceName = "workspaceName"
    }

    private(set) var connection: ConnectionState
    private(set) var icon: StatusIcon
    private(set) var waitingCount = 0
    private(set) var recent: [RecentCapture] = []
    private(set) var lastMessage: String?
    /// Goes up each time the panel opens, so the panel refetches its rooms.
    private(set) var panelOpenCount = 0
    private(set) var baseURL: URL
    var launchAtLogin: Bool {
        didSet { applyLaunchAtLogin(previous: oldValue) }
    }

    /// Lets the status item show a message when the panel is closed.
    @ObservationIgnored var transientMessageHandler: ((String) -> Void)?
    /// Opens Orion pages inside the app window instead of the browser.
    @ObservationIgnored var openInWindow: ((URL) -> Void)?

    @ObservationIgnored private let dependencies: AppDependencies
    @ObservationIgnored private var uploader: Uploader
    @ObservationIgnored private var drainTask: Task<Void, Never>?
    @ObservationIgnored private var iconResetTask: Task<Void, Never>?

    init(dependencies: AppDependencies) {
        self.dependencies = dependencies
        let defaults = dependencies.defaults
        let baseURL = defaults.string(forKey: DefaultsKey.baseURL).flatMap(URL.init(string:)) ?? dependencies.defaultBaseURL
        let connection: ConnectionState = if
            let workspaceID = defaults.string(forKey: DefaultsKey.workspaceID).flatMap(UUID.init(uuidString:)),
            let workspaceName = defaults.string(forKey: DefaultsKey.workspaceName) {
            .connected(workspaceID: workspaceID, workspaceName: workspaceName)
        } else {
            .disconnected
        }
        self.baseURL = baseURL
        self.connection = connection
        self.icon = connection == .disconnected ? .disconnected : .idle
        self.launchAtLogin = dependencies.launchAtLogin.isEnabled
        self.uploader = Uploader(
            outbox: dependencies.outbox,
            client: dependencies.makeClient(baseURL),
            tokenStore: dependencies.makeTokenStore(baseURL)
        )
    }

    func start() async {
        await drain()
    }

    func capture(_ images: [CapturedImage], note: String?, roomID: UUID?) async {
        var queued = 0
        var failure: String?
        for image in images {
            do {
                let normalized = try await Self.normalize(image, using: dependencies.normalizer)
                let entry = try await dependencies.outbox.enqueue(normalized, note: note, sourceURL: image.sourceURL, roomID: roomID)
                recent.insert(RecentCapture(id: entry.id, thumbnail: NSImage(data: normalized.data), itemID: nil), at: 0)
                queued += 1
            } catch let error as NormalizationError {
                failure = Self.message(for: error)
            } catch {
                failure = String(localized: "Couldn't keep that image on this Mac.")
            }
        }
        recent = Array(recent.prefix(Limits.recentCount))
        if let failure { report(failure) }
        flash(queued > 0 ? .success : .rejected)
        if queued == 0, failure == nil { report(String(localized: "Only images for now.")) }
        scheduleDrain()
    }

    func captureClipboard(note: String? = nil, roomID: UUID? = nil) async {
        let images = dependencies.pasteboardReader.images(from: dependencies.pasteboard)
        guard !images.isEmpty else {
            report(String(localized: "No image on the clipboard."))
            flash(.rejected)
            return
        }
        await capture(images, note: note, roomID: roomID)
    }

    func retryNow() async {
        drainTask?.cancel()
        await drain()
    }

    func connect(baseURLString: String, code: String) async throws(ShelfAPIError) {
        let trimmed = baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), url.scheme == "http" || url.scheme == "https" else {
            throw ShelfAPIError(code: .unavailable, message: String(localized: "That Orion address doesn't look right."))
        }
        let client = dependencies.makeClient(url)
        let response = try await client.connect(code: code, deviceName: dependencies.deviceName)
        do {
            try dependencies.makeTokenStore(url).save(response.token)
        } catch {
            throw ShelfAPIError(code: .unavailable, message: String(localized: "Couldn't store the key in your Keychain."))
        }

        drainTask?.cancel()
        baseURL = url
        uploader = Uploader(outbox: dependencies.outbox, client: client, tokenStore: dependencies.makeTokenStore(url))
        dependencies.defaults.set(url.absoluteString, forKey: DefaultsKey.baseURL)
        dependencies.defaults.set(response.workspaceId.uuidString, forKey: DefaultsKey.workspaceID)
        dependencies.defaults.set(response.workspaceName, forKey: DefaultsKey.workspaceName)
        connection = .connected(workspaceID: response.workspaceId, workspaceName: response.workspaceName)
        icon = idleIcon
        if !launchAtLogin { launchAtLogin = true }
        scheduleDrain()
    }

    func disconnect() {
        do {
            try dependencies.makeTokenStore(baseURL).delete()
        } catch {
            report(String(localized: "Couldn't remove the key from your Keychain."))
        }
        markDisconnected()
    }

    func panelWillOpen() {
        panelOpenCount += 1
    }

    func loadRooms() async -> [ShelfRoom] {
        guard connection != .disconnected, let token = try? dependencies.makeTokenStore(baseURL).token() else { return [] }
        do {
            return try await dependencies.makeClient(baseURL).rooms(token: token)
        } catch {
            if error.code == .unauthorized { markDisconnected() }
            report(error.message)
            return []
        }
    }

    func openLibrary(itemID: UUID? = nil) {
        guard case .connected(let workspaceID, _) = connection else { return }
        var url = baseURL.appending(path: "\(workspaceID.uuidString.lowercased())/inspiration")
        if let itemID {
            url.append(queryItems: [URLQueryItem(name: "item", value: itemID.uuidString.lowercased())])
        }
        if let openInWindow { openInWindow(url) } else { dependencies.openURL(url) }
    }

    func openOutboxFolder() {
        dependencies.openURL(dependencies.outboxDirectory)
    }

    func dismissMessage() {
        lastMessage = nil
    }

    func quit() {
        NSApplication.shared.terminate(nil)
    }

    // MARK: - Private

    private var idleIcon: StatusIcon {
        if connection == .disconnected {
            .disconnected
        } else if waitingCount > 0 {
            .waiting(waitingCount)
        } else {
            .idle
        }
    }

    private func scheduleDrain(after delay: Duration = .zero) {
        drainTask?.cancel()
        drainTask = Task { [weak self] in
            if delay > .zero {
                do {
                    try await Task.sleep(for: delay)
                } catch {
                    return
                }
            }
            await self?.drain()
        }
    }

    private func drain() async {
        let report = await uploader.drain()
        waitingCount = report.remaining
        for uploaded in report.uploaded {
            if let index = recent.firstIndex(where: { $0.id == uploaded.entryID }) {
                recent[index].itemID = uploaded.response.itemId
            }
        }
        if let rejected = report.rejected.last { self.report(rejected.message) }
        if report.isUnauthorized { markDisconnected() }
        if iconResetTask == nil { icon = idleIcon }
        if let retryAfter = report.retryAfter { scheduleDrain(after: retryAfter) }
    }

    private func markDisconnected() {
        dependencies.defaults.removeObject(forKey: DefaultsKey.workspaceID)
        dependencies.defaults.removeObject(forKey: DefaultsKey.workspaceName)
        connection = .disconnected
        icon = .disconnected
    }

    private func report(_ message: String) {
        lastMessage = message
        transientMessageHandler?(message)
    }

    private func flash(_ state: StatusIcon) {
        icon = state
        iconResetTask?.cancel()
        iconResetTask = Task { [weak self] in
            do {
                try await Task.sleep(for: ShelfDesign.flashDuration)
            } catch {
                return
            }
            guard let self else { return }
            self.iconResetTask = nil
            self.icon = self.idleIcon
        }
    }

    private func applyLaunchAtLogin(previous: Bool) {
        guard launchAtLogin != previous else { return }
        do {
            try dependencies.launchAtLogin.setEnabled(launchAtLogin)
        } catch {
            launchAtLogin = previous
            report(String(localized: "Couldn't turn on launch at login. Add Orion in System Settings → General → Login Items."))
        }
    }

    /// Decoding and re-encoding large images is slow, so it runs off the main actor.
    @concurrent
    private nonisolated static func normalize(_ image: CapturedImage, using normalizer: ImageNormalizer) async throws(NormalizationError) -> NormalizedImage {
        try normalizer.normalize(image)
    }

    private static func message(for error: NormalizationError) -> String {
        switch error {
        case .notAnImage: String(localized: "Only images for now.")
        case .tooLarge: String(localized: "Too large to save.")
        }
    }
}

extension AppModel: ShelfAutoConnecting {
    var needsConnection: Bool { connection == .disconnected }

    /// Called with a code the signed-in Orion page minted, so Shelf never needs manual pairing.
    func connectAutomatically(code: String) async {
        do {
            try await connect(baseURLString: dependencies.defaultBaseURL.absoluteString, code: code)
        } catch {
            report(String(localized: "Shelf couldn't connect. It will try again next time Orion opens."))
        }
    }
}
