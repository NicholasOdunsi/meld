import SwiftUI

struct WaitingRowView: View {
    let count: Int
    let retry: () -> Void

    var body: some View {
        HStack {
            Label("Waiting: \(count)", systemImage: "clock")
            Spacer()
            Button("Retry now", systemImage: "arrow.clockwise", action: retry)
                .pointerStyle(.link)
        }
    }
}
