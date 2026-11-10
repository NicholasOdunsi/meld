import Testing
@testable import OrionAppCore

struct WallNavigationTests {
    let columns = [[0, 3], [1, 4], [2]]

    @Test func leftRightFollowNewestFirstOrder() {
        #expect(WallNavigation.next(from: 1, direction: .right, columns: columns) == 2)
        #expect(WallNavigation.next(from: 1, direction: .left, columns: columns) == 0)
        #expect(WallNavigation.next(from: 0, direction: .left, columns: columns) == nil)
        #expect(WallNavigation.next(from: 4, direction: .right, columns: columns) == nil)
    }

    @Test func upDownStayInTheColumn() {
        #expect(WallNavigation.next(from: 0, direction: .down, columns: columns) == 3)
        #expect(WallNavigation.next(from: 3, direction: .up, columns: columns) == 0)
        #expect(WallNavigation.next(from: 2, direction: .down, columns: columns) == nil)
    }
}
