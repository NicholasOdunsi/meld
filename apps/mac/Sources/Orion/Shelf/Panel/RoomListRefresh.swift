import ShelfCore

/// When the panel's room list must be fetched again: on connect/disconnect and
/// every time the panel opens. The panel's view lives for the whole session,
/// so without the open count a room created after launch would never appear.
struct RoomListRefresh: Equatable {
    let connection: ConnectionState
    let panelOpenCount: Int
}
