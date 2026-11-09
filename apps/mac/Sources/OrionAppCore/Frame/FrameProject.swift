import Foundation

/// A project as the native sidebar shows it. `icon` and `color` are the web
/// app's stored keys (see apps/web/src/features/projects/schemas.ts).
public struct FrameProject: Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let icon: String
    public let color: String

    public init(id: String, name: String, icon: String, color: String) {
        self.id = id
        self.name = name
        self.icon = icon
        self.color = color
    }
}
