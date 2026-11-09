import SwiftUI

/// The detail column's own top bar — chat tabs only. The sidebar toggle lives
/// in the window toolbar (on the traffic-light line) so this bar never has to
/// share space with it.
struct DetailTopBar: View {
    @Bindable var frame: FrameModel

    var body: some View {
        HStack(spacing: FrameMetrics.rowSpacing) {
            if frame.currentProject != nil {
                ProjectTabBar(frame: frame)
                    .padding(.leading, FrameMetrics.contentEdge)
            }
            Spacer(minLength: 0)
        }
        .frame(height: FrameMetrics.rowHeight)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.trailing, FrameMetrics.sidebarInset)
    }
}
