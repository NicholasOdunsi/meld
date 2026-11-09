import OrionDesignSystem
import SwiftUI

/// How a project's stored icon and colour keys look natively. The keys are
/// the web app's (apps/web/src/features/projects/schemas.ts); unknown keys
/// fall back to a folder in the accent colour.
enum ProjectStyle {
    static let colorKeys = ["blue", "teal", "purple", "pink", "red", "orange", "yellow", "green", "cyan", "gray"]

    static func color(_ key: String) -> Color {
        switch key {
        case "blue": .blue
        case "teal": .teal
        case "purple": .purple
        case "pink": .pink
        case "red": .red
        case "orange": .orange
        case "yellow": .yellow
        case "green": .green
        case "cyan": .cyan
        case "gray": .gray
        default: .accentColor
        }
    }

    static func colorName(_ key: String) -> LocalizedStringResource {
        switch key {
        case "blue": "Blue"
        case "teal": "Teal"
        case "purple": "Purple"
        case "pink": "Pink"
        case "red": "Red"
        case "orange": "Orange"
        case "yellow": "Yellow"
        case "green": "Green"
        case "cyan": "Cyan"
        default: "Gray"
        }
    }

    static func icon(_ key: String) -> OrionIcon {
        switch key {
        case "rocket": .rocketLaunch
        case "target": .target
        case "light-bulb": .lightbulb
        case "flag": .flag
        case "star": .star
        case "heart": .heart
        case "briefcase": .briefcase
        case "bar-chart": .chartBar
        case "calendar": .calendar
        case "bookmark": .bookmark
        case "trophy": .trophy
        case "shield": .shield
        case "compass": .compass
        case "puzzle": .puzzlePiece
        case "megaphone": .megaphone
        case "gift": .gift
        case "camera": .camera
        case "palette": .palette
        case "globe": .globe
        case "bank": .bank
        case "coins": .coins
        case "credit-card": .creditCard
        case "wallet": .wallet
        case "crown": .crown
        case "graduation-cap": .graduationCap
        case "analytics": .chartLineUp
        case "receipt": .receipt
        case "shop": .storefront
        case "seedlings": .plant
        default: .folder
        }
    }
}
