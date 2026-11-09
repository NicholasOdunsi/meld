import AppKit
import Network
import SwiftUI

@MainActor
final class MainWindowController: NSWindowController, NSWindowDelegate {
    private let model: WindowModel
    private let web: WebViewController
    private let pathMonitor = NWPathMonitor()
    private var hasLoaded = false
    private var toolbarWindowObserver: NSObjectProtocol?
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
        if let toolbarWindowObserver {
            NotificationCenter.default.removeObserver(toolbarWindowObserver)
        }
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
        // Hovering the top edge slides the menu bar and toolbar window down,
        // and AppKit re-shows its dark backstop each time — clear it again.
        toolbarWindowObserver = NotificationCenter.default.addObserver(
            forName: NSWindow.didMoveNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard let moved = note.object as? NSWindow, Self.isFullScreenToolbarWindow(moved) else { return }
            MainActor.assumeIsolated { self?.revealContentUnderTitlebar() }
        }
    }

    func windowDidExitFullScreen(_ notification: Notification) {
        if let toolbarWindowObserver {
            NotificationCenter.default.removeObserver(toolbarWindowObserver)
            self.toolbarWindowObserver = nil
        }
        revealContentUnderTitlebar()
    }

    func windowDidBecomeKey(_ notification: Notification) {
        revealContentUnderTitlebar()
    }

    /// Native fullscreen paints opaque titlebar chrome over `fullSizeContentView`,
    /// which reads as a solid black strip on top of our glass. Hide those system
    /// views and layers so the sidebar/Overview wash can fill the top edge.
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

        // In fullscreen the titlebar moves into a separate toolbar window whose
        // content view carries a solid "NSOpaqueBackstop" layer — that is the
        // black band. AppKit re-shows and re-colors it when the menu bar slides
        // in, so also give it an empty mask, which AppKit leaves alone.
        for layer in titlebarContainer.superview?.layer?.sublayers ?? []
        where layer.name == "NSOpaqueBackstop" {
            layer.backgroundColor = NSColor.clear.cgColor
            layer.isHidden = true
            if layer.mask == nil { layer.mask = CALayer() }
        }
    }

    private static func isFullScreenToolbarWindow(_ window: NSWindow) -> Bool {
        String(describing: type(of: window)) == "NSToolbarFullScreenWindow"
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
