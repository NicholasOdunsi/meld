import AppKit
import Darwin
import Foundation
import Observation

@MainActor
@Observable
final class BuildPreview {
    private struct Server {
        let process: Process
        let url: URL
    }

    private var servers: [String: Server] = [:]
    private(set) var startingStarID: String?
    private(set) var failure: (starID: String, message: String)?
    var starting: Bool { startingStarID != nil }

    func runningURL(for starID: String) -> URL? {
        guard let server = servers[starID], server.process.isRunning, startingStarID != starID else { return nil }
        return server.url
    }

    private var meldRoot: URL {
        if isStaging,
           let root = Bundle.main.object(forInfoDictionaryKey: "OrionStagingConnectorRoot") as? String {
            return URL(fileURLWithPath: root, isDirectory: true)
        }
        return URL.applicationSupportDirectory.appending(path: "Meld", directoryHint: .isDirectory)
    }

    private var isStaging: Bool {
        Bundle.main.object(forInfoDictionaryKey: "OrionPreview") as? Bool == true
    }

    private func worktree(for starID: String) -> URL? {
        guard let id = UUID(uuidString: starID) else { return nil }
        let record = meldRoot.appending(path: "engine/previews/\(id.uuidString.lowercased()).json")
        struct PreviewRecord: Decodable { let worktree: String }
        guard let data = try? Data(contentsOf: record),
              let preview = try? JSONDecoder().decode(PreviewRecord.self, from: data) else { return nil }
        let root = meldRoot.appending(path: "engine/home/worktrees").resolvingSymlinksInPath()
        let directory = URL(fileURLWithPath: preview.worktree, isDirectory: true).resolvingSymlinksInPath()
        guard directory.path.hasPrefix(root.path + "/") else { return nil }
        return directory
    }

    func canPreview(_ starID: String) -> Bool {
        guard let folder = worktree(for: starID) else { return false }
        return FileManager.default.isReadableFile(atPath: folder.appending(path: "node_modules/next/dist/bin/next").path)
    }

    func start(_ id: String) async -> URL? {
        guard !starting else { return nil }
        if let url = runningURL(for: id) { return url }
        failure = nil
        guard let folder = worktree(for: id), canPreview(id) else {
            failure = (id, "Install Next.js dependencies in the build worktree first.")
            return nil
        }
        guard let port = availableLoopbackPort(),
              let url = URL(string: "http://127.0.0.1:\(port)/") else {
            failure = (id, "Could not reserve a local preview port.")
            return nil
        }

        startingStarID = id
        defer { startingStarID = nil }
        let child = Process()
        child.executableURL = meldRoot.appending(path: "runtime/current/bin/node")
        child.arguments = ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)]
        child.currentDirectoryURL = folder
        child.standardInput = FileHandle.nullDevice
        child.standardOutput = FileHandle.nullDevice
        child.standardError = FileHandle.nullDevice
        child.terminationHandler = { [weak self] ended in
            Task { @MainActor in
                if self?.servers[id]?.process === ended { self?.servers.removeValue(forKey: id) }
            }
        }
        do {
            try child.run()
            servers[id] = Server(process: child, url: url)
            let deadline = ContinuousClock.now + .seconds(30)
            while child.isRunning, ContinuousClock.now < deadline {
                if await responds(at: url), child.isRunning { return url }
                try await Task.sleep(for: .milliseconds(500))
            }
        } catch {
            // A startup failure is reported against this Star.
        }
        if child.isRunning { child.terminate() }
        servers.removeValue(forKey: id)
        failure = (id, "The preview server could not start.")
        return nil
    }

    func stop() {
        for server in servers.values where server.process.isRunning { server.process.terminate() }
        servers.removeAll()
    }

    private func responds(at url: URL) async -> Bool {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 1)
        request.httpMethod = "HEAD"
        guard let (_, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse else { return false }
        return (200..<400).contains(http.statusCode)
    }

    private func availableLoopbackPort() -> UInt16? {
        let descriptor = socket(AF_INET, SOCK_STREAM, 0)
        guard descriptor >= 0 else { return nil }
        defer { close(descriptor) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        var length = socklen_t(address.sin_len)
        let bound = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(descriptor, $0, length) }
        }
        guard bound == 0 else { return nil }
        let named = withUnsafeMutablePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(descriptor, $0, &length) }
        }
        return named == 0 ? UInt16(bigEndian: address.sin_port) : nil
    }
}
