import AppKit
import Network
import SwiftUI

@MainActor
final class MainWindowController: NSWindowController, NSWindowDelegate {
    private let model: WindowModel
    private let web: WebViewController
    private let pathMonitor = NWPathMonitor()
    private var hasLoaded = false
    var onVisibilityChange: ((Bool) -> Void)?

    init(model: WindowModel, frame: FrameModel, web: WebViewController) {
        self.model = model
        self.web = web
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Orion"
        // Custom column chrome draws the sidebar toggle and chat tabs; keep the
        // system title bar clear so those don't share one toolbar row and clash.
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        // Let WindowGlass show the desktop through the whole window.
        window.isOpaque = false
        window.backgroundColor = .clear
        window.toolbarStyle = .unified
        window.isReleasedWhenClosed = false
        window.center()
        window.setFrameAutosaveName("OrionMain")
        super.init(window: window)
        window.delegate = self
        let hostingView = NSHostingView(rootView: OrionRootView(model: model, frame: frame, webView: web.webView, retry: { [weak web] in web?.reload() }))
        // Sheets still use SwiftUI toolbars; the frame chrome does not.
        hostingView.sceneBridgingOptions = [.toolbars]
        window.contentView = hostingView
        startWatchingNetwork()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("Not used") }

    isolated deinit {
        pathMonitor.cancel()
    }

    var isKeyWindow: Bool { window?.isKeyWindow ?? false }

    func show() {
        if !hasLoaded {
            hasLoaded = true
            web.load(model.launchURL)
        }
        onVisibilityChange?(true)
        showWindow(nil)
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate()
    }

    func show(loading url: URL) {
        hasLoaded = true
        web.load(url)
        show()
    }

    func windowWillClose(_ notification: Notification) {
        onVisibilityChange?(false)
    }

    private func startWatchingNetwork() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in
                guard let self, case .unreachable(.offline) = self.model.phase else { return }
                self.web.reload()
            }
        }
        pathMonitor.start(queue: .main)
    }
}
