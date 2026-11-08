import SwiftUI

public enum OrionMotion {
    public static let quick: Double = 0.12
    public static let standard: Double = 0.2
    public static let expressive: Double = 0.35
    public static let springResponse: Double = 0.35
    public static let springDamping: Double = 0.85
    public static func interaction(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .easeOut(duration: quick)
    }
}

