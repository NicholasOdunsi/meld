// A screen's navigation action carries a symbolic target -- a sibling screen's
// `screenKey` (`targetScreenKey`) -- and/or a resolved screen (`targetScreenId`,
// legacy rows). The prototype harness only understands a concrete target
// screen, so the read path resolves each action to one before assembly.
// Keeping resolution here -- pure, no I/O -- lets the preview reader and the
// canvas reader share identical semantics.

export type ResolvableAction = {
  id: string;
  label: string;
  targetScreenKey?: string | null;
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
};

// Precedence, highest first:
//   1. key resolution -- the generator's screenKey tag, mapped to a screen
//   2. the action's own targetScreenId -- how legacy rows expressed a link
//   3. null -- unresolved, which the harness renders as data-meld-unresolved
export function resolveActionTargets(
  actions: readonly ResolvableAction[],
  resolution: ActionTargetResolution,
): ResolvedScreenAction[] {
  return actions.map((action) => {
    const byKey = action.targetScreenKey
      ? resolution.keyToScreenId?.get(action.targetScreenKey)
      : undefined;
    return {
      id: action.id,
      label: action.label,
      targetScreenId: byKey ?? action.targetScreenId ?? null,
    };
  });
}
