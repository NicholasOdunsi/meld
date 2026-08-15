// A screen's navigation action carries a symbolic target -- a sibling screen's
// `screenKey` (`targetScreenKey`, the current mechanism) and/or, temporarily,
// a flow node id (`targetNodeId`, deprecated, removed in a later task) -- and/or
// a resolved screen (`targetScreenId`, legacy rows or a manual C2a link). The
// prototype harness only understands a concrete target screen, so the read
// path resolves each action to one before assembly. Keeping resolution here --
// pure, no I/O -- lets the preview reader and the canvas reader share
// identical semantics.

export type ResolvableAction = {
  id: string;
  label: string;
  targetScreenKey?: string | null;
  /** @deprecated superseded by targetScreenKey; kept for the legacy resolution path. */
  targetNodeId?: string | null;
  targetScreenId?: string | null;
};

export type ResolvedScreenAction = {
  id: string;
  label: string;
  targetScreenId: string | null;
};

export type ActionTargetResolution = {
  // screenKey -> screen id, built from the room's live design_screens.
  keyToScreenId?: ReadonlyMap<string, string>;
  /** @deprecated flow node id -> screen id, built from design_screens.flow_node_id. */
  nodeToScreenId?: ReadonlyMap<string, string>;
  /** @deprecated action id -> screen id: manual C2a overrides for THIS screen. */
  overrides?: ReadonlyMap<string, string>;
};

// Precedence, highest first:
//   1. manual override (C2a arrow, deprecated) -- the user's explicit choice
//      always wins while the legacy override path still exists
//   2. key resolution -- the generator's screenKey tag, mapped to a screen
//   3. node resolution (A1, deprecated) -- the generator's journey tag,
//      mapped to a screen
//   4. the action's own targetScreenId -- how legacy rows expressed a link
//   5. null -- unresolved, which the harness renders as data-meld-unresolved
export function resolveActionTargets(
  actions: readonly ResolvableAction[],
  resolution: ActionTargetResolution,
): ResolvedScreenAction[] {
  return actions.map((action) => {
    const override = resolution.overrides?.get(action.id);
    const byKey = action.targetScreenKey
      ? resolution.keyToScreenId?.get(action.targetScreenKey)
      : undefined;
    const byNode = action.targetNodeId
      ? resolution.nodeToScreenId?.get(action.targetNodeId)
      : undefined;
    return {
      id: action.id,
      label: action.label,
      targetScreenId: override ?? byKey ?? byNode ?? action.targetScreenId ?? null,
    };
  });
}
