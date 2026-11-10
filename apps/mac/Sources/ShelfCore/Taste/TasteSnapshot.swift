import Foundation

public struct TasteCardSource: Codable, Sendable, Equatable {
    public let kind: String
    public let name: String
    public let locator: String
    public init(kind: String, name: String, locator: String) {
        self.kind = kind; self.name = name; self.locator = locator
    }
}

public struct TasteCard: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let tile: TasteTile
    public let op: String
    public let value: JSONValue
    public let reason: String
    public let evidenceItemIds: [String]
    public let origin: String?
    public let source: TasteCardSource?
    public init(id: String, tile: TasteTile, op: String, value: JSONValue, reason: String, evidenceItemIds: [String],
                origin: String? = nil, source: TasteCardSource? = nil) {
        self.id = id; self.tile = tile; self.op = op; self.value = value; self.reason = reason
        self.evidenceItemIds = evidenceItemIds; self.origin = origin; self.source = source
    }
}

public struct TasteSnapshot: Codable, Sendable, Equatable {
    public var board: TasteBoard
    public var version: Int
    public var pending: [TasteCard]
    public var composerEnabled: Bool
    public init(board: TasteBoard, version: Int, pending: [TasteCard], composerEnabled: Bool = true) {
        self.board = board; self.version = version
        self.pending = pending; self.composerEnabled = composerEnabled
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        board = try c.decode(TasteBoard.self, forKey: .board)
        version = try c.decode(Int.self, forKey: .version)
        pending = try c.decode([TasteCard].self, forKey: .pending)
        composerEnabled = try c.decodeIfPresent(Bool.self, forKey: .composerEnabled) ?? true
    }
}

public struct TasteComposeFile: Sendable, Equatable {
    public let name: String
    public let mimeType: String
    public let data: Data
    public init(name: String, mimeType: String, data: Data) {
        self.name = name; self.mimeType = mimeType; self.data = data
    }
}

public struct TasteComposeRequest: Sendable, Equatable {
    public var words: String
    public var urls: [URL]
    public var files: [TasteComposeFile]
    public var libraryItemIDs: [UUID]
    public var tile: TasteTile?
    public var replyTo: [String]

    public init(words: String = "", urls: [URL] = [], files: [TasteComposeFile] = [], libraryItemIDs: [UUID] = [],
                tile: TasteTile? = nil, replyTo: [String] = []) {
        self.words = words; self.urls = urls; self.files = files; self.libraryItemIDs = libraryItemIDs
        self.tile = tile; self.replyTo = replyTo
    }

    public var isEmpty: Bool {
        words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && urls.isEmpty && files.isEmpty && libraryItemIDs.isEmpty
    }
}

public struct TasteComposeSkipped: Codable, Sendable, Equatable {
    public let name: String
    public let reason: String
    public init(name: String, reason: String) { self.name = name; self.reason = reason }
}

public struct TasteComposeResponse: Codable, Sendable, Equatable {
    public let cards: [TasteCard]
    public let skipped: [TasteComposeSkipped]
    public init(cards: [TasteCard], skipped: [TasteComposeSkipped]) {
        self.cards = cards; self.skipped = skipped
    }
}

public enum TasteResponse: Sendable, Equatable, Decodable {
    case ready(TasteSnapshot)
    case learning

    private enum CodingKeys: String, CodingKey { case status }

    public init(from decoder: any Decoder) throws {
        let status = try decoder.container(keyedBy: CodingKeys.self).decode(String.self, forKey: .status)
        self = status == "ready" ? .ready(try TasteSnapshot(from: decoder)) : .learning
    }
}

public struct TasteVersion: Codable, Sendable, Equatable {
    public let version: Int
    public init(version: Int) { self.version = version }
}
public struct TasteDecisionResult: Codable, Sendable, Equatable {
    public let status: String
    public init(status: String) { self.status = status }
}
public struct TasteTileReset: Codable, Sendable, Equatable {
    public let tile: TasteTile
    public init(tile: TasteTile) { self.tile = tile }
}
public enum TasteDecision: String, Sendable { case kept, rejected }
