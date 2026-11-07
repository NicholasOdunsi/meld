import Carbon.HIToolbox

/// ⌥⌘O from any app. Carbon's RegisterEventHotKey is still the only public API
/// for a system-wide shortcut that needs no Accessibility permission.
@MainActor
final class GlobalHotkey {
    private static let signature: OSType = 0x4F52_4E53 // "ORNS"
    private var hotKeyRef: EventHotKeyRef?
    private var handlerRef: EventHandlerRef?
    private let action: @MainActor () -> Void

    init(action: @escaping @MainActor () -> Void) {
        self.action = action
    }

    func register() {
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let context = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), { _, _, userData in
            guard let userData else { return OSStatus(eventNotHandledErr) }
            let hotkey = Unmanaged<GlobalHotkey>.fromOpaque(userData).takeUnretainedValue()
            // Carbon delivers application-target events on the main thread.
            MainActor.assumeIsolated { hotkey.action() }
            return noErr
        }, 1, &eventType, context, &handlerRef)
        RegisterEventHotKey(
            UInt32(kVK_ANSI_O),
            UInt32(cmdKey | optionKey),
            EventHotKeyID(signature: Self.signature, id: 1),
            GetApplicationEventTarget(),
            0,
            &hotKeyRef
        )
    }
}
