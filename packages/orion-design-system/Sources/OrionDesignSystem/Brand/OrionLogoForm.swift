import Foundation

public enum OrionLogoForm: Sendable {
    case mark, wordmark
    public var bounds: CGRect {
        self == .mark ? CGRect(x: 0, y: 35, width: 93, height: 97.111) : CGRect(x: 0, y: 0, width: 397, height: 133)
    }
    public var aspectRatio: CGFloat { bounds.width / bounds.height }
}
