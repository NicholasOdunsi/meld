import Foundation
import Observation

struct PreviewSource: Codable, Equatable, Sendable { let file: String; let line: Int; let column: Int; var fuzzy: Bool? = nil }

struct PreviewPick: Decodable, Equatable {
    let src: PreviewSource?
    let tag: String
    let text: String
    let html: String
    let computed: [String: String]
    var elementId: Int? = nil
}

enum PreviewMessage: Equatable {
    case picked(PreviewPick)
    case cleared
    case retyped(text: String)
    case resized(width: Int?, height: Int?)

    /// The overlay posts plain JSON objects ({"type": "picked", ...}).
    init?(body: Any) {
        guard let object = body as? [String: Any], let type = object["type"] as? String else { return nil }
        switch type {
        case "picked":
            guard JSONSerialization.isValidJSONObject(object),
                  let data = try? JSONSerialization.data(withJSONObject: object),
                  let pick = try? JSONDecoder().decode(PreviewPick.self, from: data) else { return nil }
            self = .picked(pick)
        case "cleared": self = .cleared
        case "retyped": self = .retyped(text: String((object["text"] as? String ?? "").prefix(2000)))
        case "resized":
            self = .resized(width: object["width"] as? Int, height: object["height"] as? Int)
        default: return nil
        }
    }
}

/// What the web panel sends back (read from window.__orionPreviewEdit.take()).
enum PreviewRequest: Equatable {
    case tweak(field: String, value: String, index: Int?)
    case undo
    case redo
    case describe(String)
    case close

    init?(json: [String: Any]) {
        switch json["kind"] as? String {
        case "tweak":
            guard let field = json["field"] as? String, let value = json["value"] as? String else { return nil }
            self = .tweak(field: field, value: value, index: json["index"] as? Int)
        case "undo": self = .undo
        case "redo": self = .redo
        case "describe":
            guard let text = json["text"] as? String else { return nil }
            self = .describe(text)
        case "close": self = .close
        default: return nil
        }
    }
}

@MainActor
@Observable
final class PreviewEditor {
    /// What the web panel renders. Encoded to JSON and pushed into the board.
    struct Selection: Codable, Equatable {
        var starId: String
        var selectionId: String
        var label: String
        var tag: String
        var html: String
        var fields: [String: FieldState]?
        var computed: [String: String]
        var reason: String?
        var locked: String?
        var canUndo: Bool
        var canRedo: Bool
        var pending: Bool

        private enum CodingKeys: String, CodingKey {
            case starId, selectionId, label, tag, html, fields, computed, reason, locked, canUndo, canRedo, pending
        }

