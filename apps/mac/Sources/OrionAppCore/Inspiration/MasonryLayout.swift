import Foundation

/// Pinterest-style columns. Pure so it is tested without SwiftUI.
public enum MasonryLayout {
    public static func columnCount(width: Double, tileWidth: Double, spacing: Double) -> Int {
        guard width > 0, tileWidth > 0 else { return 1 }
        return max(1, Int((width + spacing) / (tileWidth + spacing)))
    }

    public static func columns(aspectRatios: [Double], count: Int) -> [[Int]] {
        let count = max(1, count)
        var columns = Array(repeating: [Int](), count: count)
        var heights = Array(repeating: 0.0, count: count)
        for (index, ratio) in aspectRatios.enumerated() {
            // Shortest column; ties go to the leftmost so rows read naturally.
            var target = 0
            for column in 1..<count where heights[column] < heights[target] {
                target = column
            }
            columns[target].append(index)
            heights[target] += 1 / max(ratio, 0.05)
        }
        return columns
    }
}
