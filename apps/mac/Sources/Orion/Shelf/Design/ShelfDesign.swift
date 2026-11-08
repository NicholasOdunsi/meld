import SwiftUI

/// Every size, spacing, and timing the shelf uses. Views never hard-code numbers.
enum ShelfDesign {
    static let panelWidth: Double = 320
    static let settingsWidth: Double = 420
    static let messageWidth: Double = 260
    static let spacing: Double = 12
    static let compactSpacing: Double = 6
    static let cornerRadius: Double = 10
    static let dropZoneHeight: Double = 112
    static let dropBorderWidth: Double = 1.5
    static let dropDash: [Double] = [6, 4]
    static let thumbnailSize: Double = 40
    static let flashDuration: Duration = .seconds(1)
    static let messageDuration: Duration = .seconds(2)
}
