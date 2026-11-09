import AppKit
import OrionAppCore
import WebKit

/// Owns the WKWebView: where links go, file pickers, downloads, and load state.
@MainActor
final class WebViewController: NSObject {
    let webView: WKWebView
    private let model: WindowModel
    private let policy: LinkPolicy
    private var urlObservation: NSKeyValueObservation?
    /// Called with every page address, including Next.js client navigations.
    var onURLChange: ((URL?) -> Void)?

    init(model: WindowModel, policy: LinkPolicy, version: String, messageHandler: (any WKScriptMessageHandler)?) {
        self.model = model
        self.policy = policy
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        // "OrionFrame/1" tells Orion pages that this app draws the sidebar and
        // project tabs natively, so they render content only.
        configuration.applicationNameForUserAgent = "OrionMac/\(version) OrionFrame/1"
        // Keep the room page's polling running while the window is closed/hidden so "AI finished" notifications fire.
        configuration.preferences.inactiveSchedulingPolicy = .none
        if let messageHandler {
            configuration.userContentController.add(messageHandler, name: "orion")
        }
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        // Let the native WindowGlass show through the page (pages in the
        // Orion frame paint transparent backgrounds to match).
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = .clear
        // Fires on Next.js client-side navigations too, which the navigation delegate doesn't see.
        urlObservation = webView.observe(\.url, options: [.new]) { [weak self] webView, _ in
            MainActor.assumeIsolated {
                self?.model.remember(webView.url)
                self?.onURLChange?(webView.url)
            }
        }
    }

    func load(_ url: URL) {
        model.didStartLoading()
        webView.load(URLRequest(url: url))
    }

    func reload() {
        if webView.url == nil { load(model.launchURL) } else { model.didStartLoading(); webView.reload() }
    }

    func evaluate(_ script: String) {
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    private func openExternally(_ url: URL) {
        NSWorkspace.shared.open(url)
    }
}

extension WebViewController: FrameCommanding {
    func callFrame(_ functionBody: String, arguments: [String: any Sendable]) async -> FrameCallResult {
        do {
            let value = try await webView.callAsyncJavaScript(functionBody, arguments: arguments, contentWorld: .page)
            return FrameCallResult.parse(value)
        } catch {
            return .unavailable
        }
    }

    func load(path: String) {
        guard let url = RestorableURL.resolve(path: path, appOrigin: model.appOrigin) else { return }
        load(url)
    }
}

extension WebViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .cancel }
        // Images, iframes and other sub-frames always load; only top-level navigations are policed.
        guard action.targetFrame?.isMainFrame ?? true else { return .allow }
        if action.shouldPerformDownload { return .download }
        switch policy.decide(url) {
        case .loadInApp: return .allow
        case .openExternally: openExternally(url); return .cancel
        case .ignore: return .cancel
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse) async -> WKNavigationResponsePolicy {
        if !response.canShowMIMEType { return .download }
        if response.isForMainFrame, let http = response.response as? HTTPURLResponse {
            model.didReceiveMainFrameStatus(http.statusCode)
        }
        return .allow
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if case .unreachable = model.phase { return }
        model.didFinishLoading()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: any Error) {
        model.didFail(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) {
        model.didFail(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        model.didFail(URLError(.networkConnectionLost))
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }
}

extension WebViewController: WKUIDelegate {
    /// target=_blank: Orion pages open in this window, everything else in the browser.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            switch policy.decide(url) {
            case .loadInApp: webView.load(action.request)
            case .openExternally: openExternally(url)
            case .ignore: break
            }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo) async -> [URL]? {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        return await panel.begin() == .OK ? panel.urls : nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
        let alert = NSAlert()
        alert.messageText = message
        alert.runModal()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: String(localized: "OK"))
        alert.addButton(withTitle: String(localized: "Cancel"))
        return alert.runModal() == .alertFirstButtonReturn
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo) async -> String? {
        let alert = NSAlert()
        alert.messageText = prompt
        let field = NSTextField(string: defaultText ?? "")
        field.frame.size.width = 280
        alert.accessoryView = field
        alert.addButton(withTitle: String(localized: "OK"))
        alert.addButton(withTitle: String(localized: "Cancel"))
        return alert.runModal() == .alertFirstButtonReturn ? field.stringValue : nil
    }
}

extension WebViewController: WKDownloadDelegate {
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String) async -> URL? {
        let downloads = URL.downloadsDirectory
        let base = (suggestedFilename as NSString).deletingPathExtension
        let ext = (suggestedFilename as NSString).pathExtension
        var candidate = downloads.appending(path: suggestedFilename)
        var counter = 2
        while FileManager.default.fileExists(atPath: candidate.path()) {
            candidate = downloads.appending(path: ext.isEmpty ? "\(base) \(counter)" : "\(base) \(counter).\(ext)")
            counter += 1
        }
        return candidate
    }
}
