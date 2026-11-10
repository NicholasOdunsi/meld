import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Your taste on two screens: a sign-in and an invoices list, moving the way you chose.
struct TastePreviewOverlay: View {
    let board: TasteBoard
    let close: () -> Void

    private var style: TasteSampleStyle { TasteSampleStyle(board: board) }
    private var summary: String {
        [TasteMotionSpec(board.motion).title, board.density.rawValue.capitalized,
         board.shape.corners.rawValue.capitalized, board.voice.tone.title].joined(separator: " · ")
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.35).ignoresSafeArea().onTapGesture(perform: close)
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                Text("Your taste on a screen").font(.title3.weight(.bold))
                Text(summary).font(.caption).foregroundStyle(.secondary)
                HStack(spacing: OrionSpacing.md) {
                    stage { signIn }
                    stage { invoices }
                }
                HStack {
                    Spacer()
                    Button("Close", action: close)
                        .buttonStyle(OrionButtonStyle(.primary))
                        .keyboardShortcut(.cancelAction)
                }
            }
            .padding(OrionSpacing.lg)
            .frame(width: 640)
            .glassEffect(.regular, in: .rect(cornerRadius: 26, style: .continuous))
        }
    }

    private func stage<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        content()
            .frame(maxWidth: .infinity, minHeight: 300)
            .padding(OrionSpacing.md)
            .background(Color.black.opacity(0.25), in: .rect(cornerRadius: OrionRadius.large, style: .continuous))
    }

    private var signIn: some View {
        VStack(alignment: .leading, spacing: style.rowGap) {
            Text(style.screenTitle)
                .font(.system(size: style.titleSize, weight: style.titleWeight.fontWeight))
                .tracking(style.tracking)
            field
            field
            MotionLoopDemo(spec: TasteMotionSpec(board.motion), toastText: TasteVoiceExamples.successLine(for: board.voice.tone), buttonTitle: "Continue")
        }
        .foregroundStyle(.black)
        .padding(style.padding)
        .background(.white, in: .rect(cornerRadius: style.cornerRadius, style: .continuous))
        .shadow(color: style.depth == .shadows ? .black.opacity(0.35) : .clear, radius: 10, y: 4)
        .overlay {
            if style.depth == .hairlines {
                RoundedRectangle(cornerRadius: style.cornerRadius, style: .continuous).strokeBorder(.black.opacity(0.25), lineWidth: 1)
            }
        }
    }

    private var field: some View {
        RoundedRectangle(cornerRadius: max(style.cornerRadius - 4, 2), style: .continuous)
            .strokeBorder(.black.opacity(0.25), lineWidth: 1)
            .frame(height: 30)
    }

    private var invoices: some View {
        VStack(alignment: .leading, spacing: style.rowGap * 0.6) {
            Text("Invoices")
                .font(.system(size: style.titleSize - 4, weight: style.titleWeight.fontWeight))
                .tracking(style.tracking)
            ForEach([("Invoice #1041", "$982.00"), ("Invoice #1042", "$1,284.50"), ("Invoice #1043", "$64.10")], id: \.0) { row in
                HStack {
                    Text(row.0).font(.caption)
                    Spacer()
                    Text(row.1).font(.caption.weight(.semibold).monospacedDigit())
                }
                Divider()
            }
            Text(TasteVoiceExamples.emptyLine(for: board.voice.tone)).font(.caption2).foregroundStyle(.gray)
        }
        .foregroundStyle(.black)
        .padding(style.padding)
        .background(.white, in: .rect(cornerRadius: style.cornerRadius, style: .continuous))
        .shadow(color: style.depth == .shadows ? .black.opacity(0.35) : .clear, radius: 10, y: 4)
    }
}
