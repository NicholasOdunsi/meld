import AppKit
import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// Native Overview: the hat greeting over a faded painting, a frameless Todo
/// list, then read-only In progress / Completed sections. Saves and moves
/// sync through the page.
struct OverviewPage: View {
    @Bindable var frame: FrameModel
    @State private var todos = OverviewTodoStore()
    @FocusState private var focusedItemID: UUID?
    @State private var isInProgressExpanded = true
    @State private var isCompletedExpanded = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: FrameMetrics.overviewSectionGap) {
                hatHeader
                todoSection
                statusSection(
                    title: String(localized: "In progress"),
                    icon: .rocketLaunch,
                    iconColor: OrionColor.dayBreakBlue.color,
                    count: todos.inProgress.count,
                    isExpanded: $isInProgressExpanded,
                    items: todos.inProgress,
                    rowKind: .working
                )
                statusSection(
                    title: String(localized: "Completed"),
                    icon: .trophy,
                    iconColor: OrionColor.kryptoniteGreen.color,
                    count: todos.completed.count,
                    isExpanded: $isCompletedExpanded,
                    items: todos.completed,
                    rowKind: .done
                )
            }
            .padding(.top, FrameMetrics.overviewTopMargin)
            .padding(.horizontal, FrameMetrics.overviewMargin)
            .padding(.bottom, FrameMetrics.overviewMargin)
            .frame(maxWidth: FrameMetrics.overviewMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .scrollContentBackground(.hidden)
        // Runs up under the toolbar to the window's top edge.
        .background(alignment: .top) {
            OverviewHeaderWash()
                .ignoresSafeArea(edges: .top)
        }
        .onAppear {
            todos.sync = frame
            todos.apply(frame.snapshot?.todos ?? [])
            focusedItemID = todos.items.first?.id
        }
        .onChange(of: frame.snapshot?.todos ?? []) { _, saved in
            todos.apply(saved)
        }
    }

    // MARK: Hat header

    private var hatHeader: some View {
        let todoCount = todos.items.count { !$0.isBlank }
        let inProgressCount = todos.inProgress.count
        let completedCount = todos.completed.count
        return OverviewHatHeader(
            dateLine: Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)),
            salutation: OverviewGreeting.salutation(
                hour: Calendar.current.component(.hour, from: .now),
                firstName: OverviewGreeting.firstName(from: NSFullUserName())
            ),
            summary: OverviewGreeting.summary(
                todo: todoCount, inProgress: inProgressCount, completed: completedCount
            ),
            hasNews: todoCount + inProgressCount + completedCount > 0
        )
    }

    // MARK: Todo — header + lines only, no panel frame

    private var todoSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Buttons overlay the trailing edge so they don't reserve empty width
            // when nothing is checked (that was leaving a big right-side gap).
            HStack(alignment: .center, spacing: 12) {
                HStack(spacing: 8) {
                    OrionIconView(.flag, weight: .fill)
                        .frame(width: 18, height: 18)
                        .foregroundStyle(OrionColor.nectarineOrange.color)
                    Text("Todo")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.primary)
                }
                Spacer(minLength: 0)
            }
            // Match pill height so overlaid actions don’t clip; width stays free.
            .frame(minHeight: 32, alignment: .center)
            .overlay(alignment: .trailing) {
                if todos.hasCheckedItems {
                    HStack(spacing: 8) {
                        Button {
                            _ = todos.removeChecked()
                        } label: {
                            HStack(spacing: 6) {
                                OrionIconView(.trash)
                                    .frame(width: 12, height: 12)
                                Text("Delete")
                            }
                        }
                        .buttonStyle(OrionButtonStyle(.secondary))
                        .help(String(localized: "Delete checked to-dos"))

                        Button {
                            _ = todos.orchestrateChecked()
                        } label: {
                            HStack(spacing: 6) {
                                OrionIconView(.rocketLaunch, weight: .fill)
                                    .frame(width: 13, height: 13)
                                Text("Orchestrate (\(todos.checkedCount))")
                                    .monospacedDigit()
                            }
                        }
                        .buttonStyle(OrionButtonStyle())
                        .help(String(localized: "Move the ticked to-dos to In progress"))
                    }
                    .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .trailing)))
                }
            }
            .animation(.snappy(duration: 0.18), value: todos.hasCheckedItems)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(todos.items) { item in
                    todoRow(item)
                }
            }
        }
    }

    // MARK: In progress / Completed — show-only, expand/collapse

    private enum StatusRowKind {
        /// Agent is working — spinner only; you can't move it to Completed.
        case working
        case done
    }

    private func statusSection(
        title: String,
        icon: OrionIcon,
        iconColor: Color,
        count: Int,
        isExpanded: Binding<Bool>,
        items: [OverviewTodoItem],
        rowKind: StatusRowKind
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                withAnimation(.snappy(duration: 0.2)) {
                    isExpanded.wrappedValue.toggle()
                }
            } label: {
                HStack(spacing: 8) {
                    OrionIconView(icon, weight: .fill)
                        .frame(width: 18, height: 18)
                        .foregroundStyle(iconColor)
                    Text(title)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("\(count)")
                        .font(.title3.weight(.semibold).monospacedDigit())
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(isExpanded.wrappedValue ? 90 : 0))
                        .frame(width: 12, height: 12)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(title), \(count)")
            .accessibilityHint(isExpanded.wrappedValue
                               ? String(localized: "Collapse")
                               : String(localized: "Expand"))

            if isExpanded.wrappedValue, !items.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(items) { item in
                        statusRow(item, kind: rowKind)
                    }
                }
            }
        }
    }

    private func statusRow(_ item: OverviewTodoItem, kind: StatusRowKind) -> some View {
        // Same column and alignment as Todo rows: icon under the section icon,
        // pinned to the first line when the text wraps.
        let wraps = wrapsToNextLine(item)
        return HStack(alignment: wraps ? .top : .center, spacing: 12) {
            Group {
                switch kind {
                case .working:
                    ProgressView()
                        .controlSize(.small)
                        .frame(width: 20, height: 20)
                        .accessibilityLabel(String(localized: "Working"))
                case .done:
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 17, weight: .regular))
                        .foregroundStyle(.secondary)
                        .frame(width: 20, height: 20)
                        .accessibilityHidden(true)
                }
            }
            .padding(.top, wraps ? 4 : 0)

            Text(item.text)
                .font(.title3)
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineLimit(3)

            projectChip(for: item.projectID)
        }
        .padding(.vertical, 4)
    }

    private func projectChip(for projectID: String?) -> some View {
        let project = frame.snapshot?.projects.first(where: { $0.id == projectID })
        return projectChipLabel(selected: project, showsChevron: false)
            .opacity(project == nil ? 0.5 : 0.85)
    }

    /// Quiet fixed-width project slot — logo + truncated name, no loud fill.
    private func projectChipLabel(selected: FrameProject?, showsChevron: Bool) -> some View {
        HStack(spacing: 6) {
            if let selected {
                ProjectMark(project: selected, revision: 0)
                    .scaleEffect(0.86)
                    .frame(width: 20, height: 20)
                Text(selected.name)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                OrionIconView(.folder)
                    .frame(width: 18, height: 18)
                    .foregroundStyle(.tertiary)
                Text("Project")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.tertiary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if showsChevron {
                Image(systemName: "chevron.down")
                    .font(.system(size: 8, weight: .semibold))
                    .foregroundStyle(.quaternary)
            }
        }
        .padding(.leading, 7)
        .padding(.trailing, showsChevron ? 8 : 7)
        .padding(.vertical, 4)
        .frame(width: FrameMetrics.overviewProjectChipWidth, alignment: .leading)
        .background(.quaternary.opacity(0.22), in: Capsule(style: .continuous))
    }

    private func todoRow(_ item: OverviewTodoItem) -> some View {
        // One-line rows center as a unit; wrapped text pins controls to the first line.
        let alignment: VerticalAlignment = wrapsToNextLine(item) ? .top : .center
        return HStack(alignment: alignment, spacing: 12) {
            Button {
                todos.toggleChecked(item.id)
            } label: {
                Image(systemName: item.isChecked ? "checkmark.square.fill" : "square")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(checkboxStyle(for: item))
                    .frame(width: 20, height: 20)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .disabled(item.isBlank)
            .padding(.top, wrapsToNextLine(item) ? 4 : 0)
            .accessibilityLabel(item.isChecked ? String(localized: "Uncheck to-do") : String(localized: "Check to-do"))

            TextField(
                String(localized: "Add a to-do"),
                text: Binding(
                    get: { todos.items.first(where: { $0.id == item.id })?.text ?? "" },
                    set: { todos.setText($0, for: item.id) }
                ),
                axis: .vertical
            )
            .textFieldStyle(.plain)
            .font(.title3)
            .lineLimit(1...6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .focused($focusedItemID, equals: item.id)
            .onSubmit {
                if let next = todos.commitLine(item.id) {
                    focusedItemID = next
                }
            }

            projectMenu(for: item)
                .padding(.top, wrapsToNextLine(item) ? 0 : -2)
        }
        .padding(.vertical, 4)
    }

    /// Rough wrap check so single-line todos stay vertically centered.
    private func wrapsToNextLine(_ item: OverviewTodoItem) -> Bool {
        item.text.contains(where: \.isNewline) || item.text.count > 42
    }

    /// Fixed-width chip so picking a project never shifts the todo text.
    /// Logo + name fill that slot; long names truncate inside it.
    private func projectMenu(for item: OverviewTodoItem) -> some View {
        let projects = frame.snapshot?.projects ?? []
        let selected = projects.first(where: { $0.id == item.projectID })
        return Menu {
            Button(String(localized: "No project")) {
                todos.setProjectID(nil, for: item.id)
            }
            if !projects.isEmpty {
                Divider()
                ForEach(projects) { project in
                    Button(project.name) {
                        todos.setProjectID(project.id, for: item.id)
                    }
                }
            }
        } label: {
            projectChipLabel(selected: selected, showsChevron: true)
                .contentShape(.capsule)
        }
        .buttonStyle(.plain)
        .help(String(localized: "Attach a project to this to-do"))
    }

    private func checkboxStyle(for item: OverviewTodoItem) -> AnyShapeStyle {
        if item.isBlank { return AnyShapeStyle(.tertiary) }
        if item.isChecked { return AnyShapeStyle(OrionColor.dayBreakBlue.color) }
        return AnyShapeStyle(.secondary)
    }
}
