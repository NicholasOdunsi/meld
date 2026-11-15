import OrionDesignSystem
import SwiftUI

/// Chat avatar: the owner's round DiceBear picture, or Orion's full-colour
/// hat drawn at its natural silhouette (no circle, no background disc).
struct ChatAvatar: View {
    let isOrion: Bool
    var size: CGFloat = 32

    var body: some View {
        Group {
            if isOrion {
                if let image = OrionHatPortrait.neutral.image {
                    Image(nsImage: image)
                        .resizable()
                        .scaledToFit()
                } else {
                    Color.clear
                }
            } else {
                Group {
                    if let image = OrionUserAvatar.image {
                        Image(nsImage: image)
                            .resizable()
                            .scaledToFill()
                    } else {
                        Color.secondary.opacity(0.25)
                    }
                }
                .background(.quaternary)
                .clipShape(Circle())
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
