import SwiftUI

struct TransientMessageView: View {
    let message: String

    var body: some View {
        Text(message)
            .padding(ShelfDesign.spacing)
            .frame(maxWidth: ShelfDesign.messageWidth)
    }
}
