import CoreGraphics
import Foundation
import OrionDesignSystem

/// Which of its three looks the composer wears.
enum ComposerPhase: Equatable {
    case resting, open, reading

    static func of(isExpanded: Bool, isReading: Bool) -> ComposerPhase {
        if isReading { return .reading }
        // Draft content alone does not keep it open — click-away returns to rest.
        return isExpanded ? .open : .resting
    }
}

enum ComposerMetrics {
    static let restingWidth: CGFloat = 400
    static let openWidth: CGFloat = 560
    static let windowMargin: CGFloat = 60

    /// Spec B9: 400 resting, 560 open, never wider than the window minus 60.
    static func width(for phase: ComposerPhase, available: CGFloat) -> CGFloat {
        let target = phase == .resting ? restingWidth : openWidth
        return min(target, max(available - windowMargin, 0))
    }

    /// Same size resting and open so the arrow doesn't scale/shake during grow.
    static let sendSize: CGFloat = 32
    /// The "+" circle: same diameter as the send circle.
    static let plusSize: CGFloat = 32
    static let plusGlyphSize: CGFloat = 14

    // Shell insets, shared by every composer wearing the ice-glass shell
    // (Taste's FrostedComposer and the chat composer) so they stay in sync.
    static let restingLeading: CGFloat = OrionSpacing.md
    static let openLeading: CGFloat = 24
    static let restingTopInset: CGFloat = 11
    static let openTopInset: CGFloat = 14
    static let bottomInset: CGFloat = 11
    /// Gap between the open text area and the bottom bar.
    static let openBarGap: CGFloat = OrionSpacing.md
    /// Gap between the send circle and the shell's trailing edge.
    static let sendTrailingInset: CGFloat = OrionSpacing.sm
    /// Room the bar leaves on the right for the overlaid send circle.
    static let sendReserve: CGFloat = OrionSpacing.sm + sendSize + sendTrailingInset

    // Type: 15 light for what you type, 13 light for the hint on the bar.
    static let textFontSize: CGFloat = 15
    static let hintFontSize: CGFloat = 13
    /// One radius for every phase so the glass shell doesn't rebuild mid-animation.
    static let cornerRadius: CGFloat = 28
}

enum ComposerSend {
    static func isBright(canSend: Bool, canEdit: Bool, isReading: Bool) -> Bool {
        canSend && canEdit && !isReading
    }
}

enum ComposerStatusText {
    static let readingDetail = "Looking for lettering, shape and spacing. Nothing changes until you press Keep."

    static func reading(files: [String], links: [String]) -> String {
        let names = files + links
        switch names.count {
        case 0: return "Reading what you wrote…"
        case 1: return "Reading \(names[0])…"
        case 2: return "Reading \(names[0]), then \(names[1])…"
        default: return "Reading \(names[0]), then \(names[1]), and \(names.count - 2) more…"
        }
    }
}
