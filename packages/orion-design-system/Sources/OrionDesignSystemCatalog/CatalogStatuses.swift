import SwiftUI
import OrionDesignSystem

struct CatalogStatuses: View {
    var body: some View {
        OrionStatusToken(.success, label: "Synced")
        OrionStatusToken(.warning, label: "Pending")
        OrionStatusToken(.danger, label: "Failed")
        OrionStatusToken(.information, label: "New")
    }
}
