import AppKit
import SwiftUI
import WebKit

struct OrionRootView: View {
    let model: WindowModel
    let frame: FrameModel
    let webView: WKWebView
    let retry: () -> Void

    var body: some View {
        OrionFrameView(frame: frame) {
            page
        }
        .frame(minWidth: 900, minHeight: 600)
    }

    /// Overview is drawn natively; other places keep the web page. The web
    /// view stays mounted (hidden) on Overview so the frame bridge keeps
    /// posting snapshots.
    private var showsNativeOverview: Bool {
        frame.isAvailable && frame.destination == .home
    }

    private var page: some View {
        ZStack {
            WebViewHost(webView: webView)
                .opacity(showsNativeOverview ? 0 : 1)
                .allowsHitTesting(!showsNativeOverview)
                .accessibilityHidden(showsNativeOverview)
            if showsNativeOverview {
                OverviewPage(frame: frame)
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
