import SwiftUI

struct NoteFieldView: View {
    @Binding var note: String

    var body: some View {
        TextField("Note for the next save (optional)", text: $note, axis: .vertical)
            .lineLimit(ShelfDesign.noteLines)
    }
}
