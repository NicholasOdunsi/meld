import {
  buildPrototypeDocument,
  type PrototypeDocumentInput,
} from "./prototype-document";
import {
  findScreenSafetyViolations,
  type ScreenSafetyFinding,
} from "./screen-safety";
import { stripCdataWrapper } from "./screen-normalize";
import {
  enforceDesignSystem,
  type ConformanceFinding,
} from "./design-system-conformance";

type ScreenSafetyViolation = {
  screenId: string;
  findings: ScreenSafetyFinding[];
};

export class PrototypeSafetyError extends Error {
  override readonly name = "PrototypeSafetyError";
  readonly violations: ScreenSafetyViolation[];

  constructor(violations: ScreenSafetyViolation[]) {
    super(`prototype has ${violations.length} unsafe screen(s)`);
    this.violations = violations;
  }
}

export type PrototypeConformance = {
  html: string;
  findings: ConformanceFinding[];
  corrections: number;
};

// No screen with a safety violation is ever assembled into a rendered
// document. Findings are collected first so callers can report every unsafe
// screen in a single pass.
//
// Conformance is applied here rather than at generation time so it also
// repairs screens already stored -- the same reasoning as the browser-side
// image repair. The generator is still told the rule; this is the backstop.
export function assemblePrototypeWithConformance(
  input: PrototypeDocumentInput,
): PrototypeConformance {
  const findings: ConformanceFinding[] = [];
  let corrections = 0;

  // Normalize before validating and assembling, so a model-added CDATA wrapper
  // is gone by the time safety inspects the markup and the document is built --
  // this also repairs already-persisted versions read back through this path.
  const screens = input.screens.map((screen) => {
    const markup = stripCdataWrapper(screen.markup);
    const conformed = enforceDesignSystem({
      styles: stripCdataWrapper(screen.styles),
      tokenCss: input.tokenCss,
    });
    findings.push(...conformed.findings);
    corrections += conformed.corrections;
    return { ...screen, markup, styles: conformed.styles };
  });

  const violations: ScreenSafetyViolation[] = [];

  for (const screen of screens) {
    const screenFindings = findScreenSafetyViolations({
      markup: screen.markup,
      styles: screen.styles,
      script: screen.script,
      actions: screen.actions,
    });
    if (screenFindings.length > 0) {
      violations.push({ screenId: screen.id, findings: screenFindings });
    }
  }

  if (violations.length > 0) {
    throw new PrototypeSafetyError(violations);
  }

  return {
    html: buildPrototypeDocument({ ...input, screens }),
    findings,
    corrections,
  };
}

export function assembleValidatedPrototype(
  input: PrototypeDocumentInput,
): string {
  return assemblePrototypeWithConformance(input).html;
}
