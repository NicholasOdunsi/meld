import Foundation

public enum TasteTile: String, Codable, CaseIterable, Sendable {
    case designLanguage, colors, typography, spacing, density, layoutHabits, signatureDetails, avoid
}
public enum TasteSpacing: String, Codable, CaseIterable, Sendable { case tight, comfortable, generous }
public enum TasteDensity: String, Codable, CaseIterable, Sendable { case airy, light, balanced, compact, dense }
public enum TasteWeight: String, Codable, CaseIterable, Sendable { case light, regular, bold, heavy }
public enum TasteTracking: String, Codable, CaseIterable, Sendable { case loose, normal, tight }
public enum TasteColorRole: String, Codable, CaseIterable, Sendable { case base, surface, text, action, accent }

public struct TasteColor: Codable, Sendable, Equatable {
    public var hex: String
    public var role: TasteColorRole
    public init(hex: String, role: TasteColorRole) { self.hex = hex; self.role = role }
}
public struct TasteTypography: Codable, Sendable, Equatable {
    public var weight: TasteWeight
    public var tracking: TasteTracking
    public var note: String
    public init(weight: TasteWeight, tracking: TasteTracking, note: String) {
        self.weight = weight; self.tracking = tracking; self.note = note
    }
}
public struct TasteAvoid: Codable, Sendable, Equatable {
    public var text: String
    public var source: String
    public init(text: String, source: String) { self.text = text; self.source = source }
}

public struct TasteBoard: Codable, Sendable, Equatable {
    public var designLanguage: [String]
    public var colors: [TasteColor]
    public var typography: TasteTypography
    public var spacing: TasteSpacing
    public var density: TasteDensity
    public var layoutHabits: [String]
    public var signatureDetails: [String]
    public var avoid: [TasteAvoid]

    /// The tile's current value as JSON, in the exact shape the server stores.
    public func value(for tile: TasteTile) -> JSONValue {
        guard let object = asObject, let value = object[tile.rawValue] else { return .null }
        return value
    }

    /// A copy with one tile replaced. Nil when the new value is not a valid tile value.
    public func setting(_ tile: TasteTile, to value: JSONValue) -> TasteBoard? {
        guard var object = asObject else { return nil }
        object[tile.rawValue] = value
        guard let data = try? JSONEncoder().encode(JSONValue.object(object)) else { return nil }
        return try? JSONDecoder().decode(TasteBoard.self, from: data)
    }

    private var asObject: [String: JSONValue]? {
        guard let data = try? JSONEncoder().encode(self),
              case .object(let object)? = try? JSONDecoder().decode(JSONValue.self, from: data) else { return nil }
        return object
    }
}
