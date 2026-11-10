import Foundation

public enum TasteTile: String, Codable, CaseIterable, Sendable {
    case designLanguage, colors, typography, spacing, density, layoutHabits, signatureDetails, avoid
    case motion, shape, voice
}
public enum TasteMotion: String, Codable, CaseIterable, Sendable { case instant, snappy, smooth, playful }
public enum TasteCorners: String, Codable, CaseIterable, Sendable { case sharp, soft, round }
public enum TasteDepth: String, Codable, CaseIterable, Sendable { case shadows, hairlines, flat }
public enum TasteVoiceTone: String, Codable, CaseIterable, Sendable { case plain, warm, formal, playful }

public struct TasteShape: Codable, Sendable, Equatable {
    public var corners: TasteCorners
    public var depth: TasteDepth
    public init(corners: TasteCorners, depth: TasteDepth) { self.corners = corners; self.depth = depth }
    public static let `default` = TasteShape(corners: .soft, depth: .shadows)
}
public struct TasteVoice: Codable, Sendable, Equatable {
    public var tone: TasteVoiceTone
    public var note: String
    public init(tone: TasteVoiceTone, note: String) { self.tone = tone; self.note = note }
    public static let `default` = TasteVoice(tone: .plain, note: "")
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
    public var motion: TasteMotion
    public var shape: TasteShape
    public var voice: TasteVoice

    public init(designLanguage: [String], colors: [TasteColor], typography: TasteTypography, spacing: TasteSpacing,
                density: TasteDensity, layoutHabits: [String], signatureDetails: [String], avoid: [TasteAvoid],
                motion: TasteMotion = .snappy, shape: TasteShape = .default, voice: TasteVoice = .default) {
        self.designLanguage = designLanguage; self.colors = colors; self.typography = typography
        self.spacing = spacing; self.density = density; self.layoutHabits = layoutHabits
        self.signatureDetails = signatureDetails; self.avoid = avoid
        self.motion = motion; self.shape = shape; self.voice = voice
    }

    private enum CodingKeys: String, CodingKey {
        case designLanguage, colors, typography, spacing, density, layoutHabits, signatureDetails, avoid
        case motion, shape, voice
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        designLanguage = try c.decode([String].self, forKey: .designLanguage)
        colors = try c.decode([TasteColor].self, forKey: .colors)
        typography = try c.decode(TasteTypography.self, forKey: .typography)
        spacing = try c.decode(TasteSpacing.self, forKey: .spacing)
        density = try c.decode(TasteDensity.self, forKey: .density)
        layoutHabits = try c.decode([String].self, forKey: .layoutHabits)
        signatureDetails = try c.decode([String].self, forKey: .signatureDetails)
        avoid = try c.decode([TasteAvoid].self, forKey: .avoid)
        motion = try c.decodeIfPresent(TasteMotion.self, forKey: .motion) ?? .snappy
        shape = try c.decodeIfPresent(TasteShape.self, forKey: .shape) ?? .default
        voice = try c.decodeIfPresent(TasteVoice.self, forKey: .voice) ?? .default
    }

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
