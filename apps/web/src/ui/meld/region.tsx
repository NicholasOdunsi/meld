import type { ReactNode } from "react";

export type MeldRegionProps = {
  /**
   * A class from the *calling surface's* own CSS module. This is the one
   * primitive that takes a caller-owned class, and it exists for a narrow
   * reason: a composed plane like the deck positions its regions against a
   * grid that only that surface knows about, so the layout belongs in
   * `deck.module.css`, not in this directory.
   */
  className?: string;
  /** Passthrough so a region can be targeted from a test. */
  "data-testid"?: string;
  children: ReactNode;
};

/**
 * An unstyled positioned box.
 *
 * Feature code may not write a raw `<div>` (`scripts/check-astryx-conventions.mjs`
 * rejects it outside this directory), and `MeldStack` and friends only cover
 * flow layouts. `MeldRegion` covers the rest: it renders one element and
 * contributes no styling of its own, so the surface's module owns the
 * geometry.
 *
 * It is deliberately not a general escape hatch for colour or type -- those
 * still come from tokens, and a module that reaches for a literal hex or `px`
 * fails the conventions check wherever it lives.
 */
export function MeldRegion({
  className,
  "data-testid": testId,
  children,
}: MeldRegionProps) {
  return (
    <div className={className} data-testid={testId}>
      {children}
    </div>
  );
}
