import SwiftUI

struct MessageBannerView: View {
    let message: String
    let dismiss: () -> Void

    var body: some View {
        HStack(alignment: .top) {
            Label(message, systemImage: "exclamationmark.circle")
            Spacer()
            Button("Dismiss", systemImage: "xmark", action: dismiss)
                .labelStyle(.iconOnly)
                .buttonStyle(.plain)
        }
        .foregroundStyle(.secondary)
    }
}
