import Testing
@testable import Orion

@MainActor
struct ProjectStyleTests {
    @Test func newProjectsGetAColourNobodyUsesYet() {
        #expect(ProjectStyle.nextColor(after: []) == "blue")
        #expect(ProjectStyle.nextColor(after: ["blue", "teal"]) == "purple")
    }

    @Test func coloursGoRoundAgainOnceAllAreTaken() {
        let all = ProjectStyle.colorKeys
        #expect(ProjectStyle.nextColor(after: all) == all[0])
        #expect(ProjectStyle.nextColor(after: all + ["blue"]) == all[1])
    }
}
