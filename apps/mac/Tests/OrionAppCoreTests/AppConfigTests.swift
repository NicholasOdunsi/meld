import Foundation
import Testing
@testable import OrionAppCore

struct AppConfigTests {
    @Test func knowsAPreviewBuild() {
        #expect(AppConfig.isPreview(info: ["OrionPreview": true]))
        #expect(!AppConfig.isPreview(info: ["OrionPreview": false]))
        #expect(!AppConfig.isPreview(info: [:]))
        #expect(!AppConfig.isPreview(info: nil))
    }

    private func defaults() -> UserDefaults {
        UserDefaults(suiteName: "orion-config-\(UUID().uuidString)") ?? .standard
    }

    @Test func readsTheBaseURLFromInfoPlist() {
        let url = AppConfig.baseURL(info: ["OrionBaseURL": "https://orion-workspace-phi.vercel.app"], defaults: defaults())
        #expect(url.absoluteString == "https://orion-workspace-phi.vercel.app")
    }

    @Test func aDebugOverrideWins() {
        let store = defaults()
        store.set("http://127.0.0.1:3000", forKey: AppConfig.overrideKey)
        let url = AppConfig.baseURL(info: ["OrionBaseURL": "https://orion-workspace-phi.vercel.app"], defaults: store)
        #expect(url.absoluteString == "http://127.0.0.1:3000")
    }

    @Test func ignoresNonWebOverridesAndFallsBack() {
        let store = defaults()
        store.set("file:///etc/passwd", forKey: AppConfig.overrideKey)
        #expect(AppConfig.baseURL(info: nil, defaults: store) == AppConfig.fallbackBaseURL)
    }
}
