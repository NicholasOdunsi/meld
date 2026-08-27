"use client";

import { AppShell } from "@astryxdesign/core/AppShell";
import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import Image from "next/image";
import type { ReactNode } from "react";
import styles from "./desktop-only-gate.module.css";

export function MobileUnavailableMessage() {
  return (
    <AppShell height="auto" variant="wash" contentPadding={4}>
      <Center
        width="100%"
        minHeight="calc(100dvh - var(--spacing-8))"
      >
        <VStack
          gap={4}
          width="100%"
          maxWidth="calc(var(--spacing-12) * 7)"
          hAlign="center"
        >
          <Image
            src="/meld-mark.svg"
            alt=""
            width={48}
            height={48}
            priority
          />
          <VStack gap={1} hAlign="center">
            <Heading level={1} justify="center">
              Please use Meld on desktop
            </Heading>
            <Text
              type="body"
              color="secondary"
              display="block"
              justify="center"
              textWrap="balance"
            >
              The web app is not available on mobile yet.
            </Text>
          </VStack>
        </VStack>
      </Center>
    </AppShell>
  );
}

export function DesktopOnlyGate({ children }: { children: ReactNode }) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  return (
    <VStack className={styles.root} width="100%" height="100%">
      <VStack
        className={styles.content}
        width="100%"
        height="100%"
        aria-hidden={isMobile || undefined}
        style={{ visibility: isMobile ? "hidden" : "visible" }}
      >
        {children}
      </VStack>
      {isMobile ? (
        <VStack className={styles.mobileOverlay} width="100%" height="100%">
          <MobileUnavailableMessage />
        </VStack>
      ) : null}
    </VStack>
  );
}
