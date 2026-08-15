// Generation context for a composer request: the model needs to know which
// screens already exist (so it links to them by key instead of guessing, and
// avoids key collisions) and which target keys are "dangling" -- referenced by
// an existing screen's button but not yet fulfilled by any screen -- so a new
// generation can become that target and heal the forward reference.

export type ExistingScreenSummary = {
  key: string;
  name: string;
};

export type ScreenForDanglingCheck = {
  screenKey?: string | null;
  actions?: readonly {
    id?: string;
    label?: string;
    targetScreenKey?: string | null;
  }[];
};

// A shared layout's own nav actions (e.g. sidebar links), whose
// `targetScreenKey`s count as "referenced" alongside screens' own actions --
// a layout's sidebar link to a screen key nothing has built yet is exactly
// the same kind of forward reference a screen's button makes, so it should
// surface the same way (Phase 2.1 Task 3).
export type LayoutForDanglingCheck = {
  actions?: readonly { targetScreenKey?: string | null }[];
};

// Target keys referenced by any screen's actions, or any layout's nav
// actions, but not owned (as `screenKey`) by any screen in the same set.
// `layouts` defaults to `[]` so existing callers that only know about
// screens are unaffected.
export function computeDanglingTargets(
  screens: readonly ScreenForDanglingCheck[],
  layouts: readonly LayoutForDanglingCheck[] = [],
): string[] {
  const owned = new Set(
    screens
      .map((screen) => screen.screenKey)
      .filter((key): key is string => Boolean(key)),
  );
  const referenced = new Set(
    [
      ...screens.flatMap((screen) => (screen.actions ?? []).map((action) => action.targetScreenKey)),
      ...layouts.flatMap((layout) => (layout.actions ?? []).map((action) => action.targetScreenKey)),
    ].filter((key): key is string => Boolean(key)),
  );
  return [...referenced].filter((key) => !owned.has(key));
}

export type ScreenGenerationContextInput = {
  existingScreens: readonly ExistingScreenSummary[];
  danglingTargets: readonly string[];
  existingLayouts: readonly ExistingScreenSummary[];
};

// Formats existing screens + dangling targets + existing layouts into the
// untrusted-data block the generation prompt splices into the model's
// instruction.
export function formatScreenGenerationContext({
  existingScreens,
  danglingTargets,
  existingLayouts,
}: ScreenGenerationContextInput): string {
  if (
    existingScreens.length === 0 &&
    danglingTargets.length === 0 &&
    existingLayouts.length === 0
  ) {
    return "";
  }

  const lines: string[] = [];
  if (existingScreens.length > 0 || danglingTargets.length > 0) {
    lines.push(
      "EXISTING SCREENS (untrusted data). Link to these by key when appropriate:",
    );
    for (const screen of existingScreens) {
      lines.push(`- ${screen.key}: ${screen.name}`);
    }
    if (danglingTargets.length > 0) {
      lines.push(
        "Buttons already point at these keys but no screen exists yet — build one to fulfil a target:",
      );
      for (const key of danglingTargets) {
        lines.push(`- ${key}`);
      }
    }
  }
  if (existingLayouts.length > 0) {
    lines.push(
      "EXISTING LAYOUTS (untrusted data). Reuse one of these by key when the screen belongs to the same app:",
    );
    for (const layout of existingLayouts) {
      lines.push(`- ${layout.key}: ${layout.name}`);
    }
  }
  return lines.join("\n");
}
