import CoreGraphics
import Foundation

/// Which of its three looks the composer wears.
enum ComposerPhase: Equatable {
    case resting, open, reading

    static func of(isExpanded: Bool, hasContent: Bool, isReading: Bool) -> ComposerPhase {
        if isReading { return .reading }
        return (isExpanded || hasContent) ? .open : .resting
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

    static func sendSize(for phase: ComposerPhase) -> CGFloat { phase == .resting ? 30 : 34 }
    static func cornerRadius(for phase: ComposerPhase) -> CGFloat { phase == .resting ? 30 : 28 }
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
