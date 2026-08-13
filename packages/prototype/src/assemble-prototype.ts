import {
  buildPrototypeDocument,
  type PrototypeDocumentInput,
} from "./prototype-document";
import {
  findScreenSafetyViolations,
  type ScreenSafetyFinding,
} from "./screen-safety";

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

// No screen with a safety violation is ever assembled into a rendered
// document. Findings are collected first so callers can report every unsafe
// screen in a single pass.
export function assembleValidatedPrototype(
  input: PrototypeDocumentInput,
): string {
  const violations: ScreenSafetyViolation[] = [];

  for (const screen of input.screens) {
    const findings = findScreenSafetyViolations({
      markup: screen.markup,
      styles: screen.styles,
      script: screen.script,
      actions: screen.actions,
    });
    if (findings.length > 0) {
      violations.push({ screenId: screen.id, findings });
    }
  }

  if (violations.length > 0) {
    throw new PrototypeSafetyError(violations);
  }

  return buildPrototypeDocument(input);
}
