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
        window.titlebarSeparatorStyle = .none
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
        // Titlebar views exist after the first layout; clear their opaque
        // fullscreen backdrop so WindowGlass can show through.
        DispatchQueue.main.async { [weak self] in
            self?.revealContentUnderTitlebar()
        }
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

    func windowDidEnterFullScreen(_ notification: Notification) {
        // AppKit recreates titlebar chrome for the fullscreen space.
        revealContentUnderTitlebar()
    }

    func windowDidExitFullScreen(_ notification: Notification) {
        revealContentUnderTitlebar()
    }

    func windowDidBecomeKey(_ notification: Notification) {
        revealContentUnderTitlebar()
    }

    /// Native fullscreen paints an opaque `NSTitlebarBackgroundView` /
    /// `NSVisualEffectView` over `fullSizeContentView`, which reads as a solid
    /// black strip on top of our glass. Hide those system views and clear the
    /// titlebar layers so the sidebar/Overview wash can fill the top edge.
    private func revealContentUnderTitlebar() {
        guard let window else { return }
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none

        guard
            let closeButton = window.standardWindowButton(.closeButton),
            let titlebarView = closeButton.superview,
            let titlebarContainer = titlebarView.superview
        else { return }

        titlebarView.wantsLayer = true
        titlebarView.layer?.backgroundColor = NSColor.clear.cgColor
        titlebarContainer.wantsLayer = true
        titlebarContainer.layer?.backgroundColor = NSColor.clear.cgColor

        for view in titlebarContainer.subviews {
            let kind = String(describing: type(of: view))
            if kind.contains("NSTitlebarBackgroundView") || view is NSVisualEffectView {
                view.isHidden = true
            }
        }
        for view in titlebarView.subviews where view is NSVisualEffectView {
            view.isHidden = true
        }
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
