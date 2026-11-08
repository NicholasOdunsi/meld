import SwiftUI

public struct OrionStatusToken: View {
    private let status: OrionStatus
    private let label: LocalizedStringResource
    public init(_ status: OrionStatus, label: LocalizedStringResource) {
        self.status = status
        self.label = label
    }
    public var body: some View {
        Label { Text(label) } icon: { Image(systemName: status.symbol) }
            .orionTextStyle(.caption, emphasized: true)
            .padding(.horizontal, OrionSpacing.xs)
            .padding(.vertical, OrionSpacing.xxs)
            .foregroundStyle(status.color.textForeground.color)
            .background(status.color.color, in: .capsule)
    }
}
