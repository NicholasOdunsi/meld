import OrionDesignSystem
import SwiftUI

struct StarRouteChoicePill: View {
    let title: String
    let continueAction: () -> Void
    let newAction: () -> Void

    var body: some View {
        HStack(spacing: OrionSpacing.sm) {
            Image(systemName: "questionmark.circle")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text("Part of \(title), or something new?")
                .lineLimit(2)
            Spacer(minLength: OrionSpacing.xs)
            Button("Continue") { continueAction() }
            Button("New Star") { newAction() }
        }
        .font(.caption)
        .padding(OrionSpacing.sm)
        .background(.regularMaterial, in: .capsule)
        .accessibilityElement(children: .contain)
    }
}
