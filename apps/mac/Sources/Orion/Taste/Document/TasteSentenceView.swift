import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Lays views out left to right and wraps to the next line, with separate gaps for words and lines.
struct WrapLayout: Layout {
    var hSpacing: CGFloat = 7
    var vSpacing: CGFloat = 2

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(proposal.width ?? .infinity, subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(bounds.width, subviews)
        for (index, frame) in result.frames.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY), proposal: .unspecified)
        }
    }

    private func arrange(_ width: CGFloat, _ subviews: Subviews) -> (frames: [CGRect], size: CGSize) {
        var frames: [CGRect] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxX: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + vSpacing
                rowHeight = 0
            }
            frames.append(CGRect(origin: CGPoint(x: x, y: y), size: size))
            rowHeight = max(rowHeight, size.height)
            maxX = max(maxX, x + size.width)
            x += size.width + hSpacing
        }
        return (frames, CGSize(width: maxX, height: y + rowHeight))
    }
}

/// A grey underlined word you can click. It lights up when the pointer is over it.
private struct ChoiceWord: View {
    let text: String
    let isEditable: Bool
    let action: () -> Void
    @State private var isHovering = false

    var body: some View {
        Text(text)
            .fontWeight(.bold)
            .foregroundStyle(isHovering ? Color.white : TasteSentence.choiceGray)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .frame(minHeight: 32)
            .background(isHovering ? Color.white.opacity(0.16) : Color.clear, in: .rect(cornerRadius: 9, style: .continuous))
            .overlay(alignment: .bottom) {
                Rectangle().fill(Color(white: isHovering ? 0.7 : 0.42)).frame(height: 2).padding(.horizontal, 8).offset(y: -4)
            }
            .contentShape(.rect(cornerRadius: 9, style: .continuous))
            .onHover { isHovering = $0 && isEditable }
            .pointerStyle(isEditable ? .link : .default)
            .onTapGesture { if isEditable { action() } }
            .accessibilityAddTraits(.isButton)
            .animation(.easeOut(duration: 0.12), value: isHovering)
    }
}

/// One sentence of the page, word by word, so each choice can have its own hover state.
struct TasteSentenceView: View {
    let segments: [TasteDocSegment]
    let editable: Bool
    let onChoose: (TasteChoiceID) -> Void

    private enum Kind {
        case word(String)
        case choice(TasteChoiceID, String)
        case old(String)
        case new(String)
    }

    private struct Token: Identifiable {
        let id: Int
        let kind: Kind
        var trailing = ""
    }

    private var tokens: [Token] {
        var out: [Token] = []
        func add(_ kind: Kind) { out.append(Token(id: out.count, kind: kind)) }
        for segment in segments {
            switch segment {
            case .text(let text):
                let startsWithSpace = text.first == " "
                let words = text.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
                for (index, word) in words.enumerated() {
                    if index == 0, !startsWithSpace, !out.isEmpty {
                        out[out.count - 1].trailing += word   // punctuation sticks to the word before it
                    } else {
                        add(.word(word))
                    }
                }
            case .choice(let id, let word):
                add(.choice(id, word))
            case .changed(_, let old, let new):
                add(.old(old))
                add(.new(new))
            }
        }
        return out
    }

    var body: some View {
        WrapLayout(hSpacing: 7, vSpacing: 2) {
            ForEach(tokens) { token in
                HStack(spacing: 0) {
                    core(token.kind)
                    if !token.trailing.isEmpty { Text(token.trailing) }
                }
            }
        }
        .font(.system(size: 26, weight: .semibold))
        .tracking(-0.8)
        .foregroundStyle(.primary)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private func core(_ kind: Kind) -> some View {
        switch kind {
        case .word(let word):
            Text(word)
        case .choice(let id, let word):
            ChoiceWord(text: word, isEditable: editable) { onChoose(id) }
        case .old(let word):
            Text(word).strikethrough().foregroundStyle(Color(white: 0.4))
        case .new(let word):
            Text(word)
                .fontWeight(.bold)
                .foregroundStyle(.white)
                .padding(.horizontal, 6)
                .background(Color.white.opacity(0.14), in: .rect(cornerRadius: 9, style: .continuous))
        }
    }
}

/// A quiet pill button with a hover highlight: the cue that something can be clicked.
struct TasteQuietButton: View {
    let title: String
    var systemImage: String?
    let action: () -> Void
    @State private var isHovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let systemImage { Image(systemName: systemImage).font(.callout.weight(.semibold)) }
                Text(title).font(.callout.weight(.semibold))
            }
            .foregroundStyle(isHovering ? Color.white : TasteSentence.choiceGray)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color.white.opacity(isHovering ? 0.16 : 0.07), in: Capsule(style: .continuous))
            .overlay { Capsule(style: .continuous).strokeBorder(Color.white.opacity(isHovering ? 0.3 : 0.14), lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .contentShape(.capsule)
        .onHover { isHovering = $0 }
        .pointerStyle(.link)
        .animation(.easeOut(duration: 0.12), value: isHovering)
    }
}
