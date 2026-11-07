import SwiftUI

public enum OrionTextStyle: CaseIterable, Sendable {
    case display, headline, title, subheadline, body, callout, caption, label
    public var size: CGFloat {
        switch self {
        case .display: 48
        case .headline: 32
        case .title: 24
        case .subheadline: 20
        case .body: 16
        case .callout: 14
        case .caption: 12
        case .label: 14
        }
    }
    public var relativeTo: Font.TextStyle {
        switch self {
        case .display: .largeTitle
        case .headline: .title
        case .title: .title2
        case .subheadline: .title3
        case .body: .body
        case .callout, .label: .callout
        case .caption: .caption
        }
    }
    public var isHeadline: Bool { self == .display || self == .headline }
    public var isBold: Bool { isHeadline || self == .title || self == .subheadline || self == .label }
    public var trackingEm: CGFloat { isHeadline ? 0 : (self == .title || self == .subheadline ? -0.005 : 0.005) }
    public var lineHeightMultiple: CGFloat { isHeadline ? 0.9 : (self == .title || self == .subheadline ? 1.2 : 1.3) }
}
