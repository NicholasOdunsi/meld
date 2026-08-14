// A screen's navigation action carries a symbolic journey target (`targetNodeId`,
// set by the generator) and/or a resolved screen (`targetScreenId`, legacy rows
// or a manual C2a link). The prototype harness only understands a concrete target
// screen, so the read path resolves each action to one before assembly. Keeping
// resolution here -- pure, no I/O -- lets the preview reader and the canvas reader
// share identical semantics.

export type ResolvableAction = {
  id: string;
  label: string;
  targetNodeId?: string | null;
  targetScreenId?: string | null;
};

export type ResolvedScreenAction = {
  id: string;
  label: string;
  targetScreenId: string | null;
};

export type ActionTargetResolution = {
  // flow node id -> screen id, built from the room's design_screens.flow_node_id
  nodeToScreenId: ReadonlyMap<string, string>;
  // action id -> screen id: manual C2a overrides for THIS screen (optional)
  overrides?: ReadonlyMap<string, string>;
};

// Precedence, highest first:
//   1. manual override (C2a arrow) -- the user's explicit choice always wins
//   2. node resolution (A1) -- the generator's journey tag, mapped to a screen
//   3. the action's own targetScreenId -- how legacy rows expressed a link
//   4. null -- unresolved, which the harness renders as data-meld-unresolved
export function resolveActionTargets(
  actions: readonly ResolvableAction[],
  resolution: ActionTargetResolution,
): ResolvedScreenAction[] {
  return actions.map((action) => {
    const override = resolution.overrides?.get(action.id);
    const byNode = action.targetNodeId
      ? resolution.nodeToScreenId.get(action.targetNodeId)
      : undefined;
    return {
      id: action.id,
      label: action.label,
      targetScreenId: override ?? byNode ?? action.targetScreenId ?? null,
    };
  });
}
