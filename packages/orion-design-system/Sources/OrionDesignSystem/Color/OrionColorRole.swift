import SwiftUI

public enum OrionColorRole: CaseIterable, Sendable {
    case canvas, surface, surfaceStrong, textPrimary, textSecondary, textInverse
    case accent, focus, selection, success, warning, danger, information
    case border, borderStrong, disabled

    public func resolve(in scheme: ColorScheme, contrast: ColorSchemeContrast = .standard) -> Color {
        let dark = scheme == .dark
        switch self {
        case .canvas: return (dark ? OrionColor.black : .offWhite).color
        case .surface: return (dark ? OrionColor.offWhite : .black).color.opacity(dark ? 0.06 : 0.025)
        case .surfaceStrong: return (dark ? OrionColor.offWhite : .black).color.opacity(dark ? 0.12 : 0.06)
        case .textPrimary: return (dark ? OrionColor.offWhite : .black).color
        case .textSecondary: return (dark ? OrionColor.offWhite : .black).color.opacity(contrast == .increased ? 1 : 0.76)
        case .textInverse: return (dark ? OrionColor.black : .offWhite).color
        case .accent, .selection: return OrionColor.dayBreakBlue.color
        case .focus: return (dark ? OrionColor.dayBreakBlue : .electricBlue).color
        case .success: return (dark ? OrionColor.kryptoniteGreen : .deepGreen).color
        case .warning: return OrionColor.summerYellow.color
        case .danger: return OrionColor.loudRed.color
        case .information: return (dark ? OrionColor.dayBreakBlue : .openSkyBlue).color
        case .border: return (dark ? OrionColor.offWhite : .black).color.opacity(contrast == .increased ? 0.7 : 0.2)
        case .borderStrong: return (dark ? OrionColor.offWhite : .black).color.opacity(contrast == .increased ? 1 : 0.5)
        case .disabled: return OrionColor.gray.color
        }
    }
}

