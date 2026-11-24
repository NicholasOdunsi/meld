import AppKit
import OrionAppCore
import SwiftUI
import WebKit

struct OrionRootView: View {
    let model: WindowModel
    let frame: FrameModel
    let inspiration: InspirationModel
    let taste: TasteModel
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

    /// Overview, Inspiration and Taste are drawn natively; other places keep the
    /// web page. The web view stays mounted (hidden) so the frame bridge keeps
    /// posting snapshots.
    private var nativePage: FrameDestination? {
        guard frame.isAvailable, let destination = frame.destination else { return nil }
        switch destination {
        case .home, .inspiration, .taste, .project: return destination
        default: return nil
        }
    }

    private var page: some View {
        ZStack {
            if nativePage != .project(frame.currentProject?.id ?? "") {
                WebViewHost(webView: webView)
                    .opacity(nativePage != nil ? 0 : 1)
                    .allowsHitTesting(nativePage == nil)
                    .accessibilityHidden(nativePage != nil)
            }
            switch nativePage {
            case .home:
                OverviewPage(frame: frame)
            case .inspiration:
                InspirationScreen(model: inspiration, appModel: appModel, frame: frame, reconnect: reconnect)
            case .taste:
                TasteScreen(model: taste, appModel: appModel, frame: frame, reconnect: reconnect)
            case .project:
                ProjectScreen(frame: frame, webView: webView)
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

struct WebViewHost: NSViewRepresentable {
    let webView: WKWebView
    /// A project panel (Canvas, Artifacts) is content inside the native frame.
    /// Its two-finger sideways swipes belong to the board, not to browser
    /// history, which would drag the whole page away and leave it offset.
    var allowsSwipeNavigation = true
    func makeNSView(context: Context) -> WKWebView {
        webView.allowsBackForwardNavigationGestures = allowsSwipeNavigation
        return webView
    }
    func updateNSView(_ nsView: WKWebView, context: Context) {
        nsView.allowsBackForwardNavigationGestures = allowsSwipeNavigation
    }
}
