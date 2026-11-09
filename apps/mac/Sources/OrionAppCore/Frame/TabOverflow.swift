import Foundation

/// Apple HIG (Tab views): at most six visible tabs; the rest go in "More".
/// The selected tab always stays visible, taking the last inline slot.
public enum TabOverflow {
    public static let maxVisible = 6

    public static func split(_ tabs: [FrameTab], selectedID: String?, max: Int = maxVisible) -> (visible: [FrameTab], overflow: [FrameTab]) {
        guard tabs.count > max else { return (tabs, []) }
        var visible = Array(tabs.prefix(max))
        if let selected = tabs.first(where: { $0.id == selectedID }), !visible.contains(selected) {
            visible[max - 1] = selected
        }
        return (visible, tabs.filter { !visible.contains($0) })
    }
}
