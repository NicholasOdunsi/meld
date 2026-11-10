import AppKit
import SwiftUI
import UniformTypeIdentifiers

/// The rounded "add logo" square at the top of the New Project sheet.
/// Click to choose an image, or drop one on it. Optional.
struct LogoWell: View {
    @Binding var logo: NSImage?

    @State private var isChoosing = false
    @State private var isTargeted = false
    @State private var failed = false

    private let size: CGFloat = 76
    private let radius: CGFloat = 18

    var body: some View {
        VStack(spacing: 8) {
            Button { isChoosing = true } label: {
                well
            }
            .buttonStyle(.plain)
            .pointerStyle(.link)
            .accessibilityLabel(logo == nil ? "Add company logo" : "Change company logo")
            .help(logo == nil ? "Add a company logo (optional)" : "Change the company logo")
            .contextMenu {
                if logo != nil {
                    Button("Remove Logo", role: .destructive) { logo = nil }
                }
            }
            .dropDestination(for: URL.self) { urls, _ in
                guard let url = urls.first else { return false }
                return use(url)
            } isTargeted: { isTargeted = $0 }

            Text(failed ? "That file isn't an image" : (logo == nil ? "Add logo" : "Change logo"))
                .font(.caption)
                .foregroundStyle(failed ? AnyShapeStyle(.red) : AnyShapeStyle(.secondary))
        }
        .padding(.vertical, 4)
        .fileImporter(isPresented: $isChoosing, allowedContentTypes: [.image]) { result in
            if case .success(let url) = result { use(url) }
        }
    }

    @ViewBuilder
    private var well: some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        Group {
            if let logo {
                Image(nsImage: logo)
                    .resizable()
                    .scaledToFill()
            } else {
                Image(systemName: "photo.badge.plus")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.quaternary.opacity(0.5))
            }
        }
        .frame(width: size, height: size)
        .clipShape(shape)
        .overlay {
            if logo == nil || isTargeted {
                shape.strokeBorder(
                    isTargeted ? AnyShapeStyle(.tint) : AnyShapeStyle(.tertiary),
                    style: StrokeStyle(lineWidth: isTargeted ? 2 : 1, dash: logo == nil && !isTargeted ? [4, 3] : [])
                )
            }
        }
        .contentShape(shape)
    }

    @discardableResult
    private func use(_ url: URL) -> Bool {
        if let image = try? ProjectLogoStore.loadImage(from: url) {
            logo = image
            failed = false
            return true
        }
        failed = true
        return false
    }
}
