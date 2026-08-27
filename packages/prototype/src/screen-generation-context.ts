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

/**
 * The screen a new one should look like -- shown in full, not summarised.
 *
 * A class-name digest cannot carry a brand name, the words on the page, the
 * shape of the sidebar, or how tall the content runs. Handing the model only
 * that and asking it to "match" produced screens that agreed on a few CSS
 * class names and disagreed on everything a person actually looks at: one
 * screen said "MoveOn", the next said "Voltway"; one had a four-step tracker
 * down the left, the next had three feature bullets.
 *
 * Screens generated together in one batch never had this problem, because the
 * model could see its own work. This gives it the same thing across batches.
 */
export type ReferenceScreen = {
  name: string;
  markup: string;
  styles: string;
};

// Sized against the real thing and against the hard ceiling. An observed
// screen is ~6.5KB of markup and ~6.8KB of styles; `ai_tasks.instruction`
// accepts 20,000 characters (DB check constraint and MAX_INSTRUCTION_CHARS
// agree). These bounds keep the whole context block near 14K, which leaves
// more than the 4,000-character instruction maximum -- so the reference is
// never bought at the cost of truncating what the person actually asked for.
export const MAX_REFERENCE_MARKUP_CHARS = 7_000;
export const MAX_REFERENCE_STYLES_CHARS = 5_500;

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}\n/* … trimmed */`;
}

export type ScreenGenerationContextInput = {
  existingScreens: readonly ExistingScreenSummary[];
  danglingTargets: readonly string[];
  existingLayouts: readonly ExistingScreenSummary[];
  /** The established screen, in full. Absent before anything has been built. */
  referenceScreen?: ReferenceScreen | null;
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
    // Declared, and used. The reader has always supplied this; the context
    // simply never asked for it, which is precisely why the model was left
    // guessing at everything the stylesheet alone cannot say -- the brand
    // name, the words, the shell, the proportions.
    markup?: string;
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
  referenceScreen: ReferenceScreen | null;
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
  // The same screen the vocabulary came from, deliberately -- a digest of one
  // screen next to the full text of another would give the model two different
  // houses to match. Its markup used to be dropped here, which is what left
  // the model guessing at the brand name and the shell.
  const referenceScreen: ReferenceScreen | null =
    source && source.preview
      ? {
          name: source.name,
          markup: source.preview.markup ?? "",
          styles: source.preview.styles ?? "",
        }
      : null;

  return {
    referenceScreen,
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
  referenceScreen,
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
    componentBlock === "" &&
    !referenceScreen
  ) {
    return "";
  }

  const lines: string[] = [];
  if (existingScreens.length > 0 || danglingTargets.length > 0) {
    lines.push(
      // The second sentence is the difference between "update the vehicle
      // details page" landing on the screen that already exists and building a
      // near-duplicate beside it. With nothing selected this list is the only
      // thing that can tell the model the screen is already there; read as
      // link targets only, it invents a fresh slug, and the copy then claims
      // the key while every button keeps pointing at the original.
      "EXISTING SCREENS (untrusted data). Link to these by key when appropriate." +
        " To CHANGE one of these screens, reuse its EXACT key -- that updates it" +
        " in place. A near-miss slug builds a duplicate and leaves every button" +
        " pointing at the old copy:",
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
  // LAST, deliberately, and the ordering is a safety property rather than a
  // preference. Anything that trims this text trims it from the end, and this
  // is by far the largest block. Ahead of the key lists it pushed them off the
  // end of a truncated prompt -- the model never saw that
  // "prospect_schedule_test" was waiting, invented its own slug, and every
  // button on the previous screen led nowhere.
  //
  // A lost reference costs fidelity: the screen looks less like its siblings.
  // A lost key list costs connectivity: the prototype stops working. So the
  // cheap, essential blocks go first and this one absorbs any shortfall.
  if (referenceScreen) {
    lines.push(
      `REFERENCE SCREEN (untrusted data). "${referenceScreen.name}" is this room's established screen. Build the new screen as its sibling: the SAME product/company name, the SAME shell and sidebar treatment, the SAME type scale, spacing, colours and tone of voice, and the SAME page proportions -- content that fills the frame the way this one does. Copy its structure and class names rather than reinterpreting them, and write new markup only for what genuinely differs on this page. Keep the key rules above: they decide whether this screen is reachable at all. If the request explicitly asks for a variation, an alternative, or a different look, follow the request instead.`,
      "--- reference markup ---",
      clip(referenceScreen.markup, MAX_REFERENCE_MARKUP_CHARS),
    );
    if (referenceScreen.styles) {
      lines.push(
        "--- reference styles ---",
        clip(referenceScreen.styles, MAX_REFERENCE_STYLES_CHARS),
      );
    }
    lines.push("--- end reference ---");
  }
  return lines.join("\n");
}
