import OrionDesignSystem
import ShelfCore
import SwiftUI

struct TasteChapterList: View {
    @Bindable var model: TasteModel
    let board: TasteBoard

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OrionSpacing.lg) {
                ForEach(TasteChapters.all) { chapter in
                    chapterBlock(chapter)
                }
            }
            .padding(.trailing, OrionSpacing.md)
            .padding(.bottom, OrionSpacing.lg)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func chapterBlock(_ chapter: TasteChapter) -> some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            Text(chapter.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
            Text(chapter.blurb)
                .font(.caption)
                .foregroundStyle(.secondary)
            VStack(spacing: 0) {
                ForEach(Array(chapter.rows.enumerated()), id: \.element.id) { index, row in
                    if index > 0 {
                        Divider().opacity(0.35)
                    }
                    rowButton(row)
                }
            }
            .background(.fill.tertiary, in: .rect(cornerRadius: OrionRadius.medium, style: .continuous))
        }
    }

    private func rowButton(_ row: TasteRow) -> some View {
        Button {
            model.open(row.tile)
        } label: {
            HStack(alignment: .center, spacing: OrionSpacing.sm) {
                VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                    Text(row.title)
                        .font(.body.weight(.medium))
                        .foregroundStyle(.primary)
                    Text(row.explanation)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: OrionSpacing.sm)
                Text(TasteChapters.summary(of: row.tile, in: board))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.trailing)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, OrionSpacing.md)
            .padding(.vertical, OrionSpacing.sm)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(!model.store.canEdit)
    }
}
