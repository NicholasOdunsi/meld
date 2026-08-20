"use client";

import { useEffect, useRef } from "react";
import { useWorkspaceReveal } from "./workspace-reveal-provider";

/**
 * Kicks off the transition into a freshly created workspace and gets out of
 * the way. All of the actual visual -- the mascot, the rotating tips, the
 * dig-reveal field -- lives in `WorkspaceRevealProvider`, mounted at the root
 * layout so it survives the navigation `reveal` triggers below rather than
 * being torn down with this page. See that file for why: this page cannot
 * itself be the thing revealed, or the destination only starts loading after
 * the animation finishes instead of hidden behind it.
 */
export function WorkspaceSetup({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { reveal } = useWorkspaceReveal();
  const destination = `/${workspaceId}`;

  // Guards against `reveal` firing twice if its identity changes (e.g. once
  // `prefers-reduced-motion` resolves) before this component unmounts.
  const hasRevealedRef = useRef(false);

  useEffect(() => {
    if (hasRevealedRef.current) return;
    hasRevealedRef.current = true;
    reveal(destination);
  }, [reveal, destination]);

  return null;
}
