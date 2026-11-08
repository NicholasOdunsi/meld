public struct OrionTonePalette: Sendable, Equatable {
    public let background: OrionColor
    public let accents: [OrionColor]
    public var textForeground: OrionColor { background.textForeground }
}

