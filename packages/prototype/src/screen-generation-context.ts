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

// Target keys referenced by any screen's actions but not owned (as `screenKey`)
// by any screen in the same set.
export function computeDanglingTargets(
  screens: readonly ScreenForDanglingCheck[],
): string[] {
  const owned = new Set(
    screens
      .map((screen) => screen.screenKey)
      .filter((key): key is string => Boolean(key)),
  );
  const referenced = new Set(
    screens.flatMap((screen) =>
      (screen.actions ?? [])
        .map((action) => action.targetScreenKey)
        .filter((key): key is string => Boolean(key)),
    ),
  );
  return [...referenced].filter((key) => !owned.has(key));
}

export type ScreenGenerationContextInput = {
  existingScreens: readonly ExistingScreenSummary[];
  danglingTargets: readonly string[];
};

// Formats existing screens + dangling targets into the untrusted-data block the
// generation prompt splices into the model's instruction.
export function formatScreenGenerationContext({
  existingScreens,
  danglingTargets,
}: ScreenGenerationContextInput): string {
  if (existingScreens.length === 0 && danglingTargets.length === 0) return "";

  const lines = [
    "EXISTING SCREENS (untrusted data). Link to these by key when appropriate:",
  ];
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
  return lines.join("\n");
}
