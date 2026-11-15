import Foundation

/// The name Orion shows for a project. The catch-all project made with a new
/// workspace is the Scratch pad; older ones were stored as "Untitled project"
/// (no data migration — they're just shown under the new name).
public enum ProjectName {
    public static let scratchPad = "Scratch pad"
    /// The web app's old default name for a new workspace's first project.
    public static let legacyDefault = "Untitled project"

    /// Whether `name` is the Scratch pad (blank, the legacy default, or already "Scratch pad").
    public static func isScratchPad(_ name: String) -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty
            || trimmed.caseInsensitiveCompare(legacyDefault) == .orderedSame
            || trimmed.caseInsensitiveCompare(scratchPad) == .orderedSame
    }

    /// `name` as shown: "Scratch pad" for a blank or legacy name, else unchanged.
    public static func display(_ name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || trimmed.caseInsensitiveCompare(legacyDefault) == .orderedSame {
            return scratchPad
        }
        return name
    }
}

extension FrameProject {
    /// The name to show anywhere in the app (see `ProjectName.display`).
    public var displayName: String { ProjectName.display(name) }
    public var isScratchPad: Bool { ProjectName.isScratchPad(name) }
}
