import SwiftUI

struct OrionLogoShape: Shape {
    let form: OrionLogoForm
    func path(in rect: CGRect) -> Path {
        let bounds = form.bounds
        let scale = min(rect.width / bounds.width, rect.height / bounds.height)
        let transform = CGAffineTransform(
            a: scale, b: 0, c: 0, d: scale,
            tx: rect.midX - bounds.width * scale / 2 - bounds.minX * scale,
            ty: rect.midY - bounds.height * scale / 2 - bounds.minY * scale
        )
        return OrionLogoPaths.path(markOnly: form == .mark).applying(transform)
    }
}
