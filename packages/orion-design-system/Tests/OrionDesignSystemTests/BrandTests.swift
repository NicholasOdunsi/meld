import Testing
import SwiftUI
import CoreText
@testable import OrionDesignSystem

struct BrandTests {
    @Test func defaultAppearanceIsDark() {
        #expect(OrionAppearance.preferredColorScheme == .dark)
    }

    @Test func exactPalette() {
        let expected: [UInt32] = [0xFFEA00, 0xFF9800, 0xFF5A00, 0x00E1F3, 0x5151FC,
            0x5100C0, 0xFFC0FF, 0xFF6FFF, 0xFC032D, 0xABFF5A, 0x00906C, 0x085E55,
            0xF9F9F9, 0x8F9193, 0x090909]
        #expect(OrionColor.allCases.map(\.rawValue) == expected)
        for color in OrionColor.allCases {
            let resolved = color.color.resolve(in: EnvironmentValues())
            #expect(abs(Double(resolved.red) - color.red) < 0.001)
            #expect(abs(Double(resolved.green) - color.green) < 0.001)
            #expect(abs(Double(resolved.blue) - color.blue) < 0.001)
            #expect(resolved.opacity == 1)
            #expect(color.contrast(with: color.textForeground) >= 4.5)
        }
    }

    @Test func toneMappings() {
        let expected: [[OrionColor]] = [
            [.offWhite, .kryptoniteGreen, .kryptoniteGreen, .pineGreen, .deepGreen, .pineGreen, .offWhite],
            [.offWhite, .summerYellow, .summerYellow, .nectarineOrange, .partyOrange, .partyOrange, .offWhite],
            [.offWhite, .dayBreakBlue, .dayBreakBlue, .electricBlue, .openSkyBlue, .electricBlue, .offWhite],
            [.offWhite, .candyPink, .candyPink, .futuristicPink, .loudRed, .futuristicPink, .offWhite]
        ]
        let accents: [[[OrionColor]]] = [
            [[.kryptoniteGreen], [.offWhite], [.deepGreen], [.kryptoniteGreen, .deepGreen], [.kryptoniteGreen], [.dayBreakBlue],
             [.pineGreen, .kryptoniteGreen, .dayBreakBlue, .futuristicPink, .summerYellow, .nectarineOrange]],
            [[.summerYellow], [.offWhite], [.partyOrange], [.summerYellow, .partyOrange], [.summerYellow], [.candyPink],
             [.partyOrange, .summerYellow, .futuristicPink, .kryptoniteGreen, .dayBreakBlue, .electricBlue]],
            [[.dayBreakBlue], [.offWhite], [.openSkyBlue], [.dayBreakBlue, .openSkyBlue], [.dayBreakBlue], [.kryptoniteGreen],
             [.electricBlue, .dayBreakBlue, .kryptoniteGreen, .summerYellow, .nectarineOrange, .futuristicPink]],
            [[.candyPink], [.offWhite], [.loudRed], [.candyPink, .loudRed], [.candyPink], [.deepGreen],
             [.loudRed, .candyPink, .dayBreakBlue, .nectarineOrange, .summerYellow, .kryptoniteGreen]]
        ]
        for (index, tone) in OrionTone.allCases.enumerated() {
            #expect(OrionToneVariant.allCases.map { tone.palette(for: $0).background } == expected[index])
            #expect(OrionToneVariant.allCases.map { tone.palette(for: $0).accents } == accents[index])
            for variant in OrionToneVariant.allCases {
                let palette = tone.palette(for: variant)
                #expect(palette.background.contrast(with: palette.textForeground) >= 4.5)
                #expect(palette.accents.count == (variant == .multicolor ? 6 : variant == .monotone ? 2 : 1))
            }
        }
        #expect(OrionTone.blue.palette(for: .monotone).accents == [.dayBreakBlue, .openSkyBlue])
        #expect(OrionTone.pink.palette(for: .disruptive).accents == [.deepGreen])
    }

    @Test @MainActor func fontsRegisterAndFallbackIsSafe() {
        #expect(FontRegistration.names.count == 3)
        for name in FontRegistration.names.values {
            let font = CTFontCreateWithName(name as CFString, 16, nil)
            #expect(CTFontCopyPostScriptName(font) as String == name)
        }
        for style in OrionTextStyle.allCases {
            _ = OrionFont.font(for: style, size: style.size)
            #expect(style.size > 0)
        }
        #expect(OrionFont.resolvedFont(name: nil, size: 16, weight: .bold) == .system(size: 16, weight: .bold, design: .default))
    }

    @Test func logoGeometry() {
        let full = OrionLogoPaths.path(markOnly: false).boundingRect
        let mark = OrionLogoPaths.path(markOnly: true).boundingRect
        #expect(abs(full.maxX - 396.263) < 0.001)
        #expect(abs(full.maxY - 132.5) < 0.001)
        #expect(abs(mark.width - 93) < 0.001)
        #expect(abs(mark.minY - 35) < 0.001)
        #expect(!OrionLogoPaths.path(markOnly: true).contains(CGPoint(x: 45, y: 85), eoFill: true))
        #expect(OrionLogoForm.wordmark.aspectRatio == 397.0 / 133)
        let scaled = OrionLogoShape(form: .mark).path(in: CGRect(x: 0, y: 0, width: 44, height: 44))
        #expect(scaled.boundingRect.width <= 44)
        #expect(scaled.boundingRect.height <= 44)
    }

    @Test func tokens() {
        let spacing = [OrionSpacing.xxs, OrionSpacing.xs, OrionSpacing.sm, OrionSpacing.md,
                       OrionSpacing.lg, OrionSpacing.xl, OrionSpacing.xxl]
        #expect(spacing == spacing.sorted())
        #expect(OrionSize.minimumHitTarget >= 44)
        #expect(OrionMotion.interaction(reduceMotion: true) == nil)
        #expect(OrionMotion.quick < OrionMotion.standard)
        #expect(OrionMotion.standard < OrionMotion.expressive)
    }

    #if os(macOS)
    @Test @MainActor func menuBarTemplate() {
        let image = OrionLogo.menuBarImage()
        #expect(image?.isTemplate == true)
        #expect(image?.size.height == 18)
        #expect(OrionLogo.menuBarImage(height: -1) == nil)
    }
    #endif

    @Test @MainActor func semanticForegroundContrast() {
        for scheme in [ColorScheme.light, .dark] {
            var environment = EnvironmentValues()
            environment.colorScheme = scheme
            let background = OrionColorRole.canvas.resolve(in: scheme).resolve(in: environment)
            for role in [OrionColorRole.textPrimary, .textSecondary, .success, .information] {
                let foreground = role.resolve(in: scheme).resolve(in: environment)
                func luminance(_ r: Color.Resolved) -> Double {
                    func linear(_ v: Float) -> Double {
                        let n = Double(v)
                        return n <= 0.04045 ? n / 12.92 : pow((n + 0.055) / 1.055, 2.4)
                    }
                    let alpha = foreground.opacity
                    return 0.2126 * linear(r.red * alpha + background.red * (1 - alpha))
                        + 0.7152 * linear(r.green * alpha + background.green * (1 - alpha))
                        + 0.0722 * linear(r.blue * alpha + background.blue * (1 - alpha))
                }
                let a = luminance(foreground), b = luminance(background)
                #expect((max(a, b) + 0.05) / (min(a, b) + 0.05) >= 4.5)
            }
        }
    }
}
