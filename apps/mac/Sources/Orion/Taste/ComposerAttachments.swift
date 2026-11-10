import OrionDesignSystem
import ShelfCore
import SwiftUI

/// File and link chips shown above the composer text field.
struct ComposerAttachments: View {
    @Binding var draft: ComposerDraft
    let skipped: [TasteComposeSkipped]

    var body: some View {
        if !draft.files.isEmpty || !draft.urls.isEmpty {
            FlowLayout(spacing: OrionSpacing.xs) {
                ForEach(draft.files, id: \.name) { file in
                    chip(
                        icon: Self.icon(for: file.name),
                        title: file.name,
                        skippedReason: skipped.first { $0.name == file.name }?.reason
                    ) {
                        draft.remove(fileNamed: file.name)
                    }
                }
                ForEach(draft.urls, id: \.self) { url in
                    chip(
                        icon: "link",
                        title: url.host() ?? url.absoluteString,
                        skippedReason: skipped.first { $0.name == (url.host() ?? url.absoluteString) || $0.name == url.absoluteString }?.reason
                    ) {
                        draft.remove(url: url)
                    }
                }
            }
        }
    }

    private func chip(icon: String, title: String, skippedReason: String?, remove: @escaping () -> Void) -> some View {
        let isSkipped = skippedReason != nil
        return HStack(spacing: OrionSpacing.xxs) {
            Image(systemName: icon)
                .font(.caption2)
            Text(title)
                .font(.caption)
                .lineLimit(1)
            Button(action: remove) {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.semibold))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove \(title)")
        }
        .padding(.horizontal, OrionSpacing.sm)
        .padding(.vertical, OrionSpacing.xxs + 2)
        .foregroundStyle(isSkipped ? Color.red.opacity(0.9) : Color.primary)
        .background(
            (isSkipped ? Color.red.opacity(0.12) : Color.primary.opacity(0.06)),
            in: Capsule(style: .continuous)
        )
        .help(skippedReason ?? "")
    }

    private static func icon(for name: String) -> String {
        switch (name as NSString).pathExtension.lowercased() {
        case "pdf": "doc.richtext"
        case "png", "jpg", "jpeg", "webp": "photo"
        case "docx", "txt", "md", "markdown": "doc.text"
        default: "doc"
        }
    }
}
