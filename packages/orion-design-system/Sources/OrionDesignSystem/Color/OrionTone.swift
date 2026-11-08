public enum OrionTone: CaseIterable, Sendable {
    case green, warm, blue, pink

    public func palette(for variant: OrionToneVariant) -> OrionTonePalette {
        let light: OrionColor
        let middle: OrionColor
        let deep: OrionColor
        let disruptive: OrionColor
        let illustration: [OrionColor]
        switch self {
        case .green:
            (light, middle, deep, disruptive) = (.kryptoniteGreen, .pineGreen, .deepGreen, .dayBreakBlue)
            illustration = [.pineGreen, .kryptoniteGreen, .dayBreakBlue, .futuristicPink, .summerYellow, .nectarineOrange]
        case .warm:
            (light, middle, deep, disruptive) = (.summerYellow, .nectarineOrange, .partyOrange, .candyPink)
            illustration = [.partyOrange, .summerYellow, .futuristicPink, .kryptoniteGreen, .dayBreakBlue, .electricBlue]
        case .blue:
            (light, middle, deep, disruptive) = (.dayBreakBlue, .electricBlue, .openSkyBlue, .kryptoniteGreen)
            illustration = [.electricBlue, .dayBreakBlue, .kryptoniteGreen, .summerYellow, .nectarineOrange, .futuristicPink]
        case .pink:
            (light, middle, deep, disruptive) = (.candyPink, .futuristicPink, .loudRed, .deepGreen)
            illustration = [.loudRed, .candyPink, .dayBreakBlue, .nectarineOrange, .summerYellow, .kryptoniteGreen]
        }
        switch variant {
        case .offWhiteBackground: return .init(background: .offWhite, accents: [light])
        case .lightBackground: return .init(background: light, accents: [.offWhite])
        case .lightBackgroundDarkForeground: return .init(background: light, accents: [deep])
        case .monotone: return .init(background: middle, accents: [light, deep])
        case .darkBackgroundLightForeground: return .init(background: deep, accents: [light])
        case .disruptive: return .init(background: self == .warm ? deep : middle, accents: [disruptive])
        case .multicolor: return .init(background: .offWhite, accents: illustration)
        }
    }
}

