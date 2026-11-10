import OrionDesignSystem
import ShelfCore
import SwiftUI

/// The six tiles and two strips. Six columns wide; two columns below 720 pt.
struct TasteBoardGrid: View {
    @Bindable var model: TasteModel
    let board: TasteBoard

    private func card<C: View>(_ slot: TasteSlot, _ label: LocalizedStringKey, @ViewBuilder _ content: @escaping () -> C) -> some View {
        TasteTileCard(
            label: label,
            pending: model.store.pending(in: slot),
            isSelected: model.openSlot == slot,
            isEnabled: model.store.canEdit || slot == .craft,
            onOpen: { model.open(slot) },
            onPreview: { model.previewCardID = $0 },
            onDecide: { card, decision in Task { await model.store.decide(card, decision) } },
            content: content
        )
    }

    private var motion: some View { card(.motion, "MOTION & FEEL") { MotionTileContent(board: board) } }
    private var lettering: some View { card(.lettering, "LETTERING") { LetteringTileContent(board: board) } }
    private var shape: some View { card(.shape, "SHAPE") { ShapeTileContent(board: board) } }
    private var space: some View { card(.space, "SPACE") { SpaceTileContent(board: board) } }
    private var voice: some View { card(.voice, "VOICE") { VoiceTileContent(board: board) } }
    private var avoid: some View { card(.avoid, "STEER CLEAR OF") { AvoidStripContent(board: board) } }
    private var craft: some View { card(.craft, "CRAFT RULES") { CraftStripContent() } }

    var body: some View {
        ViewThatFits(in: .horizontal) {
            wide.frame(minWidth: 720)
            narrow
        }
    }

    private var wide: some View {
        Grid(horizontalSpacing: OrionSpacing.xs, verticalSpacing: OrionSpacing.xs) {
            GridRow {
                motion.frame(height: 210).gridCellColumns(3)
                lettering.frame(height: 210).gridCellColumns(3)
            }
            GridRow {
                shape.frame(height: 150).gridCellColumns(2)
                space.frame(height: 150).gridCellColumns(2)
                voice.frame(height: 150).gridCellColumns(2)
            }
            GridRow {
                avoid.frame(height: 76).gridCellColumns(3)
                craft.frame(height: 76).gridCellColumns(3)
            }
        }
    }

    private var narrow: some View {
        VStack(spacing: OrionSpacing.xs) {
            HStack(spacing: OrionSpacing.xs) { motion.frame(height: 210); lettering.frame(height: 210) }
            HStack(spacing: OrionSpacing.xs) { shape.frame(height: 150); space.frame(height: 150) }
            HStack(spacing: OrionSpacing.xs) { voice.frame(height: 110); avoid.frame(height: 110) }
            craft.frame(height: 76)
        }
    }
}
