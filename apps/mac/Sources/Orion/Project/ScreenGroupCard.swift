import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// Several screens made together as one card: a stack of small pictures and a
/// one-line summary. Tapping lists them; picking one opens it on the Canvas.
struct ScreenGroupCard: View {
    let screens: [StreamScreen]
    let store: ScreenCardStore
    let open: (StreamScreen) -> Void

    @State private var showsList = false

    private var summary: String {
        let done = screens.filter { $0.state == .built }.count
        let drawing = screens.filter { $0.state == .building }.count
        let failed = screens.filter { $0.state == .failed }.count
        var parts = ["\(done) done"]
        if drawing > 0 { parts.append("\(drawing) still drawing") }
        if failed > 0 { parts.append("\(failed) couldn't build") }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        Button { showsList.toggle() } label: {
            HStack(spacing: OrionSpacing.sm) {
                stack
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(screens.count) screens").fontWeight(.semibold)
                    Text(summary).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
            .padding(OrionSpacing.sm)
            .frame(maxWidth: 360, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(.primary.opacity(0.05)))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(.white.opacity(0.10)))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(screens.count) screens, \(summary)")
        .popover(isPresented: $showsList, arrowEdge: .bottom) { list }
    }

    private var stack: some View {
        HStack(spacing: -10) {
            ForEach(Array(screens.prefix(5))) { screen in
                thumbnail(for: screen)
            }
        }
    }

    private func thumbnail(for screen: StreamScreen) -> some View {
        let shape = RoundedRectangle(cornerRadius: 6, style: .continuous)
        return Group {
            if screen.state == .built, let image = store.image(for: screen) {
                Image(nsImage: image).resizable().scaledToFill()
            } else {
                Rectangle().fill(.white.opacity(0.08))
            }
        }
        .frame(width: 26, height: 44)
        .clipShape(shape)
        .overlay(shape.strokeBorder(.black.opacity(0.35), lineWidth: 2))
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(screens) { screen in
                Button {
                    showsList = false
                    open(screen)
                } label: {
                    HStack(spacing: OrionSpacing.sm) {
                        thumbnail(for: screen)
                        Text(screen.name).lineLimit(1)
                        Spacer(minLength: OrionSpacing.md)
                        Text(statusText(screen)).font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, OrionSpacing.xxs)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(screen.state != .built)
                .accessibilityLabel("Open \(screen.name) on the Canvas")
            }
        }
        .padding(OrionSpacing.sm)
        .frame(minWidth: 240)
    }

    private func statusText(_ screen: StreamScreen) -> String {
        switch screen.state {
        case .built: "Done"
        case .building: "Drawing…"
        case .failed: "Couldn't build"
        }
    }
}
