import SwiftUI
import WebKit

/// A separate, local browser surface. The hosted Canvas and its native bridge
/// stay mounted behind it, with their own session and navigation.
struct CanvasLivePreview: NSViewRepresentable {
    let url: URL
    let editing: Bool
    let textEditable: Bool
    let resizable: Bool
    let onMessage: @MainActor (PreviewMessage) -> Void

    func makeCoordinator() -> Navigation {
        Navigation(origin: url, editing: editing, textEditable: textEditable, resizable: resizable, onMessage: onMessage)
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let coordinator = context.coordinator
        if let script = PreviewEditResources.overlayScript {
            // Bind the native receiver before page scripts run. The token stays in the
            // overlay's closure so page scripts cannot post edits directly to the handler.
            let source = """
                (() => {
                    const native = window.webkit.messageHandlers.orionPreview;
                    const send = native.postMessage.bind(native);
                    const orionPostPreviewMessage = message => send({ nonce: "\(coordinator.nonce)", message });
                    \(script)
                })();
                """
            configuration.userContentController.addUserScript(
                WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            configuration.userContentController.add(coordinator, name: "orionPreview")
        }
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = coordinator
        view.load(URLRequest(url: url))
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {
        let coordinator = context.coordinator
        coordinator.onMessage = onMessage
        guard coordinator.editing != editing || coordinator.textEditable != textEditable ||
                coordinator.resizable != resizable else { return }
        coordinator.editing = editing
        coordinator.textEditable = textEditable
        coordinator.resizable = resizable
        coordinator.syncOverlay(in: view)
    }

    static func dismantleNSView(_ view: WKWebView, coordinator: Navigation) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "orionPreview")
    }

    @MainActor
    final class Navigation: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        let origin: URL
        let nonce = UUID().uuidString
        var editing: Bool
        var textEditable: Bool
        var resizable: Bool
        var onMessage: @MainActor (PreviewMessage) -> Void

        init(origin: URL, editing: Bool, textEditable: Bool, resizable: Bool,
             onMessage: @escaping @MainActor (PreviewMessage) -> Void) {
            self.origin = origin
            self.editing = editing
            self.textEditable = textEditable
            self.resizable = resizable
            self.onMessage = onMessage
        }

        func syncOverlay(in webView: WKWebView) {
            webView.evaluateJavaScript("""
                window.__orionPreviewEdit?.setEnabled(\(editing));
                window.__orionPreviewEdit?.setSelectionInfo({ textEditable: \(textEditable), resizable: \(resizable) });
                """, completionHandler: nil)
        }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            let page = message.frameInfo.securityOrigin
            guard editing, message.frameInfo.isMainFrame, page.protocol == origin.scheme,
                  page.host == origin.host, page.port == origin.port,
                  let envelope = message.body as? [String: Any], envelope["nonce"] as? String == nonce,
                  let body = envelope["message"], let decoded = PreviewMessage(body: body) else { return }
            onMessage(decoded)
        }

        func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
            if editing { onMessage(.cleared) }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            syncOverlay(in: webView)
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let destination = navigationAction.request.url,
                  destination.scheme == origin.scheme,
                  destination.host == origin.host,
                  destination.port == origin.port else { return .cancel }
            return .allow
        }
    }
}
