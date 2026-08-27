"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MeldRevealWipe } from "@/ui/meld/reveal-wipe";

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(query.matches);

    syncPreference();
    query.addEventListener("change", syncPreference);
    return () => query.removeEventListener("change", syncPreference);
  }, []);

  return prefersReducedMotion;
}

type WorkspaceRevealContextValue = {
  /**
   * Navigates to `destination` immediately and, motion permitting, plays a
   * brief full-screen wipe transition across it.
   *
   * There's no real work to mask here -- workspace creation is already
   * durably committed by the time this fires, and the destination's own
   * server fetch is a handful of cheap queries, not a slow provisioning
   * step. So this is a transition, not a loading screen: `reveal` navigates
   * immediately and `MeldRevealWipe` plays for its own fixed, short
   * duration regardless of how fast the destination actually loads.
   *
   * Deliberately mounted at the root layout rather than inside the setup
   * page: a component scoped to that page gets torn down the moment
   * navigation happens, which would leave the wipe with nothing to reveal
   * out to. Living here, it survives the route change.
   */
  reveal: (destination: string) => void;
};

const WorkspaceRevealContext =
  createContext<WorkspaceRevealContextValue | null>(null);

export function useWorkspaceReveal() {
  const context = useContext(WorkspaceRevealContext);
  if (!context) {
    throw new Error(
      "useWorkspaceReveal must be used within a WorkspaceRevealProvider",
    );
  }
  return context;
}

export function WorkspaceRevealProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [active, setActive] = useState(false);

  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const reveal = useCallback((destination: string) => {
    // The real navigation starts now, not after the animation.
    routerRef.current.replace(destination);
    setActive(true);
  }, []);

  // Whether the overlay actually renders is checked here, reactively, rather
  // than only inside `reveal` at call time: `prefersReducedMotion` isn't
  // known for certain until its own effect resolves post-mount, and `reveal`
  // can be called (by a child's effect) before that happens. Gating the JSX
  // on the current value means a late correction still hides the overlay;
  // gating only inside `reveal` would leave it stuck active.
  const showOverlay = active && !prefersReducedMotion;

  const handleRevealComplete = useCallback(() => setActive(false), []);

  return (
    <WorkspaceRevealContext.Provider value={{ reveal }}>
      {children}
      {showOverlay && <MeldRevealWipe onComplete={handleRevealComplete} />}
    </WorkspaceRevealContext.Provider>
  );
}
