import Foundation

public enum WallNavigation {
    public static func next(from current: Int, direction: WallDirection, columns: [[Int]]) -> Int? {
        let total = columns.reduce(0) { $0 + $1.count }
        switch direction {
        case .left:
            return current > 0 ? current - 1 : nil
        case .right:
            return current + 1 < total ? current + 1 : nil
        case .up, .down:
            guard let column = columns.first(where: { $0.contains(current) }),
                  let row = column.firstIndex(of: current) else { return nil }
            let target = direction == .up ? row - 1 : row + 1
            return column.indices.contains(target) ? column[target] : nil
        }
    }
}
