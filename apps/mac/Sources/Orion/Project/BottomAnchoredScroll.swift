import SwiftUI

/// A chat-style scroll area: messages sit at the bottom, just above the
/// composer, when there are only a few of them; a longer conversation opens
/// scrolled to the latest message; a new message keeps it pinned to the
/// bottom unless the person has scrolled up to read earlier messages.
///
/// The main chat and a Star's thread both use this, so they stay alike.
struct BottomAnchoredScroll<Content: View>: View {
    /// The latest message's id. When it changes the view follows it down.
    let lastID: String?
    @ViewBuilder let content: Content

    /// How close to the end still counts as "reading the latest".
    private static var nearBottomSlack: CGFloat { 48 }
    @State private var isNearBottom = true

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                content
            }
            // Bottom-aligns content shorter than the view and opens a longer
            // one at its end, like Messages.
            .defaultScrollAnchor(.bottom)
            .onScrollGeometryChange(for: Bool.self) { geometry in
                geometry.visibleRect.maxY >= geometry.contentSize.height - Self.nearBottomSlack
            } action: { _, nearBottom in
                isNearBottom = nearBottom
            }
            .onChange(of: lastID) { _, id in
                guard let id, isNearBottom else { return }
                withAnimation { proxy.scrollTo(id, anchor: .bottom) }
            }
        }
    }
}
