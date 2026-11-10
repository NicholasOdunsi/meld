import OrionDesignSystem
import ShelfCore
import SwiftUI

struct VoiceControls: View {
    @Bindable var model: TasteModel
    @State private var note = ""
    private var voice: TasteVoice { model.store.board?.voice ?? .default }

    private func save(tone: TasteVoiceTone? = nil, note: String? = nil) {
        let next = TasteVoice(tone: tone ?? voice.tone, note: String((note ?? voice.note).prefix(80)))
        Task {
            await model.store.save(.voice, to: .object(["tone": .string(next.tone.rawValue), "note": .string(next.note)]))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.md) {
            ForEach(TasteVoiceTone.allCases, id: \.self) { tone in
                Button { save(tone: tone) } label: {
                    VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                        Text(tone.title).font(.subheadline.weight(.semibold))
                        TasteChip(text: TasteVoiceExamples.successLine(for: tone))
                        TasteChip(text: TasteVoiceExamples.emptyLine(for: tone))
                    }
                    .padding(OrionSpacing.sm)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.primary.opacity(0.06), in: .rect(cornerRadius: OrionRadius.medium, style: .continuous))
                    .overlay {
                        if voice.tone == tone {
                            RoundedRectangle(cornerRadius: OrionRadius.medium, style: .continuous)
                                .strokeBorder(OrionColor.dayBreakBlue.color, lineWidth: 2)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
            Text(TasteVoiceExamples.errorsStayPlain).font(.caption).foregroundStyle(.secondary)
            TextField("A note about how it should sound (optional)", text: $note)
                .textFieldStyle(.roundedBorder)
                .onSubmit { save(note: note) }
        }
        .disabled(!model.store.canEdit)
        .onAppear { note = voice.note }
    }
}
