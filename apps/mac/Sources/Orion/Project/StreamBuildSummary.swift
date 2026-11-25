import OrionAppCore
import OrionDesignSystem
import SwiftUI

struct StreamBuildSummary: View {
    let frame: FrameModel
    let starID: String
    let build: StreamBuild
    @State private var sending = false
    @State private var sentRequest: String?
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.sm) {
            if build.offline {
                Text("The linked Mac is offline. Showing the last saved build status.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let step = build.step { Text(step) }
            if let branch = build.branch { Text(branch).font(.caption.monospaced()) }
            if let approval = build.approval {
                Text(approval.summary)
                HStack(spacing: OrionSpacing.xs) {
                    Button("Approve") { answer(approval, approve: true) }
                    Button("Decline") { answer(approval, approve: false) }
                }
                .disabled(sending || sentRequest == approval.id || build.offline)
            }
            if failed { Text("Could not send that approval. Try again.").font(.caption) }
            if let reply = build.reply, !reply.isEmpty { Text(reply).textSelection(.enabled) }
            let preview = frame.buildPreview.availability(for: starID)
            if preview.canPreview {
                Button(frame.buildPreview.startingStarID == starID ? "Starting Preview…" : "Preview in Canvas") {
                    Task { await frame.previewBuildInCanvas(starID) }
                }
                .disabled(frame.buildPreview.starting)
                Button("Open in Browser") {
                    Task { await frame.openBuildInBrowser(starID) }
                }
                .disabled(frame.buildPreview.starting)
                if let failure = frame.buildPreview.failure, failure.starID == starID {
                    Text(failure.message).font(.caption)
                }
            } else if let reason = preview.reason {
                Text(reason).font(.caption)
            }
            ForEach(build.files) { file in
                HStack {
                    Text(file.path).lineLimit(1)
                    Spacer(minLength: 0)
                    Text("+\(file.added) −\(file.removed)").monospacedDigit()
                }
                .font(.caption)
            }
        }
    }

    private func answer(_ approval: StreamBuild.Approval, approve: Bool) {
        guard !sending else { return }
        sending = true
        failed = false
        Task {
            let ok = await frame.answerBuildApproval(starID: starID, requestID: approval.id, approve: approve)
            sending = false
            if ok { sentRequest = approval.id }
            else { failed = true }
        }
    }
}
