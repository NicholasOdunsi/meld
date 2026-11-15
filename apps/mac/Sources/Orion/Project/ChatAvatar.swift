import OrionDesignSystem
import SwiftUI

/// Round chat avatar: the owner's DiceBear picture, or Orion's hat.
struct ChatAvatar: View {
    let isOrion: Bool
    var size: CGFloat = 32

    var body: some View {
        Group {
            if let image = isOrion ? OrionHatPortrait.neutral.image : OrionUserAvatar.image {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Color.secondary.opacity(0.25)
            }
        }
        .frame(width: size, height: size)
        .background(.quaternary)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }
}
