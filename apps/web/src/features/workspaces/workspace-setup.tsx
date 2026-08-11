"use client";

import { AppShell } from "@astryxdesign/core/AppShell";
import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { WorkspaceSetupMascot } from "./workspace-setup-mascot";

const SETUP_TIPS = [
  "Invite your team into Rooms to share research, evidence, and decisions.",
  "Mention the Product Agent to ask questions, challenge assumptions, and get direction.",
  "Connect your own Codex or Claude subscription — AI runs on your account, never ours.",
];

const TIP_DURATION_MS = 2000;
const SETUP_DURATION_MS = TIP_DURATION_MS * SETUP_TIPS.length;
// Reserves the height of the longest wrapped tip so the column never shifts.
const TIP_MIN_HEIGHT = "calc(var(--spacing-12) * 1.5)";

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] =
    useState(false);

  useEffect(() => {
    const query = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const syncPreference = () =>
      setPrefersReducedMotion(query.matches);

    syncPreference();
    query.addEventListener("change", syncPreference);
    return () => query.removeEventListener("change", syncPreference);
  }, []);

  return prefersReducedMotion;
}

export function WorkspaceSetup({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const router = useRouter();
  const prefersReducedMotion = usePrefersReducedMotion();
  // The first tip is visible on arrival; each later tip fades itself in.
  const [tip, setTip] = useState({ index: 0, isVisible: true });
  const destination = `/${workspaceId}`;

  useEffect(() => {
    let revealTip: ReturnType<typeof setTimeout> | undefined;
    let nextTipIndex = 1;
    const advanceTip = setInterval(() => {
      setTip({
        index: nextTipIndex,
        isVisible: false,
      });
      revealTip = setTimeout(
        () => setTip((current) => ({ ...current, isVisible: true })),
        0,
      );

      nextTipIndex += 1;
      if (nextTipIndex >= SETUP_TIPS.length) {
        clearInterval(advanceTip);
      }
    }, TIP_DURATION_MS);

    return () => {
      clearInterval(advanceTip);
      if (revealTip) clearTimeout(revealTip);
    };
  }, []);

  // Held in a ref so re-rendering a tip never restarts the six-second budget.
  const routerRef = useRef(router);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    routerRef.current.prefetch(destination);
    const enterWorkspace = setTimeout(
      () => routerRef.current.replace(destination),
      SETUP_DURATION_MS,
    );

    return () => clearTimeout(enterWorkspace);
  }, [destination]);

  return (
    <AppShell height="auto" variant="wash" contentPadding={4}>
      <Center
        width="100%"
        minHeight="calc(100dvh - var(--spacing-8))"
      >
        <VStack
          gap={4}
          hAlign="center"
          width="100%"
          maxWidth="calc(var(--spacing-12) * 9)"
        >
          <WorkspaceSetupMascot
            prefersReducedMotion={prefersReducedMotion}
          />
          <VStack gap={1} hAlign="center" minHeight={TIP_MIN_HEIGHT}>
            <Heading
              level={1}
              type="display-3"
              justify="center"
              textWrap="balance"
            >
              Setting up your workspace.
            </Heading>
            <Text
              type="body"
              color="secondary"
              display="block"
              justify="center"
              textWrap="balance"
              aria-live="polite"
              style={{
                opacity: tip.isVisible ? 1 : 0,
                transition: prefersReducedMotion
                  ? undefined
                  : "opacity var(--duration-medium) var(--ease-standard)",
              }}
            >
              {SETUP_TIPS[tip.index]}
            </Text>
          </VStack>
        </VStack>
      </Center>
    </AppShell>
  );
}
