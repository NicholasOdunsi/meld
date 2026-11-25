import Foundation
import Testing
@testable import Orion

@MainActor
struct PreviewEditorTests {
    final class FakeHelper: PreviewEditRunning, @unchecked Sendable {
        var requests: [[String: Any]] = []
        var replies: [Data] = []
        func run(_ request: Data) async -> Data? {
            requests.append((try? JSONSerialization.jsonObject(with: request)) as? [String: Any] ?? [:])
            return replies.isEmpty ? nil : replies.removeFirst()
        }
    }

    private static let fieldsJSON = """
    {"text":{"editable":true,"value":"Hi"},"color":{"editable":true,"value":null},"backgroundColor":{"editable":true,"value":null},
     "fontSize":{"editable":true,"value":null},"fontWeight":{"editable":true,"value":null},"fontFamily":{"editable":true,"value":null},
     "padding":{"editable":true,"value":null},"gap":{"editable":true,"value":null},"borderRadius":{"editable":true,"value":null},
     "width":{"editable":true,"value":null},"height":{"editable":true,"value":null}}
    """

    private func reply(_ json: String) -> Data { Data(json.utf8) }

    private func editor(_ helper: FakeHelper, lock: String? = nil) -> PreviewEditor {
        PreviewEditor(helper: helper, root: { _ in URL(fileURLWithPath: "/tmp/worktree") },
                      lockReason: { _ in lock }, send: { _, _ in true })
    }

    private func picked(_ editor: PreviewEditor, helper: FakeHelper) async {
        helper.replies = [reply("{\"ok\":true,\"fields\":\(Self.fieldsJSON),\"changes\":[]}")]
        editor.toggle("star-1")
        editor.receive(.picked(PreviewPick(
            src: .init(file: "app/page.tsx", line: 4, column: 7), tag: "p", text: "Hi", html: "<p>Hi</p>", computed: [:])))
        await editor.settle()
    }

    @Test func aPickAsksTheHelperToInspectAndShowsTheFields() async {
        let helper = FakeHelper()
        let editor = editor(helper)
        await picked(editor, helper: helper)
        #expect(helper.requests.first?["op"] as? String == "inspect")
        #expect(helper.requests.first?["root"] as? String == "/tmp/worktree")
        #expect(editor.selection?.fields != nil)
        #expect(editor.selection?.reason == nil)
    }

    @Test func anUnresolvedElementShowsTheReasonAndNoFields() async {
        let helper = FakeHelper()
        let editor = editor(helper)
        editor.toggle("star-1")
        editor.receive(.picked(PreviewPick(src: nil, tag: "h1", text: "Good", html: "<h1>Good</h1>", computed: [:])))
        await editor.settle()
        #expect(editor.selection?.fields == nil)
        #expect(editor.selection?.reason == "Orion can't find this element's code. Describe the change instead.")
    }

    @Test func aHelperRefusalOfComputedTextExplainsIt() async {
        let helper = FakeHelper()
        helper.replies = [reply("{\"ok\":false,\"reason\":\"not-found\"}")]
        let editor = editor(helper)
        editor.toggle("star-1")
        editor.receive(.picked(PreviewPick(src: .init(file: "app/page.tsx", line: 4, column: 7), tag: "p", text: "", html: "", computed: [:])))
        await editor.settle()
        #expect(editor.selection?.fields == nil)
        #expect(editor.selection?.reason != nil)
    }

    @Test func aTweakIsAppliedRecordedAndCanBeUndone() async {
        let helper = FakeHelper()
        let editor = editor(helper)
        await picked(editor, helper: helper)
        helper.replies = [reply("{\"ok\":true,\"fields\":\(Self.fieldsJSON),\"changes\":[{\"path\":\"app/page.tsx\",\"before\":\"A\",\"after\":\"B\"}]}"),
                          reply("{\"ok\":true,\"changes\":[{\"path\":\"app/page.tsx\",\"before\":\"B\",\"after\":\"A\"}]}"),
                          reply("{\"ok\":true,\"fields\":\(Self.fieldsJSON),\"changes\":[]}")]
        await editor.handle(.tweak(field: "color", value: "#ff0000", index: nil))
        #expect(helper.requests.last?["op"] as? String == "apply")
        #expect(editor.selection?.canUndo == true)
        await editor.handle(.undo)
        let restore = helper.requests.dropLast().last
        #expect(restore?["op"] as? String == "restore")
        let file = (restore?["files"] as? [[String: Any]])?.first
        #expect(file?["expect"] as? String == "B")
        #expect(file?["contents"] as? String == "A")
        #expect(editor.selection?.canUndo == false)
        #expect(editor.selection?.canRedo == true)
        #expect(helper.requests.last?["op"] as? String == "inspect")
    }

