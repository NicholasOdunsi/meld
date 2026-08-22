// Generation context for a composer request: the model needs to know which
// screens already exist (so it links to them by key instead of guessing, and
// avoids key collisions) and which target keys are "dangling" -- referenced by
// an existing screen's button but not yet fulfilled by any screen -- so a new
// generation can become that target and heal the forward reference.

import {
  extractComponentVocabulary,
  formatComponentVocabulary,
  type ComponentVocabularyEntry,
} from "./component-vocabulary";

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
  // The room's established component look, and the screen it came from. Both
  // optional so callers written before component reuse existed still compile.
  componentSource?: string | null;
  existingComponents?: readonly ComponentVocabularyEntry[];
};

// A room's screen as the context derivation needs to see it -- structural, so
// both the client (canvas screens already in hand) and the server (a fresh
// read) can pass their own richer row shapes straight in.
export type ScreenForGenerationContext = {
  name: string;
  screenKey?: string | null;
  layoutKey?: string | null;
  layoutName?: string | null;
  layout?: { id: string; actions?: readonly { targetScreenKey?: string | null }[] } | null;
  preview?: {
    actions?: readonly { targetScreenKey?: string | null }[];
    styles?: string;
  } | null;
};

// The one derivation of a room's generation context, so every caller that can
// start a generation describes the room the same way. Deriving this per-caller
// is what let the Room conversation's Design Agent path generate blind -- no
// existing screens and, worse, no existing layouts, so every screen invented
// its own shell instead of reusing the room's.
export function deriveScreenGenerationContext(
  screens: readonly ScreenForGenerationContext[],
): {
  existingScreens: ExistingScreenSummary[];
  danglingTargets: string[];
  existingLayouts: ExistingScreenSummary[];
  componentSource: string | null;
  existingComponents: ComponentVocabularyEntry[];
} {
  const existingScreens = screens.flatMap((screen) =>
    screen.screenKey ? [{ key: screen.screenKey, name: screen.name }] : [],
  );
  const seenLayoutIds = new Set<string>();
  const distinctLayouts = screens.flatMap((screen) => {
    const layout = screen.layout;
    if (!layout || seenLayoutIds.has(layout.id)) return [];
    seenLayoutIds.add(layout.id);
    return [layout];
  });
  const seenLayoutKeys = new Set<string>();
  const existingLayouts = screens.flatMap((screen) => {
    const { layoutKey, layoutName } = screen;
    if (!layoutKey || !layoutName || seenLayoutKeys.has(layoutKey)) return [];
    seenLayoutKeys.add(layoutKey);
    return [{ key: layoutKey, name: layoutName }];
  });
  const danglingTargets = computeDanglingTargets(
    screens.map((screen) => ({
      screenKey: screen.screenKey,
      actions: screen.preview?.actions ?? [],
    })),
    distinctLayouts.map((layout) => ({ actions: layout.actions ?? [] })),
  );
  // One screen's vocabulary, not a merge of every screen's. Screens that were
  // generated cold don't agree on names (`.metric-card` on one, `.summary-card`
  // on the next), so pooling them would hand the model two ways to build the
  // same thing -- which is the problem, not the fix. The first screen with any
  // styles wins: canvas order, so it is the room's established screen.
  const source = screens.find((screen) => Boolean(screen.preview?.styles));
  const existingComponents = source
    ? extractComponentVocabulary(source.preview?.styles ?? "")
    : [];

  return {
    existingScreens,
    danglingTargets,
    existingLayouts,
    componentSource: existingComponents.length > 0 ? (source?.name ?? null) : null,
    existingComponents,
  };
}

// Formats existing screens + dangling targets + existing layouts into the
// untrusted-data block the generation prompt splices into the model's
// instruction.
export function formatScreenGenerationContext({
  existingScreens,
  danglingTargets,
  existingLayouts,
  componentSource,
  existingComponents = [],
}: ScreenGenerationContextInput): string {
  const componentBlock =
    componentSource && existingComponents.length > 0
      ? formatComponentVocabulary(componentSource, existingComponents)
      : "";
  if (
    existingScreens.length === 0 &&
    danglingTargets.length === 0 &&
    existingLayouts.length === 0 &&
    componentBlock === ""
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
  if (componentBlock) lines.push(componentBlock);
  return lines.join("\n");
}
