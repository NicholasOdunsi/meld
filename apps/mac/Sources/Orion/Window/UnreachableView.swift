import OrionAppCore
import OrionDesignSystem
import SwiftUI

struct UnreachableView: View {
    let problem: SiteProblem
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            OrionLogo(form: .mark, decorative: true)
                .frame(height: 48)
            Text(title)
                .font(OrionFont.font(for: .title, size: 24, emphasized: true))
            Text(detail)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Try again", action: retry)
                .keyboardShortcut(.defaultAction)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.background)
    }

    private var title: String {
        switch problem {
        case .offline: String(localized: "Can't reach Orion")
        case .serverError: String(localized: "Orion is having trouble")
        }
    }

    private var detail: String {
        switch problem {
        case .offline: String(localized: "Check your internet connection. Orion will try again by itself when you're back online.")
        case .serverError: String(localized: "Something went wrong on Orion's side. Try again in a moment.")
        }
    }
}