    @Test func editsAreRefusedWhileTheBuildIsRunning() async {
        let helper = FakeHelper()
        let editor = editor(helper, lock: "This Star is still building.")
        await picked(editor, helper: helper)
        let before = helper.requests.count
        await editor.handle(.tweak(field: "color", value: "#ff0000", index: nil))
        #expect(helper.requests.count == before)
        #expect(editor.selection?.locked == "This Star is still building.")
    }

    @Test(arguments: [
        "app/page.tsx", "/tmp/worktree/app/page.tsx", "/tmp/other/app/page.tsx",
    ])
    func describeUsesPathsRelativeToTheWorktree(file: String) async {
        var body: String?
        let editor = PreviewEditor(helper: FakeHelper(), root: { _ in URL(fileURLWithPath: "/tmp/worktree") },
                                   lockReason: { _ in nil }, send: { text, _ in body = text; return true })
        editor.toggle("star-1")
        editor.receive(.picked(PreviewPick(src: .init(file: file, line: 4, column: 7),
                                          tag: "p", text: "Hi", html: "<p>Hi</p>", computed: [:])))
        await editor.settle()
        await editor.handle(.describe("Make it bold"))
        #expect(body?.contains("Element: <p>Hi</p>") == true)
        #expect(body?.contains("Code: app/page.tsx:4") == !file.hasPrefix("/tmp/other"))
        #expect(body?.contains("/tmp/") == false)
    }

    @Test func garbledOrEmptyHelperRepliesAreFailuresNotCrashes() async {
        let helper = FakeHelper()
        let editor = editor(helper)
        await picked(editor, helper: helper)
        helper.replies = [reply("not json"), reply(""), reply("[1,2]")]
        for _ in 0..<3 {
            await editor.handle(.tweak(field: "color", value: "#ff0000", index: nil))
            #expect(editor.selection?.reason != nil)
            #expect(editor.selection?.pending == false)
        }
        #expect(editor.selection?.canUndo == false)
    }

    // MARK: Selection JSON contract (the web panel's strict schema needs present-but-null keys)

    private func snapshotObject(_ editor: PreviewEditor) -> [String: Any]? {
        guard let json = editor.snapshotJSON() else { return nil }
        return (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any]
    }

