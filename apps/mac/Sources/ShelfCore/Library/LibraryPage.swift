import Foundation

public struct LibraryPage: Codable, Sendable, Equatable {
    public let items: [LibraryItem]
    public let nextOffset: Int?

    public init(items: [LibraryItem], nextOffset: Int?) {
        self.items = items
        self.nextOffset = nextOffset
    }
}

public struct LibraryCount: Codable, Sendable, Equatable {
    public let count: Int

    public init(count: Int) {
        self.count = count
    }
}
