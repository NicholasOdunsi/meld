import ShelfCore
import SwiftUI

extension TasteWeight {
    var fontWeight: Font.Weight {
        switch self {
        case .light: .light
        case .regular: .regular
        case .bold: .bold
        case .heavy: .heavy
        }
    }
}
