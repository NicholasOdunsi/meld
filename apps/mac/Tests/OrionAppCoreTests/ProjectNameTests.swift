import Testing
@testable import OrionAppCore

struct ProjectNameTests {
    @Test func legacyDefaultShowsAsScratchPad() {
        #expect(ProjectName.display("Untitled project") == "Scratch pad")
        #expect(ProjectName.display("untitled Project ") == "Scratch pad")
    }

    @Test func blankShowsAsScratchPad() {
        #expect(ProjectName.display("") == "Scratch pad")
        #expect(ProjectName.display("   ") == "Scratch pad")
    }

    @Test func realNamesAreUnchanged() {
        #expect(ProjectName.display("Hermord") == "Hermord")
        #expect(ProjectName.display("Untitled projects") == "Untitled projects")
        #expect(!ProjectName.isScratchPad("Hermord"))
    }

    @Test func recognisesTheScratchPad() {
        #expect(ProjectName.isScratchPad("Untitled project"))
        #expect(ProjectName.isScratchPad("Scratch pad"))
        #expect(ProjectName.isScratchPad(""))
    }

    @Test func frameProjectUsesTheDisplayName() {
        let project = FrameProject(id: "p", name: "Untitled project", icon: "folder", color: "orange")
        #expect(project.displayName == "Scratch pad")
        #expect(project.isScratchPad)
    }
}
