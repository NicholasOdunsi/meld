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

    var meldRoot: URL {
        if isStaging,
           let root = Bundle.main.object(forInfoDictionaryKey: "OrionStagingConnectorRoot") as? String {
            return URL(fileURLWithPath: root, isDirectory: true)
        }
        return URL.applicationSupportDirectory.appending(path: "Meld", directoryHint: .isDirectory)
    }

    var nodeURL: URL { meldRoot.appending(path: "runtime/current/bin/node") }

    private var isStaging: Bool {
        Bundle.main.object(forInfoDictionaryKey: "OrionPreview") as? Bool == true
    }

    func worktree(for starID: String) -> URL? {
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

    private func launchPlan(for starID: String, port: UInt16) -> Result<PreviewLaunchPlan, PreviewLaunchError> {
        guard let folder = worktree(for: starID),
              let manifest = try? Data(contentsOf: folder.appending(path: "package.json")) else { return .failure(.notAWebProject) }
        let files = PreviewLaunchFiles(
            read: { try? Data(contentsOf: folder.appending(path: $0)) },
            exists: { FileManager.default.fileExists(atPath: folder.appending(path: $0).path) })
        do { return .success(try PreviewLauncher.plan(packageJSON: manifest, port: port, files: files)) }
        catch { return .failure(error) }
    }

    func availability(for starID: String) -> (canPreview: Bool, reason: String?) {
        switch launchPlan(for: starID, port: 3000) {
        case .success: (true, nil)
        case .failure(.dependenciesMissing): (false, message(for: .dependenciesMissing))
        case .failure: (false, nil)
        }
    }

    private func message(for error: PreviewLaunchError) -> String {
        switch error {
        case .dependenciesMissing: String(localized: "Install this project's dependencies in the build worktree first.")
        case .noDevScript: String(localized: "This project has no dev or start script to preview.")
        case .notAWebProject: String(localized: "This project can't be previewed.")
        }
    }

    func start(_ id: String) async -> URL? {
        guard !starting else { return nil }
        if let url = runningURL(for: id) { return url }
        failure = nil
        guard let folder = worktree(for: id) else {
            failure = (id, message(for: .notAWebProject))
            return nil
        }
        guard let port = availableLoopbackPort(),
              let url = URL(string: "http://127.0.0.1:\(port)/") else {
            failure = (id, "Could not reserve a local preview port.")
            return nil
        }

        let plan: PreviewLaunchPlan
        switch launchPlan(for: id, port: port) {
        case .success(let value): plan = value
        case .failure(let error): failure = (id, message(for: error)); return nil
        }

        startingStarID = id
        defer { startingStarID = nil }
        let runtime = nodeURL.deletingLastPathComponent()
        let child = Process()
        switch plan.kind {
        case .node(let entry):
            child.executableURL = nodeURL
            child.arguments = [entry] + plan.arguments
        case .npmScript(let name):
            child.executableURL = runtime.appending(path: "npm")
            child.arguments = ["run", name]
        }
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = runtime.path + ":" + (environment["PATH"] ?? "/usr/bin:/bin")
        for (key, value) in plan.environment { environment[key] = value }
        child.environment = environment
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
            // The first request can wait for a cold development build.
            let deadline = ContinuousClock.now + .seconds(60)
            while child.isRunning, ContinuousClock.now < deadline {
                if await responds(at: url), child.isRunning { return url }
                try await Task.sleep(for: .milliseconds(500))
            }
        } catch {
            // A startup failure is reported against this Star.
        }
        terminateTree(child)
        servers.removeValue(forKey: id)
        failure = (id, "The preview server could not start.")
        return nil
    }

    func stop() {
        for server in servers.values { terminateTree(server.process) }
        servers.removeAll()
    }

    /// An `npm run` child starts its own children (npm, then sh, then the dev server), so ending only the
    /// parent would leave the dev server running. Ends every descendant, deepest first, then the parent.
    private func terminateTree(_ process: Process) {
        guard process.isRunning else { return }
        for pid in Self.descendants(of: process.processIdentifier).reversed() { kill(pid, SIGTERM) }
        process.terminate()
    }

    private static func descendants(of root: pid_t) -> [pid_t] {
        let ps = Process()
        ps.executableURL = URL(fileURLWithPath: "/bin/ps")
        ps.arguments = ["-axo", "pid=,ppid="]
        let pipe = Pipe()
        ps.standardOutput = pipe
        ps.standardError = FileHandle.nullDevice
        guard (try? ps.run()) != nil else { return [] }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        ps.waitUntilExit()
        var children: [pid_t: [pid_t]] = [:]
        for line in String(decoding: data, as: UTF8.self).split(separator: "\n") {
            let fields = line.split(separator: " ").compactMap { pid_t($0) }
            if fields.count == 2 { children[fields[1], default: []].append(fields[0]) }
        }
        var found: [pid_t] = []
        var queue = children[root] ?? []
        while !queue.isEmpty {
            let pid = queue.removeFirst()
            found.append(pid)
            queue += children[pid] ?? []
        }
        return found
    }

    private func responds(at url: URL) async -> Bool {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 3)
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
