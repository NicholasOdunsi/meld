import Foundation
import Observation

struct PreviewSource: Codable, Equatable, Sendable { let file: String; let line: Int; let column: Int; var fuzzy: Bool? = nil }

struct PreviewPick: Decodable, Equatable {
    let src: PreviewSource?
    let tag: String
    let text: String
    let html: String
    let computed: [String: String]
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
    }
    struct FieldState: Codable, Equatable { let editable: Bool; let value: String?; let runs: [String]? }

    private(set) var starID: String?
    private(set) var selection: Selection?
    var isActive: Bool { starID != nil }

    private let helper: any PreviewEditRunning
    private let root: (String) -> URL?
    private let lockReason: (String) -> String?
    private let send: (String, String) async -> Bool
    private var source: PreviewSource?
    private var pick: PreviewPick?
    private var histories: [String: PreviewEditHistory] = [:]
    private var inFlight: Task<Void, Never>?
    private var generation = 0

    init(helper: any PreviewEditRunning,
         root: @escaping (String) -> URL?,
         lockReason: @escaping (String) -> String?,
         send: @escaping (_ body: String, _ starID: String) async -> Bool) {
        self.helper = helper; self.root = root; self.lockReason = lockReason; self.send = send
    }

    func toggle(_ id: String) {
        if starID == id { stop() } else { clearSelection(); starID = id }
    }

    func stop() {
        clearSelection()
        starID = nil
        inFlight?.cancel()
    }

    /// Drops the pick and invalidates any inspect still waiting on the helper.
    private func clearSelection() {
        generation += 1
        selection = nil; source = nil; pick = nil
    }

    func receive(_ message: PreviewMessage) {
        guard let starID else { return }
        switch message {
        case .cleared: clearSelection()
        case .picked(let next):
            generation += 1
            let mine = generation
            pick = next; source = next.src
            inFlight = Task { [weak self] in await self?.inspect(next, starID: starID, generation: mine) }
        case .retyped(let text):
            // Edits queue behind each other so two quick messages never race on the same file.
            let previous = inFlight
            inFlight = Task { [weak self] in
                await previous?.value
                await self?.handle(.tweak(field: "text", value: text, index: nil))
            }
        case .resized(let width, let height):
            let previous = inFlight
            inFlight = Task { [weak self] in
                await previous?.value
                if let width { await self?.handle(.tweak(field: "width", value: String(width), index: nil)) }
                if let height { await self?.handle(.tweak(field: "height", value: String(height), index: nil)) }
            }
        }
    }

    /// Lets tests (and the exchange loop) wait for the work a message started.
    func settle() async { await inFlight?.value }

    func handle(_ request: PreviewRequest) async {
        guard let starID else { return }
        switch request {
        case .close: stop()
        case .undo: await replay(undo: true, starID: starID)
        case .redo: await replay(undo: false, starID: starID)
        case .describe(let text): await describe(text, starID: starID)
        case .tweak(let field, let value, let index): await tweak(field: field, value: value, index: index, starID: starID)
        }
    }

    func snapshotJSON() -> String? {
        guard let selection, let data = try? JSONEncoder().encode(selection) else { return nil }
        return String(data: data, encoding: .utf8)
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
              let data = try? JSONSerialization.data(withJSONObject: object) else { return nil }
        return try? JSONDecoder().decode([String: FieldState].self, from: data)
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
        selection = Selection(starId: starID, label: pick.tag, tag: pick.tag, html: pick.html, fields: fields,
                              computed: pick.computed, reason: reason, locked: lockReason(starID),
                              canUndo: history.canUndo, canRedo: history.canRedo, pending: pending)
    }

    private func inspect(_ pick: PreviewPick, starID: String, generation: Int) async {
        guard let src = pick.src, let root = root(starID) else {
            publish(fields: nil, reason: reasonText(nil), starID: starID); return
        }
        let reply = await call(["op": "inspect", "root": root.path, "src": srcJSON(src)])
        guard generation == self.generation, self.starID == starID else { return }
        if let reply, isOK(reply), let fields = fields(from: reply) {
            publish(fields: fields, reason: nil, starID: starID)
        } else {
            publish(fields: nil, reason: reasonText(reply), starID: starID)
        }
    }

    private func tweak(field: String, value: String, index: Int?, starID: String) async {
        if lockReason(starID) != nil { publish(fields: selection?.fields, reason: selection?.reason, starID: starID); return }
        guard let src = source, let root = root(starID) else { return }
        publish(fields: selection?.fields, reason: nil, starID: starID, pending: true)
        var tweak: [String: Any] = ["field": field, "value": value]
        if let index { tweak["index"] = index }
        let reply = await call(["op": "apply", "root": root.path, "src": srcJSON(src), "tweak": tweak])
        guard let reply, isOK(reply) else {
            publish(fields: selection?.fields, reason: reasonText(reply), starID: starID); return
        }
        // The file changed on disk, so the edit is recorded even if the refreshed fields are unreadable.
        if let changes = changes(from: reply) {
            histories[starID, default: PreviewEditHistory()].record(changes)
        }
        publish(fields: fields(from: reply) ?? selection?.fields, reason: nil, starID: starID)
    }

    private func replay(undo: Bool, starID: String) async {
        if lockReason(starID) != nil { return }
        guard let root = root(starID) else { return }
        var history = histories[starID] ?? PreviewEditHistory()
        guard let changes = undo ? history.nextUndo() : history.nextRedo() else { return }
        let files = changes.map { change in
            ["path": change.path, "expect": undo ? change.after : change.before, "contents": undo ? change.before : change.after]
        }
        let reply = await call(["op": "restore", "root": root.path, "files": files])
        guard isOK(reply) else {
            publish(fields: selection?.fields, reason: reasonText(reply), starID: starID); return
        }
        if undo { history.didUndo() } else { history.didRedo() }
        histories[starID] = history
        publish(fields: selection?.fields, reason: nil, starID: starID)
    }

    private func describe(_ text: String, starID: String) async {
        let request = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !request.isEmpty, let pick else { return }
        var lines = ["Change this element in the app:"]
        if let src = source { lines.append("Code: \(src.file):\(src.line)") }
        lines.append("Element: \(pick.html)")
        let styles = pick.computed.sorted { $0.key < $1.key }.map { "\($0.key) \($0.value)" }.joined(separator: ", ")
        if !styles.isEmpty { lines.append("Styles: \(styles)") }
        lines.append("Request: \(request)")
        _ = await send(String(lines.joined(separator: "\n").prefix(10_000)), starID)
    }
}
