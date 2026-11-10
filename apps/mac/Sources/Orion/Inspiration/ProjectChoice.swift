import Foundation
import OrionAppCore
import ShelfCore

/// One selectable project, backed by the room we'll attach images to.
struct ProjectChoice: Identifiable, Hashable {
    let name: String
    let room: ShelfRoom
    /// Frame project id when we can match the sidebar list (for logos).
    let projectID: String?
    var id: String { projectID ?? name }

    /// Prefer a "Main" chat per project; otherwise the first room by name.
    /// Matches sidebar projects by name so we can show their logos.
    static func from(rooms: [ShelfRoom], frameProjects: [FrameProject]) -> [ProjectChoice] {
        let byName = Dictionary(uniqueKeysWithValues: frameProjects.map { ($0.name, $0) })
        let grouped = Dictionary(grouping: rooms, by: \.projectName)
        return grouped.keys.sorted().compactMap { name in
            guard let list = grouped[name], !list.isEmpty else { return nil }
            let preferred = list.first { $0.roomName.localizedCaseInsensitiveCompare("Main") == .orderedSame }
                ?? list.first { $0.roomName.localizedCaseInsensitiveContains("design") }
                ?? list.sorted { $0.roomName.localizedCaseInsensitiveCompare($1.roomName) == .orderedAscending }.first
            guard let room = preferred else { return nil }
            return ProjectChoice(name: name, room: room, projectID: byName[name]?.id)
        }
    }
}
