import Foundation

/// What a motion personality means in exact numbers (spec B3). Pure data.
public struct TasteMotionSpec: Equatable, Sendable {
    public let motion: TasteMotion
    public let title: String
    public let meaning: String
    public let enterDuration: Double
    public let rise: Double
    public let blur: Double
    public let overshoot: Double
    public let curve: [Double]

    public static let pressScale = 0.96
    public static let pressDuration = 0.15
    public static let exitDuration = 0.15
    public static let exitRise = 12.0
    public static let exitBlur = 4.0
    public static let staggerInterval = 0.1
    public static let loopSeconds = 2.4

    public init(_ motion: TasteMotion) {
        self.motion = motion
        let easeOut = [0.2, 0.0, 0.0, 1.0]
        switch motion {
        case .instant:
            title = String(localized: "Instant"); meaning = String(localized: "No movement · 0 ms")
            enterDuration = 0; rise = 0; blur = 0; overshoot = 0; curve = easeOut
        case .snappy:
            title = String(localized: "Snappy"); meaning = String(localized: "Quick, no bounce · 150 ms")
            enterDuration = 0.15; rise = 12; blur = 4; overshoot = 0; curve = easeOut
        case .smooth:
            title = String(localized: "Smooth"); meaning = String(localized: "Calm and soft · 300 ms")
            enterDuration = 0.30; rise = 12; blur = 4; overshoot = 0; curve = easeOut
        case .playful:
            title = String(localized: "Playful"); meaning = String(localized: "A little overshoot · 450 ms")
            enterDuration = 0.45; rise = 12; blur = 4; overshoot = 0.03; curve = easeOut
        }
    }
}
