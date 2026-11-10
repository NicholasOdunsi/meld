import AppKit
import OrionAppCore
import SwiftUI
import WebKit

struct OrionRootView: View {
    let model: WindowModel
    let frame: FrameModel
    let inspiration: InspirationModel
    let appModel: AppModel
    let webView: WKWebView
    let retry: () -> Void
    let reconnect: () -> Void

    var body: some View {
        OrionFrameView(frame: frame) {
            page
        }
        .frame(minWidth: 900, minHeight: 600)
        // Inspiration inspect covers the whole window, including the sidebar.
        .overlay {
            if let item = inspiration.inspectedItem {
                InspirationOverlay(item: item, model: inspiration, frame: frame)
                    .transition(.opacity)
            }
        }
        .animation(.snappy(duration: 0.2), value: inspiration.isInspecting)
    }

    /// Overview and Inspiration are drawn natively; other places keep the web
    /// page. The web view stays mounted (hidden) so the frame bridge keeps
    /// posting snapshots.
    private var nativePage: FrameDestination? {
        guard frame.isAvailable, let destination = frame.destination else { return nil }
        return destination == .home || destination == .inspiration ? destination : nil
    }

    private var page: some View {
        ZStack {
            WebViewHost(webView: webView)
                .opacity(nativePage != nil ? 0 : 1)
                .allowsHitTesting(nativePage == nil)
                .accessibilityHidden(nativePage != nil)
            switch nativePage {
            case .home:
                OverviewPage(frame: frame)
            case .inspiration:
                InspirationScreen(model: inspiration, appModel: appModel, frame: frame, reconnect: reconnect)
            default:
                EmptyView()
            }
            switch model.phase {
            case .loading where webView.url == nil:
                ProgressView()
                    .controlSize(.large)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.background)
            case .unreachable(let problem):
                UnreachableView(problem: problem, retry: retry)
            default:
                EmptyView()
            }
        }
    }
}

private struct WebViewHost: NSViewRepresentable {
    let webView: WKWebView
    func makeNSView(context: Context) -> WKWebView { webView }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
