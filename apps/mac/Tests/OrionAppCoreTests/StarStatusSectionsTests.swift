import Foundation
import Testing
@testable import OrionAppCore

struct StarStatusSectionsTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func star(_ id: String, _ status: StreamStar.Status, ageSeconds: Double = 0) -> StreamStar {
        StreamStar(id: id, sourceMessageID: "m-\(id)", title: id, status: status, constellation: nil,
                   createdAt: now.addingTimeInterval(-ageSeconds), followupMessageIDs: [])
    }

    @Test func hidesEmptySections() {
        let sections = StarStatusSections.make(from: [star("a", .working), star("b", .done)])
        #expect(sections.map(\.status) == [.working, .done])
        #expect(StarStatusSections.make(from: []).isEmpty)
    }

    @Test func ordersSectionsNeedsYouStuckWorkingDone() {
        let sections = StarStatusSections.make(from: [
            star("d", .done), star("w", .working), star("s", .stuck), star("n", .needs_you),
        ])
        #expect(sections.map(\.status) == [.needs_you, .stuck, .working, .done])
    }

    @Test func countsStarsPerSection() {
        let sections = StarStatusSections.make(from: [
            star("a", .working), star("b", .working), star("c", .done),
        ])
        #expect(sections.map(\.count) == [2, 1])
    }

    @Test func sortsNewestFirstWithStableTies() {
        let sections = StarStatusSections.make(from: [
            star("old", .working, ageSeconds: 3600),
            star("new", .working, ageSeconds: 10),
            star("b-tie", .working, ageSeconds: 600),
            star("a-tie", .working, ageSeconds: 600),
        ])
        #expect(sections[0].stars.map(\.id) == ["new", "a-tie", "b-tie", "old"])
    }

    @Test func formatsShortAgeAtBoundaries() {
        func age(_ seconds: Double) -> String {
            StarStatusSections.shortAge(from: now.addingTimeInterval(-seconds), now: now)
        }
        #expect(age(0) == "now")
        #expect(age(59) == "now")
        #expect(age(60) == "1m")
        #expect(age(11 * 60) == "11m")
        #expect(age(3599) == "59m")
        #expect(age(3600) == "1h")
        #expect(age(2 * 3600 + 5) == "2h")
        #expect(age(86_399) == "23h")
        #expect(age(86_400) == "1d")
        #expect(age(3 * 86_400) == "3d")
        #expect(age(-120) == "now")
    }
}
