import AppKit
import WebKit

@MainActor
enum ScreenSnapshotter {
    static func render(html: String, size: CGSize) async -> NSImage? {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        let view = WKWebView(frame: CGRect(origin: .zero, size: size), configuration: configuration)
        let window = NSWindow(contentRect: CGRect(x: -30_000, y: -30_000, width: size.width, height: size.height),
                              styleMask: .borderless, backing: .buffered, defer: false)
        window.contentView = view
        window.orderBack(nil)
        defer { window.close() }

        let waiter = LoadWaiter()
        view.navigationDelegate = waiter
        view.loadHTMLString(html, baseURL: nil)
        guard await waiter.finished(timeout: .seconds(10)) else { return nil }
        let snapshot = WKSnapshotConfiguration()
        snapshot.rect = CGRect(origin: .zero, size: size)
        return try? await view.takeSnapshot(configuration: snapshot)
    }
}

@MainActor
private final class LoadWaiter: NSObject, WKNavigationDelegate {
    private var continuation: CheckedContinuation<Bool, Never>?
    private var result: Bool?

    func finished(timeout: Duration) async -> Bool {
        if let result { return result }
        return await withCheckedContinuation { continuation in
            self.continuation = continuation
            Task { [weak self] in
                try? await Task.sleep(for: timeout)
                self?.resume(false)
            }
        }
    }

    private func resume(_ value: Bool) {
        result = value
        continuation?.resume(returning: value)
        continuation = nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { resume(true) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { resume(false) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { resume(false) }
}
