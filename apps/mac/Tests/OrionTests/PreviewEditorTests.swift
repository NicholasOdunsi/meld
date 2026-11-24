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
                          reply("{\"ok\":true,\"changes\":[{\"path\":\"app/page.tsx\",\"before\":\"B\",\"after\":\"A\"}]}")]
        await editor.handle(.tweak(field: "color", value: "#ff0000", index: nil))
        #expect(helper.requests.last?["op"] as? String == "apply")
        #expect(editor.selection?.canUndo == true)
        await editor.handle(.undo)
        let restore = helper.requests.last
        #expect(restore?["op"] as? String == "restore")
        let file = (restore?["files"] as? [[String: Any]])?.first
        #expect(file?["expect"] as? String == "B")
        #expect(file?["contents"] as? String == "A")
        #expect(editor.selection?.canUndo == false)
        #expect(editor.selection?.canRedo == true)
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
}
