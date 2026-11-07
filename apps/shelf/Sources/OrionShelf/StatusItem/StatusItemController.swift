import AppKit
import Observation
import OrionDesignSystem
import SwiftUI

/// Owns the menu-bar icon and its popover. AppKit is required here: SwiftUI's
/// MenuBarExtra cannot accept drops onto the icon itself.
@MainActor
final class StatusItemController: NSObject {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let panel = NSPopover()
    private let message = NSPopover()
    private let dropTarget: StatusItemDropTarget
    private let appModel: AppModel

    init(appModel: AppModel) {
        self.appModel = appModel
        self.dropTarget = StatusItemDropTarget(appModel: appModel)
        super.init()
        panel.behavior = .transient
        panel.contentViewController = NSHostingController(rootView: PanelView().environment(appModel))
        message.behavior = .applicationDefined
        if let button = statusItem.button {
            button.target = self
            button.action = #selector(togglePanel)
            button.imagePosition = .imageLeading
            dropTarget.attach(to: button)
        }
        appModel.transientMessageHandler = { [weak self] text in self?.show(text) }
        trackIcon()
    }

    private func trackIcon() {
        withObservationTracking {
            render(appModel.icon)
        } onChange: { [weak self] in
            Task { @MainActor in self?.trackIcon() }
        }
    }

    private func render(_ icon: StatusIcon) {
        guard let button = statusItem.button else { return }
        if let symbolName = icon.symbolName {
            button.image = NSImage(systemSymbolName: symbolName, accessibilityDescription: icon.accessibilityLabel)
        } else {
            // Orion mark (the O) as a template image so the menu bar colors it.
            let mark = OrionLogo.menuBarImage()
            mark?.accessibilityDescription = icon.accessibilityLabel
            button.image = mark
        }
        button.title = icon.badgeText
        button.setAccessibilityLabel(icon.accessibilityLabel)
    }

    @objc private func togglePanel() {
        guard let button = statusItem.button else { return }
        if panel.isShown {
            panel.performClose(nil)
        } else {
            message.performClose(nil)
            appModel.panelWillOpen()
            panel.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            NSApp.activate()
        }
    }

    /// The panel shows `lastMessage` itself; this covers drops and the hotkey
    /// while the panel is closed.
    private func show(_ text: String) {
        guard !panel.isShown, let button = statusItem.button else { return }
        message.contentViewController = NSHostingController(rootView: TransientMessageView(message: text))
        message.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        Task { [weak self] in
            try? await Task.sleep(for: ShelfDesign.messageDuration)
            self?.message.performClose(nil)
        }
    }
}
