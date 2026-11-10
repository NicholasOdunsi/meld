import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Full-window dim: image on the left, full-height details drawer on the right.
struct InspirationOverlay: View {
    let item: ShelfCore.LibraryItem
    @Bindable var model: InspirationModel
    let frame: FrameModel

    @Environment(\.displayScale) private var displayScale
    @State private var image: CGImage?

    var body: some View {
        ZStack {
            // Dim only — no gesture here; a full-screen tap gesture steals
            // clicks from the panel buttons on macOS.
            Color.black.opacity(0.55)
                .ignoresSafeArea()
                .allowsHitTesting(false)

            HStack(spacing: 0) {
                // Tap empty stage (or the image) to dismiss.
                Color.clear
                    .contentShape(.rect)
                    .onTapGesture { model.closeInspector() }
                    .overlay {
                        imageStage
                            .padding(.horizontal, OrionSpacing.xl)
                            .padding(.vertical, OrionSpacing.lg)
                            .allowsHitTesting(false)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                InspirationPanel(item: item, model: model, frame: frame)
                    .frame(width: 360)
                    .frame(maxHeight: .infinity)
                    .background {
                        Rectangle()
                            .fill(.regularMaterial)
                            .ignoresSafeArea(edges: .top)
                    }
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .ignoresSafeArea(edges: .bottom)
        .focusable()
        .focusEffectDisabled()
        .onKeyPress(.leftArrow) {
            guard !model.isEditingNote else { return .ignored }
            model.move(.left, columns: model.columns)
            return .handled
        }
        .onKeyPress(.rightArrow) {
            guard !model.isEditingNote else { return .ignored }
            model.move(.right, columns: model.columns)
            return .handled
        }
        .onExitCommand { model.closeInspector() }
        .task(id: item.id) {
            image = await model.thumbnails.thumbnail(for: item, maxPixels: Int(1600 * displayScale))
        }
    }

    @ViewBuilder
    private var imageStage: some View {
        if let image {
            Image(decorative: image, scale: displayScale)
                .resizable()
                .scaledToFit()
                .clipShape(.rect(cornerRadius: 16, style: .continuous))
                .shadow(color: .black.opacity(0.35), radius: 28, y: 12)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ProgressView()
                .controlSize(.large)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}
