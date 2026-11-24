import SwiftUI
import WebKit

/// A separate, local browser surface. The hosted Canvas and its native bridge
/// stay mounted behind it, with their own session and navigation.
struct CanvasLivePreview: NSViewRepresentable {
    let url: URL

    func makeCoordinator() -> Navigation { Navigation(origin: url) }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.load(URLRequest(url: url))
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {}

    @MainActor
    final class Navigation: NSObject, WKNavigationDelegate {
        let origin: URL

        init(origin: URL) { self.origin = origin }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let destination = navigationAction.request.url,
                  destination.scheme == origin.scheme,
                  destination.host == origin.host,
                  destination.port == origin.port else { return .cancel }
            return .allow
        }
    }
}
