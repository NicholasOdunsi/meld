import OrionAppCore
import OrionDesignSystem
import SwiftUI

struct ChatComposer: View {
    @Bindable var frame: FrameModel
    @State private var text = ""
    @State private var sending = false
    @State private var notices = ComposerNoticeCenter()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var snapshot: StreamSnapshot? { frame.visibleStream }
    private var choice: StreamModelChoice? {
        guard let snapshot else { return nil }
        let selected = frame.modelByProject[snapshot.projectID] ?? snapshot.defaultProvider
        return snapshot.choices.first(where: { $0.provider == selected }) ?? snapshot.choices.first
    }

    private var modelLabel: String {
        guard let snapshot, let choice else { return "Model" }
        let model = frame.selectedModelByProject[snapshot.projectID] ?? choice.defaultModel
        return model.map { "\(choice.provider.capitalized) · \($0)" } ?? choice.provider.capitalized
    }

    var body: some View {
        VStack(spacing: OrionSpacing.xs) {
            if let notice = notices.current {
                ComposerStatusPill(notice: notice) { notices.dismiss() }
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
            }
            VStack(alignment: .leading, spacing: OrionSpacing.sm) {
                TextField("Message \(frame.currentProject?.name ?? "project")…", text: $text, axis: .vertical)
                    .lineLimit(2...8)
                    .textFieldStyle(.plain)
                    .onSubmit { Task { await send() } }
                HStack {
                    if let snapshot {
                        Menu {
                            ForEach(snapshot.choices) { option in
                                if option.models.isEmpty {
                                    Button(option.provider.capitalized) {
                                        frame.modelByProject[snapshot.projectID] = option.provider
                                        frame.selectedModelByProject[snapshot.projectID] = ""
                                    }
                                } else {
                                    Menu(option.provider.capitalized) {
                                        ForEach(option.models, id: \.self) { model in
                                            Button(model) {
                                                frame.modelByProject[snapshot.projectID] = option.provider
                                                frame.selectedModelByProject[snapshot.projectID] = model
                                            }
                                        }
                                    }
                                }
                            }
                        } label: {
                            Label(modelLabel, systemImage: "chevron.down")
                        }
                        .menuStyle(.borderlessButton)
                        .fixedSize()
                    }
                    Spacer()
                    if snapshot?.orionBusy == true { ProgressView().controlSize(.small).help("Orion is working") }
                    Button { Task { await send() } } label: {
                        Image(systemName: "arrow.up").fontWeight(.semibold)
                            .frame(width: 30, height: 30)
                    }
                    .buttonStyle(.plain)
                    .background(.white, in: Circle())
                    .foregroundStyle(.black)
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || sending)
                    .accessibilityLabel("Send message")
                }
            }
            .padding(OrionSpacing.md)
            .iceGlass(cornerRadius: ComposerMetrics.cornerRadius)
            .foregroundStyle(.white)
        }
        .frame(maxWidth: 560)
        .padding(.horizontal, OrionSpacing.lg)
        .padding(.bottom, OrionSpacing.lg)
        .animation(reduceMotion ? .easeInOut(duration: 0.2) : .smooth(duration: 0.28), value: notices.current?.id)
        .task(id: notices.current?.id) {
            guard let notice = notices.current, let lifetime = notice.lifetime else { return }
            do { try await Task.sleep(for: lifetime) } catch { return }
            notices.dismiss(id: notice.id)
        }
    }

    private func send() async {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, !sending else { return }
        guard let snapshot else { return }
        guard snapshot.canSend else {
            notices.show(snapshot.blockedReason ?? "Orion can't answer right now.", kind: .error)
            return
        }
        sending = true
        notices.dismiss()
        let success = await frame.sendStream(body, provider: choice?.provider, model: frame.selectedModelByProject[snapshot.projectID] ?? choice?.defaultModel)
        sending = false
        if success { text = "" }
        else { notices.show(frame.errorMessage ?? "Orion couldn't send that right now.", kind: .error); frame.errorMessage = nil }
    }
}
