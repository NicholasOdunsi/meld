import Foundation
import Testing
@testable import Orion

struct PreviewLaunchPlanTests {
    private func files(_ present: [String: String]) -> PreviewLaunchFiles {
        PreviewLaunchFiles(
            read: { present[$0].map { Data($0.utf8) } },
            exists: { path in present.keys.contains { $0 == path || $0.hasPrefix(path + "/") } })
    }
    private func manifest(_ json: String) -> Data { Data(json.utf8) }

    @Test func nextRunsItsOwnBinaryOnLoopback() throws {
        let plan = try PreviewLauncher.plan(
            packageJSON: manifest(#"{"dependencies":{"next":"15.5.0"}}"#), port: 4100,
            files: files(["node_modules/next/package.json": #"{"bin":{"next":"./dist/bin/next"}}"#]))
        #expect(plan.kind == .node(entry: "node_modules/next/dist/bin/next"))
        #expect(plan.arguments == ["dev", "--hostname", "127.0.0.1", "--port", "4100"])
    }

    @Test func viteRunsItsBinaryWithAStrictPort() throws {
        let plan = try PreviewLauncher.plan(
            packageJSON: manifest(#"{"devDependencies":{"vite":"8.3.6","react":"19"}}"#), port: 5200,
            files: files(["node_modules/vite/package.json": #"{"bin":{"vite":"bin/vite.js"}}"#]))
        #expect(plan.kind == .node(entry: "node_modules/vite/bin/vite.js"))
        #expect(plan.arguments == ["--host", "127.0.0.1", "--port", "5200", "--strictPort"])
    }

    @Test func aStringBinFieldWorks() throws {
        let plan = try PreviewLauncher.plan(
            packageJSON: manifest(#"{"devDependencies":{"vite":"8"}}"#), port: 1,
            files: files(["node_modules/vite/package.json": #"{"bin":"./cli.js"}"#]))
        #expect(plan.kind == .node(entry: "node_modules/vite/cli.js"))
    }

    @Test func createReactAppIsConfiguredThroughEnvironment() throws {
        let plan = try PreviewLauncher.plan(
            packageJSON: manifest(#"{"dependencies":{"react-scripts":"5.0.1"}}"#), port: 3300,
            files: files(["node_modules/react-scripts/package.json": #"{"bin":{"react-scripts":"./bin/react-scripts.js"}}"#]))
        #expect(plan.arguments == ["start"])
        #expect(plan.environment == ["PORT": "3300", "HOST": "127.0.0.1", "BROWSER": "none"])
    }

    @Test func nextWinsOverViteWhenBothArePresent() throws {
        let plan = try PreviewLauncher.plan(
            packageJSON: manifest(#"{"dependencies":{"next":"15","vite":"8"}}"#), port: 1,
            files: files(["node_modules/next/package.json": #"{"bin":{"next":"dist/bin/next"}}"#,
                          "node_modules/vite/package.json": #"{"bin":{"vite":"bin/vite.js"}}"#]))
        #expect(plan.kind == .node(entry: "node_modules/next/dist/bin/next"))
    }

    @Test func anUnknownProjectRunsItsDevScriptThenItsStartScript() throws {
        let installed = files(["node_modules/.package-lock.json": "{}"])
        let dev = try PreviewLauncher.plan(
            packageJSON: manifest(#"{"scripts":{"start":"node a","dev":"node b"}}"#), port: 3400, files: installed)
        #expect(dev.kind == .npmScript("dev"))
        #expect(dev.environment["PORT"] == "3400")
        let start = try PreviewLauncher.plan(packageJSON: manifest(#"{"scripts":{"start":"node a"}}"#), port: 1, files: installed)
        #expect(start.kind == .npmScript("start"))
    }

    @Test func missingDependenciesAreReportedNotLaunched() {
        #expect(throws: PreviewLaunchError.dependenciesMissing) {
            try PreviewLauncher.plan(packageJSON: manifest(#"{"dependencies":{"vite":"8"}}"#), port: 1, files: files([:]))
        }
        #expect(throws: PreviewLaunchError.dependenciesMissing) {
            try PreviewLauncher.plan(packageJSON: manifest(#"{"scripts":{"dev":"x"}}"#), port: 1, files: files([:]))
        }
    }

    @Test func aProjectWithNothingToRunIsNotPreviewable() {
        let installed = files(["node_modules/.package-lock.json": "{}"])
        #expect(throws: PreviewLaunchError.noDevScript) {
            try PreviewLauncher.plan(packageJSON: manifest(#"{"scripts":{"build":"x"}}"#), port: 1, files: installed)
        }
        #expect(throws: PreviewLaunchError.notAWebProject) {
            try PreviewLauncher.plan(packageJSON: manifest("not json"), port: 1, files: installed)
        }
    }
}
