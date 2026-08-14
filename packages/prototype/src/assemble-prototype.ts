import {
  buildPrototypeDocument,
  type PrototypeDocumentInput,
} from "./prototype-document";
import {
  findScreenSafetyViolations,
  type ScreenSafetyFinding,
} from "./screen-safety";
import { stripCdataWrapper } from "./screen-normalize";

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
  // Normalize before validating and assembling, so a model-added CDATA wrapper
  // is gone by the time safety inspects the markup and the document is built --
  // this also repairs already-persisted versions read back through this path.
  const screens = input.screens.map((screen) => ({
    ...screen,
    markup: stripCdataWrapper(screen.markup),
    styles: stripCdataWrapper(screen.styles),
  }));

  const violations: ScreenSafetyViolation[] = [];

  for (const screen of screens) {
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

  return buildPrototypeDocument({ ...input, screens });
}
