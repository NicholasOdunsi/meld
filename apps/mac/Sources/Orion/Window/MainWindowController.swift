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

    init(model: WindowModel, web: WebViewController) {
        self.model = model
        self.web = web
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Orion"
        window.titlebarAppearsTransparent = true
        window.isReleasedWhenClosed = false
        window.center()
        window.setFrameAutosaveName("OrionMain")
        super.init(window: window)
        window.delegate = self
        window.contentView = NSHostingView(rootView: OrionRootView(model: model, webView: web.webView, retry: { [weak web] in web?.reload() }))
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
