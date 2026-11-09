import Testing
@testable import Orion

struct OverviewGreetingTests {
    @Test func quoteIsTheLearningLine() {
        #expect(OverviewGreeting.quote == "Many things moving. One thing in your hands.")
        #expect(!OverviewGreeting.attribution.isEmpty)
    }
}

struct OverviewHatGreetingTests {
    @Test(arguments: [(6, "Morning"), (11, "Morning"), (12, "Afternoon"), (17, "Evening"), (23, "Hello"), (3, "Hello")])
    func salutationFollowsTheTimeOfDay(hour: Int, word: String) {
        #expect(OverviewGreeting.salutation(hour: hour, firstName: "Nicholas") == "\(word), Nicholas.")
    }

    @Test func salutationWithoutANameStillReads() {
        #expect(OverviewGreeting.salutation(hour: 8, firstName: nil) == "Morning.")
    }

    @Test func firstNameComesFromTheFullName() {
        #expect(OverviewGreeting.firstName(from: "Nicholas Odunsi") == "Nicholas")
        #expect(OverviewGreeting.firstName(from: "Odunsi Nicholas") == "Nicholas")
        #expect(OverviewGreeting.firstName(from: "  ") == nil)
    }

    @Test func summaryWithNothingGoingOn() {
        #expect(OverviewGreeting.summary(todo: 0, inProgress: 0, completed: 0)
            == "Nothing on your plate yet. Write what you want done below.")
    }

    @Test func summaryCountsEachList() {
        #expect(OverviewGreeting.summary(todo: 4, inProgress: 1, completed: 2)
            == "2 things are done, 1 is still going, and 4 are waiting on your list.")
        #expect(OverviewGreeting.summary(todo: 1, inProgress: 0, completed: 0)
            == "1 thing is waiting on your list.")
        #expect(OverviewGreeting.summary(todo: 0, inProgress: 3, completed: 1)
            == "1 thing is done and 3 are still going.")
    }
}