    @Test func aResolvedSelectionEncodesEveryKeyWithNullsPresent() async throws {
        let helper = FakeHelper()
        let editor = editor(helper)
        await picked(editor, helper: helper)
        let json = try #require(editor.snapshotJSON())
        #expect(json.contains("\"reason\":null"))
        #expect(json.contains("\"locked\":null"))
        #expect(json.contains("\"value\":null"))
        let object = try #require(snapshotObject(editor))
        #expect(Set(object.keys) == ["starId", "selectionId", "label", "tag", "html", "fields", "computed", "reason", "locked",
                                     "canUndo", "canRedo", "pending"])
        let fields = try #require(object["fields"] as? [String: [String: Any]])
        #expect(fields["color"].map { Set($0.keys) } == ["editable", "value"])
    }

    @Test func anUnresolvedSelectionEncodesNullFieldsAndNullLocked() async throws {
        let helper = FakeHelper()
        let editor = editor(helper)
        editor.toggle("star-1")
        editor.receive(.picked(PreviewPick(src: nil, tag: "h1", text: "Good", html: "<h1>Good</h1>", computed: [:])))
        await editor.settle()
        let json = try #require(editor.snapshotJSON())
        #expect(json.contains("\"fields\":null"))
        #expect(json.contains("\"locked\":null"))
        #expect(!json.contains("\"reason\":null"))
    }

    // MARK: Serialised, still-current writes

    /// A helper that holds every request until the test answers it, so ordering is observable.
    final class GatedHelper: PreviewEditRunning, @unchecked Sendable {
        private let lock = NSLock()
        private var log: [[String: Any]] = []
        private var waiting: [CheckedContinuation<Data?, Never>] = []
        var requests: [[String: Any]] { lock.withLock { log } }
        func run(_ request: Data) async -> Data? {
            let object = (try? JSONSerialization.jsonObject(with: request)) as? [String: Any] ?? [:]
            return await withCheckedContinuation { continuation in
                lock.withLock { log.append(object); waiting.append(continuation) }
            }
        }
        func answer(_ json: String) {
            let continuation = lock.withLock { waiting.removeFirst() }
            continuation.resume(returning: Data(json.utf8))
        }
    }

    private func waitFor(_ helper: GatedHelper, requests count: Int) async {
        for _ in 0..<2000 where helper.requests.count < count { try? await Task.sleep(for: .milliseconds(1)) }
        #expect(helper.requests.count >= count)
    }

    private func applyReply(_ before: String, _ after: String, text: String = "Hi") -> String {
        let fields = Self.fieldsJSON.replacingOccurrences(of: "\"value\":\"Hi\"", with: "\"value\":\"\(text)\"")
        return "{\"ok\":true,\"fields\":\(fields),\"changes\":[{\"path\":\"app/page.tsx\",\"before\":\"\(before)\",\"after\":\"\(after)\"}]}"
    }

    private func gatedPick(_ editor: PreviewEditor, helper: GatedHelper, line: Int = 4, tag: String = "p") async {
        editor.toggle("star-1")
        editor.receive(.picked(PreviewPick(
            src: .init(file: "app/page.tsx", line: line, column: 7), tag: tag, text: "Hi", html: "<\(tag)>Hi</\(tag)>", computed: [:])))
        await waitFor(helper, requests: helper.requests.count + 1)
        helper.answer("{\"ok\":true,\"fields\":\(Self.fieldsJSON),\"changes\":[]}")
        await editor.settle()
    }

    private func tweakValues(_ helper: GatedHelper) -> [String?] {
        helper.requests.map { ($0["tweak"] as? [String: Any])?["value"] as? String }
    }

    @Test func twoQuickRetypedMessagesReachTheHelperOneAfterAnother() async {
        let helper = GatedHelper()
        let gated = PreviewEditor(helper: helper, root: { _ in URL(fileURLWithPath: "/tmp/worktree") },
                                  lockReason: { _ in nil }, send: { _, _ in true })
        await gatedPick(gated, helper: helper)
        gated.receive(.retyped(text: "one"))
        gated.receive(.retyped(text: "two"))
        await waitFor(helper, requests: 2)
        try? await Task.sleep(for: .milliseconds(50))
        #expect(helper.requests.count == 2)
        helper.answer(applyReply("A", "B"))
        await waitFor(helper, requests: 3)
        helper.answer(applyReply("B", "C"))
        await gated.settle()
        #expect(tweakValues(helper).compactMap { $0 } == ["one", "two"])
    }

    @Test func aPanelTweakRacingAnOverlayRetypeWaitsForItsTurn() async {
        let helper = GatedHelper()
        let gated = PreviewEditor(helper: helper, root: { _ in URL(fileURLWithPath: "/tmp/worktree") },
                                  lockReason: { _ in nil }, send: { _, _ in true })
        await gatedPick(gated, helper: helper)
        gated.receive(.retyped(text: "one"))
        let panel = Task { await gated.handle(.tweak(field: "color", value: "#ff0000", index: nil)) }
        await waitFor(helper, requests: 2)
        try? await Task.sleep(for: .milliseconds(50))
        #expect(helper.requests.count == 2)
        helper.answer(applyReply("A", "B"))
        await waitFor(helper, requests: 3)
        helper.answer(applyReply("B", "C"))
        await panel.value
        await gated.settle()
        #expect(tweakValues(helper).compactMap { $0 } == ["one", "#ff0000"])
    }

    @Test func aQueuedEditForAnOldPickIsDroppedWhenANewPickArrives() async {
        let helper = GatedHelper()
        let gated = PreviewEditor(helper: helper, root: { _ in URL(fileURLWithPath: "/tmp/worktree") },
                                  lockReason: { _ in nil }, send: { _, _ in true })
        await gatedPick(gated, helper: helper)
        gated.receive(.retyped(text: "first"))
        await waitFor(helper, requests: 2)
        gated.receive(.retyped(text: "second"))
        gated.receive(.picked(PreviewPick(
            src: .init(file: "app/page.tsx", line: 9, column: 3), tag: "h1", text: "Good", html: "<h1>Good</h1>", computed: [:])))
        helper.answer(applyReply("A", "B", text: "Changed"))
        // The in-flight edit finished after the new pick: its fields must not land on the new element.
        await waitFor(helper, requests: 3)
        #expect(gated.selection?.fields?["text"]?.value != "Changed")
        #expect(helper.requests[2]["op"] as? String == "inspect")
        helper.answer("{\"ok\":true,\"fields\":\(Self.fieldsJSON),\"changes\":[]}")
        await gated.settle()
        try? await Task.sleep(for: .milliseconds(50))
        #expect(helper.requests.count == 3)
        #expect(tweakValues(helper).compactMap { $0 } == ["first"])
        #expect(gated.selection?.tag == "h1")
        #expect(gated.selection?.fields?["text"]?.value == "Hi")
    }

    @Test func anUndoRacingATweakKeepsTheNewHistoryEntry() async {
        let helper = GatedHelper()
        let gated = PreviewEditor(helper: helper, root: { _ in URL(fileURLWithPath: "/tmp/worktree") },
                                  lockReason: { _ in nil }, send: { _, _ in true })
        await gatedPick(gated, helper: helper)
        let first = Task { await gated.handle(.tweak(field: "color", value: "#111111", index: nil)) }
        await waitFor(helper, requests: 2)
        helper.answer(applyReply("A", "B"))
        await first.value
        let second = Task { await gated.handle(.tweak(field: "color", value: "#222222", index: nil)) }
        await waitFor(helper, requests: 3)
        let undo = Task { await gated.handle(.undo) }
        try? await Task.sleep(for: .milliseconds(50))
        #expect(helper.requests.count == 3)
        helper.answer(applyReply("B", "C"))
        await second.value
        await waitFor(helper, requests: 4)
        helper.answer("{\"ok\":true,\"changes\":[]}")
        await waitFor(helper, requests: 5)
        helper.answer("{\"ok\":true,\"fields\":\(Self.fieldsJSON),\"changes\":[]}")
        await undo.value
        let file = (helper.requests[3]["files"] as? [[String: Any]])?.first
        #expect(helper.requests[3]["op"] as? String == "restore")
        #expect(file?["expect"] as? String == "C")
        #expect(file?["contents"] as? String == "B")
        #expect(gated.selection?.canUndo == true)
        #expect(gated.selection?.canRedo == true)
    }

    @Test func exchangeAppliesOnlyRequestsForTheCurrentPick() async throws {
        let helper = FakeHelper()
        let editor = editor(helper)
        await picked(editor, helper: helper)
        let selectionID = try #require(editor.selection?.selectionId)
        helper.replies = [reply(applyReply("A", "B"))]
        await editor.exchange { script, _ in
            if script.contains("setSelection") { return true }
            return [
                ["kind": "tweak", "field": "color", "value": "#000000", "selectionId": "old"],
                ["kind": "tweak", "field": "color", "value": "#ff0000", "selectionId": selectionID]
            ]
        }
        await editor.settle()
        #expect(helper.requests.count == 2)
        #expect((helper.requests.last?["tweak"] as? [String: Any])?["value"] as? String == "#ff0000")
    }

    @Test func exchangeSendsOneSnapshotAndClearsItOnStop() async {
        let helper = FakeHelper()
        let editor = editor(helper)
        await picked(editor, helper: helper)
        var pushed: [Any] = []
        for _ in 0..<3 {
            await editor.exchange { script, arguments in
                if script.contains("setSelection"), let json = arguments["json"] {
                    pushed.append(json)
                    return true
                }
                return []
            }
        }
        #expect(pushed.count == 1)
        editor.stop()
        await editor.exchange { script, arguments in
            if script.contains("setSelection"), let json = arguments["json"] {
                pushed.append(json)
                return true
            }
            return []
        }
        #expect(pushed.count == 2)
        #expect(pushed.last is NSNull)
    }
}
