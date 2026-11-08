import Testing
@testable import ShelfCore

struct BackoffScheduleTests {
    @Test func doublesFromTwoSecondsAndCapsAtFiveMinutes() {
        let schedule = BackoffSchedule()
        #expect(schedule.delay(afterFailures: 0) == .zero)
        #expect(schedule.delay(afterFailures: 1) == .seconds(2))
        #expect(schedule.delay(afterFailures: 2) == .seconds(4))
        #expect(schedule.delay(afterFailures: 3) == .seconds(8))
        #expect(schedule.delay(afterFailures: 9) == .seconds(300))
        #expect(schedule.delay(afterFailures: 500) == .seconds(300))
    }
}
