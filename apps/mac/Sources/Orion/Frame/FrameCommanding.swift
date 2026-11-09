import OrionAppCore

/// The page side of the native frame: run a frame command in the Orion page,
/// or load a page directly when no page is there to ask.
@MainActor
protocol FrameCommanding: AnyObject {
    func callFrame(_ functionBody: String, arguments: [String: any Sendable]) async -> FrameCallResult
    func load(path: String)
}
