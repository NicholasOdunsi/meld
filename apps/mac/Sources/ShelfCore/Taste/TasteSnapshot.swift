import Foundation

public struct TasteCard: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let tile: TasteTile
    public let op: String
    public let value: JSONValue
    public let reason: String
    public let evidenceItemIds: [String]
    public init(id: String, tile: TasteTile, op: String, value: JSONValue, reason: String, evidenceItemIds: [String]) {
        self.id = id; self.tile = tile; self.op = op; self.value = value; self.reason = reason; self.evidenceItemIds = evidenceItemIds
    }
}

public struct TasteSnapshot: Codable, Sendable, Equatable {
    public var board: TasteBoard
    public var version: Int
    public var appleRules: Bool
    public var pending: [TasteCard]
    public init(board: TasteBoard, version: Int, appleRules: Bool, pending: [TasteCard]) {
        self.board = board; self.version = version; self.appleRules = appleRules; self.pending = pending
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
public struct TasteAppleRules: Codable, Sendable, Equatable {
    public let enabled: Bool
    public init(enabled: Bool) { self.enabled = enabled }
}
public struct TasteTileReset: Codable, Sendable, Equatable {
    public let tile: TasteTile
    public init(tile: TasteTile) { self.tile = tile }
}
public enum TasteDecision: String, Sendable { case kept, rejected }
