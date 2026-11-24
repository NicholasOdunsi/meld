import Foundation

struct PreviewLaunchFiles {
    let read: (String) -> Data?
    let exists: (String) -> Bool
}

struct PreviewLaunchPlan: Equatable {
    enum Kind: Equatable {
        case node(entry: String)
        case npmScript(String)
    }
    let kind: Kind
    let arguments: [String]
    let environment: [String: String]
}

enum PreviewLaunchError: Error, Equatable {
    case notAWebProject
    case dependenciesMissing
    case noDevScript
}

/// Chooses how to start a project's own dev server on a loopback port Orion reserved.
/// Known tools run their installed binary directly with Orion's Node; anything else runs the
/// project's `dev` (then `start`) script through npm with PORT set.
enum PreviewLauncher {
    private struct Known: Sendable {
        let package: String
        let bin: String
        let arguments: @Sendable (UInt16) -> [String]
        let environment: @Sendable (UInt16) -> [String: String]
    }

    private static func loopback(_ command: [String]) -> @Sendable (UInt16) -> [String] {
        { port in command + ["--host", "127.0.0.1", "--port", String(port)] }
    }

    // Order matters: frameworks built on Vite also list `vite`, so Vite is last.
    private static let known: [Known] = [
        Known(package: "next", bin: "next",
              arguments: { ["dev", "--hostname", "127.0.0.1", "--port", String($0)] }, environment: { _ in [:] }),
        Known(package: "react-scripts", bin: "react-scripts",
              arguments: { _ in ["start"] },
              environment: { ["PORT": String($0), "HOST": "127.0.0.1", "BROWSER": "none"] }),
        Known(package: "astro", bin: "astro", arguments: loopback(["dev"]), environment: { _ in [:] }),
        Known(package: "nuxt", bin: "nuxt", arguments: loopback(["dev"]), environment: { _ in [:] }),
        Known(package: "@angular/cli", bin: "ng", arguments: loopback(["serve"]), environment: { _ in [:] }),
        Known(package: "vite", bin: "vite",
              arguments: { ["--host", "127.0.0.1", "--port", String($0), "--strictPort"] }, environment: { _ in [:] }),
    ]

    static func plan(packageJSON: Data, port: UInt16, files: PreviewLaunchFiles) throws(PreviewLaunchError) -> PreviewLaunchPlan {
        guard let manifest = (try? JSONSerialization.jsonObject(with: packageJSON)) as? [String: Any] else {
            throw .notAWebProject
        }
        let dependencies = Set((manifest["dependencies"] as? [String: Any] ?? [:]).keys)
            .union((manifest["devDependencies"] as? [String: Any] ?? [:]).keys)
        for tool in known where dependencies.contains(tool.package) {
            guard let entry = binEntry(of: tool.package, named: tool.bin, files: files) else { throw .dependenciesMissing }
            return PreviewLaunchPlan(kind: .node(entry: entry), arguments: tool.arguments(port), environment: tool.environment(port))
        }
        let scripts = manifest["scripts"] as? [String: Any] ?? [:]
        guard let script = ["dev", "start"].first(where: { scripts[$0] is String }) else { throw .noDevScript }
        guard files.exists("node_modules") else { throw .dependenciesMissing }
        return PreviewLaunchPlan(kind: .npmScript(script), arguments: [],
                                 environment: ["PORT": String(port), "HOST": "127.0.0.1", "BROWSER": "none"])
    }

    /// The installed package's own `bin` entry, relative to the worktree (nil when it is not installed).
    private static func binEntry(of package: String, named bin: String, files: PreviewLaunchFiles) -> String? {
        guard let data = files.read("node_modules/\(package)/package.json"),
              let manifest = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
        let relative: String?
        if let single = manifest["bin"] as? String {
            relative = single
        } else if let table = manifest["bin"] as? [String: String] {
            relative = table[bin] ?? table.values.first
        } else {
            relative = nil
        }
        guard var path = relative, !path.contains("..") else { return nil }
        if path.hasPrefix("./") { path.removeFirst(2) }
        return "node_modules/\(package)/\(path)"
    }
}
