import SwiftUI
import OrionDesignSystem

struct CatalogButtons: View {
    @Binding var saved: Bool
    var body: some View {
        Button(saved ? "Saved" : "Save inspiration", systemImage: saved ? "checkmark" : "plus", action: toggleSaved)
            .buttonStyle(OrionButtonStyle())
        Button("Secondary", action: reset).buttonStyle(OrionButtonStyle(.secondary))
        Button("Quiet", action: reset).buttonStyle(OrionButtonStyle(.quiet))
        Button("Delete", role: .destructive, action: reset).buttonStyle(OrionButtonStyle(.destructive))
        Button("Disabled", action: reset).buttonStyle(OrionButtonStyle()).disabled(true)
    }
    private func toggleSaved() { saved.toggle() }
    private func reset() { saved = false }
}
