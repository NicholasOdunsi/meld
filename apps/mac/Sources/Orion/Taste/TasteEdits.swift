import ShelfCore

enum TasteEdits {
    static func palette(setting role: TasteColorRole, to hex: String, in colors: [TasteColor]) -> JSONValue {
        var next = colors
        if let index = next.firstIndex(where: { $0.role == role }) {
            next[index].hex = hex
        } else if next.count < 6 {
            next.append(TasteColor(hex: hex, role: role))
        }
        return .array(next.map { .object(["hex": .string($0.hex), "role": .string($0.role.rawValue)]) })
    }

    static func adding(_ text: String, to items: [String], limit: Int, maxLength: Int) -> [String]? {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "\n", with: " ")
        guard !clean.isEmpty, clean.count <= maxLength, items.count < limit,
              !items.contains(where: { $0.caseInsensitiveCompare(clean) == .orderedSame }) else { return nil }
        return items + [clean]
    }

    static func removing(_ text: String, from items: [String]) -> [String] { items.filter { $0 != text } }

    static func jsonStrings(_ items: [String]) -> JSONValue { .array(items.map { .string($0) }) }

    static func typography(_ value: TasteTypography, weight: TasteWeight?, tracking: TasteTracking?) -> JSONValue {
        .object([
            "weight": .string((weight ?? value.weight).rawValue),
            "tracking": .string((tracking ?? value.tracking).rawValue),
            "note": .string(value.note),
        ])
    }

    static func avoidJSON(_ items: [TasteAvoid]) -> JSONValue {
        .array(items.map { .object(["text": .string($0.text), "source": .string($0.source)]) })
    }

    static func colorsJSON(_ colors: [TasteColor]) -> JSONValue {
        .array(colors.map { .object(["hex": .string($0.hex), "role": .string($0.role.rawValue)]) })
    }
}
