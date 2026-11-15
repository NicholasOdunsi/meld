/// How a project's detail column is shared between the chat (left) and an
/// open side panel (right), with a 1pt divider between them.
///
/// This is the one place the panel's width is decided. The chat column, the
/// panel content, the divider line and the panel title in the header all read
/// the same `DetailSplit`, so they always agree on where the boundary is.
///
/// Rules, in order:
/// 1. The panel asks for its natural width (the dragged width for To-do /
///    Star, a share of the column for Canvas / Artifacts).
/// 2. The chat keeps at least `minimumChatWidth`; the panel gives way first.
/// 3. The panel never goes below its own minimum (`PanelWidth.minimum`).
/// 4. It never goes past the column. `chatWidth + dividerWidth + panelWidth`
///    is always exactly the detail width.
public struct DetailSplit: Equatable, Sendable {
    public enum Panel: Equatable, Sendable {
        /// To-do / Constellations / Star: the width the person dragged to.
        case side(preferredWidth: Double)
        /// Canvas: a large share of the column.
        case canvas
        /// Artifacts: a bit under half the column.
        case artifacts
    }

    /// The chat never gets narrower than this while a panel is open, unless
    /// the window is too small to fit both the chat and the panel's minimum.
    public static let minimumChatWidth: Double = 360
    public static let dividerWidth: Double = 1
    public static let canvasFraction: Double = 0.72
    public static let artifactsFraction: Double = 0.45

    public var chatWidth: Double
    public var panelWidth: Double
    /// 0 when no panel is open.
    public var dividerWidth: Double

    public init(detailWidth: Double, panel: Panel?) {
        let detail = detailWidth.isFinite ? max(0, detailWidth) : 0
        guard let panel, detail > 0 else {
            self.init(chatWidth: detail, panelWidth: 0, dividerWidth: 0)
            return
        }
        let divider = min(Self.dividerWidth, detail)
        let room = detail - divider
        let wanted: Double = switch panel {
        case .side(let preferred): PanelWidth.clamp(preferred.isFinite ? preferred : PanelWidth.default,
                                                    windowWidth: detail)
        case .canvas: detail * Self.canvasFraction
        case .artifacts: detail * Self.artifactsFraction
        }
        var panelWidth = min(wanted, room - Self.minimumChatWidth)
        panelWidth = max(panelWidth, PanelWidth.minimum)
        panelWidth = min(panelWidth, room)
        self.init(chatWidth: room - panelWidth, panelWidth: panelWidth, dividerWidth: divider)
    }

    private init(chatWidth: Double, panelWidth: Double, dividerWidth: Double) {
        self.chatWidth = chatWidth
        self.panelWidth = panelWidth
        self.dividerWidth = dividerWidth
    }

    /// The widest a dragged side panel can actually be shown in this column.
    public static func maximumSidePanelWidth(detailWidth: Double) -> Double {
        DetailSplit(detailWidth: detailWidth, panel: .side(preferredWidth: .greatestFiniteMagnitude)).panelWidth
    }
}