        /// The web panel's strict schema wants `fields`, `reason` and `locked` present (null when empty);
        /// synthesized Codable would leave a nil optional out.
        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(starId, forKey: .starId)
            try container.encode(selectionId, forKey: .selectionId)
            try container.encode(label, forKey: .label)
            try container.encode(tag, forKey: .tag)
            try container.encode(html, forKey: .html)
            try container.encode(fields, forKey: .fields)
            try container.encode(computed, forKey: .computed)
            try container.encode(reason, forKey: .reason)
            try container.encode(locked, forKey: .locked)
            try container.encode(canUndo, forKey: .canUndo)
            try container.encode(canRedo, forKey: .canRedo)
            try container.encode(pending, forKey: .pending)
        }
    }
    struct FieldState: Codable, Equatable {
        let editable: Bool
        let value: String?
        let runs: [String]?

        private enum CodingKeys: String, CodingKey { case editable, value, runs }

        /// `value` is present-but-nullable on the web side; `runs` is nullish, so it is left out when nil.
        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(editable, forKey: .editable)
            try container.encode(value, forKey: .value)
            try container.encodeIfPresent(runs, forKey: .runs)
        }
    }

    private(set) var starID: String?
    private(set) var selection: Selection?
    var needsBoardExchange: Bool { starID != nil || lastPushed != .some(nil) }

    private let helper: any PreviewEditRunning
    private let root: (String) -> URL?
    private let lockReason: (String) -> String?
    private let send: @MainActor (String, String) async -> Bool
    private var source: PreviewSource?
    private var pick: PreviewPick?
    private var selectionID = UUID().uuidString
    private var lastPushed: String??
    @ObservationIgnored private var boardRequestBatch: Task<Void, Never>?
    private var histories: [String: PreviewEditHistory] = [:]
    /// Every helper call (inspect, apply, restore) takes its turn on this one chain, so they never overlap.
    private var writeTail: Task<Void, Never>?
    private var generation = 0

    init(helper: any PreviewEditRunning,
         root: @escaping (String) -> URL?,
         lockReason: @escaping (String) -> String?,
         send: @escaping @MainActor (_ body: String, _ starID: String) async -> Bool) {
        self.helper = helper; self.root = root; self.lockReason = lockReason; self.send = send
    }

    func toggle(_ id: String) {
        if starID == id { stop() } else { clearSelection(); starID = id }
    }

    func stop() {
        clearSelection()
        starID = nil
    }

    /// Drops the pick and invalidates every queued or in-flight operation for it.
    private func clearSelection() {
        generation += 1
        selection = nil; source = nil; pick = nil
        selectionID = UUID().uuidString
    }

    /// Runs `work` after everything queued before it. Callers capture what the work needs when they
    /// enqueue, so it never depends on what is selected by the time its turn comes.
    @discardableResult
    private func enqueue(_ work: @escaping @MainActor () async -> Void) -> Task<Void, Never> {
        let previous = writeTail
        let task = Task { @MainActor in
            await previous?.value
            await work()
        }
        writeTail = task
        return task
    }

    /// True while `starID` is still the edited Star and nothing was picked, cleared or closed since `generation`.
    private func isCurrent(_ starID: String, _ generation: Int) -> Bool {
        self.starID == starID && self.generation == generation
    }

    func receive(_ message: PreviewMessage) {
        guard let starID else { return }
        let generation = self.generation
        switch message {
        case .cleared: clearSelection()
        case .picked(let next):
            if next.elementId == nil || next.elementId != pick?.elementId {
                clearSelection()
            } else if next == pick {
                return
            } else if next.src != source {
                // The same DOM element survived a recompilation but its source moved.
                // Invalidate operations already queued against the previous location.
                self.generation += 1
            }
            let mine = self.generation
            pick = next; source = next.src
            enqueue { [weak self] in await self?.inspect(next, starID: starID, generation: mine) }
        case .retyped(let text):
            guard let src = source else { return }
            enqueue { [weak self] in
                await self?.performTweak(field: "text", value: text, index: nil, starID: starID, source: src, generation: generation)
            }
        case .resized(let width, let height):
            guard let src = source else { return }
            enqueue { [weak self] in
                if let width {
                    await self?.performTweak(field: "width", value: String(width), index: nil, starID: starID, source: src, generation: generation)
                }
                if let height {
                    await self?.performTweak(field: "height", value: String(height), index: nil, starID: starID, source: src, generation: generation)
                }
            }
        }
    }

    /// Lets tests (and the exchange loop) wait for the work queued so far.
    func settle() async {
        await boardRequestBatch?.value
        await writeTail?.value
    }

    func handle(_ request: PreviewRequest) async {
        guard let starID else { return }
        let generation = self.generation
        switch request {
        case .close: stop()
        case .undo, .redo:
            let undo = request == .undo
            await enqueue { [weak self] in await self?.replay(undo: undo, starID: starID) }.value
        case .describe(let text):
            await enqueue { [weak self] in
                guard let self, self.isCurrent(starID, generation), self.lockReason(starID) == nil else { return }
                await self.describe(text, starID: starID)
            }.value
        case .tweak(let field, let value, let index):
            guard let src = source else { return }
            await enqueue { [weak self] in
                await self?.performTweak(field: field, value: value, index: index, starID: starID, source: src, generation: generation)
            }.value
        }
    }

    func snapshotJSON() -> String? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        guard let selection, let data = try? encoder.encode(selection) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func resetBoardExchange() { lastPushed = nil }

    /// Synchronize with the current board mount. Each request is bound to the pick the panel displayed.
    func exchange(_ evaluate: (_ script: String, _ arguments: [String: Any]) async -> Any?) async {
        if let starID, let current = selection {
            let reason = lockReason(starID)
            if current.locked != reason { selection?.locked = reason }
        }
        let json = snapshotJSON()
        if lastPushed != .some(json) {
            let sent = await evaluate(
                """
                const bridge = window.__orionPreviewEdit;
                if (!bridge) return false;
                bridge.setSelection(json);
                return true;
                """,
                ["json": json.map { $0 as Any } ?? NSNull()]
            )
            guard !Task.isCancelled, sent as? Bool == true else { return }
            lastPushed = .some(json)
        }
        // Keep polling while a request is running so the board can display its pending state.
        guard boardRequestBatch == nil else { return }
        guard let requests = await evaluate("return window.__orionPreviewEdit?.take()", [:]) as? [[String: Any]] else {
            lastPushed = nil
            return
        }
        guard !Task.isCancelled, !requests.isEmpty else { return }
        boardRequestBatch = Task { [weak self] in
            guard let self else { return }
            defer { self.boardRequestBatch = nil }
            for object in requests {
                if let selection = self.selection, object["selectionId"] as? String == selection.selectionId,
                   let request = PreviewRequest(json: object) {
                    await self.handle(request)
                }
            }
        }
    }

    // MARK: Helper calls

    /// Nil when the helper failed, said nothing, or said something that is not a JSON object.
    private func call(_ object: [String: Any]) async -> [String: Any]? {
        guard JSONSerialization.isValidJSONObject(object),
              let request = try? JSONSerialization.data(withJSONObject: object),
              let data = await helper.run(request), !data.isEmpty else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private func isOK(_ reply: [String: Any]?) -> Bool {
        reply?["ok"] as? Bool == true
    }

    private func srcJSON(_ source: PreviewSource) -> [String: Any] {
        var json: [String: Any] = ["file": source.file, "line": source.line, "column": source.column]
        if let fuzzy = source.fuzzy { json["fuzzy"] = fuzzy }
        return json
    }

    private func fields(from reply: [String: Any]) -> [String: FieldState]? {
        guard let object = reply["fields"], JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object),
              let fields = try? JSONDecoder().decode([String: FieldState].self, from: data) else { return nil }
        return fields.mapValues { field in
            // Keep the rest of the inspector available for a literal too large for an input.
            guard (field.value?.utf16.count ?? 0) <= 2_000, (field.runs?.count ?? 0) <= 8,
                  field.runs?.allSatisfy({ $0.utf16.count <= 2_000 }) ?? true else {
                return FieldState(editable: false, value: nil, runs: nil)
            }
            return field
        }
    }

    private func changes(from reply: [String: Any]) -> [PreviewEditChange]? {
        guard let raw = reply["changes"], JSONSerialization.isValidJSONObject(raw),
              let data = try? JSONSerialization.data(withJSONObject: raw) else { return nil }
        return try? JSONDecoder().decode([PreviewEditChange].self, from: data)
    }

    private func reasonText(_ reply: [String: Any]?) -> String {
        switch reply?["reason"] as? String {
        case "conflict": "The file changed since. Pick the element again."
        case "too-large": "This file is too large to edit directly. Describe the change instead."
        case "not-literal": "This value comes from code, so Orion can't change it directly. Describe the change instead."
        default: "Orion can't find this element's code. Describe the change instead."
        }
    }

    private func publish(fields: [String: FieldState]?, reason: String?, starID: String, pending: Bool = false) {
        guard let pick else { return }
        let history = histories[starID] ?? PreviewEditHistory()
        selection = Selection(starId: starID, selectionId: selectionID, label: pick.tag, tag: pick.tag, html: pick.html, fields: fields,
                              computed: pick.computed, reason: reason, locked: lockReason(starID),
                              canUndo: history.canUndo, canRedo: history.canRedo, pending: pending)
    }

    private func inspect(_ pick: PreviewPick, starID: String, generation: Int) async {
        guard isCurrent(starID, generation) else { return }
        guard let src = pick.src, let root = root(starID) else {
            publish(fields: nil, reason: reasonText(nil), starID: starID); return
        }
        let reply = await call(["op": "inspect", "root": root.path, "src": srcJSON(src)])
        guard isCurrent(starID, generation) else { return }
        if let reply, isOK(reply), let fields = fields(from: reply) {
            publish(fields: fields, reason: nil, starID: starID)
        } else {
            publish(fields: nil, reason: reasonText(reply), starID: starID)
        }
    }

    /// One queued edit. `source`, `starID` and `generation` are what was selected when the edit was requested;
    /// if the selection moved on before this turn, the edit is dropped without touching the helper.
    private func performTweak(field: String, value: String, index: Int?, starID: String,
                              source: PreviewSource, generation: Int) async {
        guard isCurrent(starID, generation) else { return }
        if lockReason(starID) != nil { publish(fields: selection?.fields, reason: selection?.reason, starID: starID); return }
        guard let root = root(starID) else { return }
        publish(fields: selection?.fields, reason: nil, starID: starID, pending: true)
        var tweak: [String: Any] = ["field": field, "value": value]
        if let index { tweak["index"] = index }
        let reply = await call(["op": "apply", "root": root.path, "src": srcJSON(source), "tweak": tweak])
        guard let reply, isOK(reply) else {
            if isCurrent(starID, generation) {
                publish(fields: selection?.fields, reason: reasonText(reply), starID: starID)
            }
            return
        }
        // The file changed on disk, so the edit is recorded even if the selection has moved on
        // or the refreshed fields are unreadable.
        if let changes = changes(from: reply) {
            histories[starID, default: PreviewEditHistory()].record(changes)
        }
        guard isCurrent(starID, generation) else { return }
        publish(fields: fields(from: reply) ?? selection?.fields, reason: nil, starID: starID)
    }

    /// Undo/redo act on the Star's history, not on one element, so they only need the Star to still be edited.
    private func replay(undo: Bool, starID: String) async {
        guard self.starID == starID, lockReason(starID) == nil, let root = root(starID) else { return }
        let history = histories[starID] ?? PreviewEditHistory()
        guard let changes = undo ? history.nextUndo() : history.nextRedo() else { return }
        publish(fields: selection?.fields, reason: nil, starID: starID, pending: true)
        let files = changes.map { change in
            ["path": change.path, "expect": undo ? change.after : change.before, "contents": undo ? change.before : change.after]
        }
        let reply = await call(["op": "restore", "root": root.path, "files": files])
        guard isOK(reply) else {
            if self.starID == starID { publish(fields: selection?.fields, reason: reasonText(reply), starID: starID) }
            return
        }
        // Writes are serialised, so the stacks are as we read them; mutate in place after the await.
        if undo { histories[starID, default: PreviewEditHistory()].didUndo() }
        else { histories[starID, default: PreviewEditHistory()].didRedo() }
        if self.starID == starID, let pick {
            await inspect(pick, starID: starID, generation: generation)
        }
    }

    private func describe(_ text: String, starID: String) async {
        let request = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !request.isEmpty, let pick else { return }
        var lines = ["Change this element in the app:"]
        if let src = source, let directory = root(starID) {
            let base = directory.resolvingSymlinksInPath().standardizedFileURL.path + "/"
            let file = src.file.hasPrefix("/") ? URL(fileURLWithPath: src.file) : directory.appending(path: src.file)
            let path = file.resolvingSymlinksInPath().standardizedFileURL.path
            if path.hasPrefix(base) {
                lines.append("Code: \(path.dropFirst(base.count)):\(src.line)")
            }
        }
        lines.append("Element: \(pick.html)")
        let styles = pick.computed.sorted { $0.key < $1.key }.map { "\($0.key) \($0.value)" }.joined(separator: ", ")
        if !styles.isEmpty { lines.append("Styles: \(styles)") }
        lines.append("Request: \(request)")
        let generation = self.generation
        publish(fields: selection?.fields, reason: nil, starID: starID, pending: true)
        if await send(String(lines.joined(separator: "\n").prefix(10_000)), starID),
           isCurrent(starID, generation) {
            stop()
        } else if isCurrent(starID, generation) {
            publish(fields: selection?.fields, reason: "Orion couldn't send this build request.", starID: starID)
        }
    }
}
