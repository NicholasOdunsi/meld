import OrionAppCore
import OrionDesignSystem
import SwiftUI
import UniformTypeIdentifiers

private struct StagedChatFile: Identifiable {
    let id: String
    let name: String
}

struct ChatComposer: View {
    @Bindable var frame: FrameModel
    @State private var text = ""
    @State private var sending = false
    @State private var isImporting = false
    @State private var staging = false
    @State private var attachments: [StagedChatFile] = []
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
                ForEach(attachments) { file in
                    HStack(spacing: OrionSpacing.xs) {
                        Image(systemName: "paperclip")
                        Text(file.name).lineLimit(1)
                        Button("Remove \(file.name)", systemImage: "xmark") {
                            attachments.removeAll { $0.id == file.id }
                            Task { await frame.discardStreamAttachment(file.id) }
                        }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.plain)
                    }
                    .font(.caption)
                }
                TextField("Message \(frame.currentProject?.name ?? "project")…", text: $text, axis: .vertical)
                    .lineLimit(2...8)
                    .textFieldStyle(.plain)
                    .onSubmit { Task { await send() } }
                HStack {
                    Button("Attach a file", systemImage: "plus") { isImporting = true }
                        .labelStyle(.iconOnly)
                        .font(.system(size: 14, weight: .light))
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color.white.opacity(0.14)))
                        .overlay { Circle().strokeBorder(Color.white.opacity(0.3), lineWidth: 1) }
                        .buttonStyle(.plain)
                        .help("Attach files")
                    Spacer()
                    if staging { ProgressView().controlSize(.small).help("Adding files") }
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
                    if snapshot?.orionBusy == true { ProgressView().controlSize(.small).help("Orion is working") }
                    Button { Task { await send() } } label: {
                        Image(systemName: "arrow.up").fontWeight(.semibold)
                            .frame(width: 30, height: 30)
                    }
                    .buttonStyle(.plain)
                    .background(.white, in: Circle())
                    .foregroundStyle(.black)
                    .disabled((text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && attachments.isEmpty) || sending || staging)
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
        .fileImporter(isPresented: $isImporting, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            Task { await stage(urls) }
        }
        .task(id: notices.current?.id) {
            guard let notice = notices.current, let lifetime = notice.lifetime else { return }
            do { try await Task.sleep(for: lifetime) } catch { return }
            notices.dismiss(id: notice.id)
        }
    }

    private func stage(_ urls: [URL]) async {
        guard attachments.count + urls.count <= 10 else {
            notices.show("You can add up to 10 files.", kind: .error)
            return
        }
        staging = true
        defer { staging = false }
        for url in urls {
            if let id = await frame.stageStreamAttachment(url) {
                attachments.append(StagedChatFile(id: id, name: url.lastPathComponent))
            } else {
                notices.show(frame.errorMessage ?? "Could not add that file.", kind: .error)
                frame.errorMessage = nil
            }
        }
    }

    private func send() async {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty || !attachments.isEmpty, !sending else { return }
        guard let snapshot else { return }
        guard snapshot.canSend else {
            notices.show(snapshot.blockedReason ?? "Orion can't answer right now.", kind: .error)
            return
        }
        sending = true
        notices.dismiss()
        let success = await frame.sendStream(body, provider: choice?.provider,
                                             model: frame.selectedModelByProject[snapshot.projectID] ?? choice?.defaultModel,
                                             attachmentIDs: attachments.map(\.id))
        sending = false
        if success { text = ""; attachments = [] }
        else { notices.show(frame.errorMessage ?? "Orion couldn't send that right now.", kind: .error); frame.errorMessage = nil }
    }
}
