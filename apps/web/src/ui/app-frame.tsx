import { AppShell } from "@astryxdesign/core/AppShell";
import { Section } from "@astryxdesign/core/Section";
import type { ReactNode } from "react";

export function AppFrame({
  navigation,
  children,
  nativeGlass = false,
}: {
  // null inside the Orion Mac app, which draws its own native sidebar.
  navigation: ReactNode | null;
  children: ReactNode;
  // Orion Mac paints WindowGlass behind the page; drop solid fills so it shows.
  nativeGlass?: boolean;
}) {
  // Responsive contract:
  //   > 1024px  workspace rail | nav 256 | content | inspector 380
  //   <= 1024px inspector overlays content
  //   <= 768px  navigation collapses into AppShell mobile navigation
  return (
    <Section
      variant="transparent"
      height="100%"
      padding={0}
      {...(nativeGlass
        ? ({ "data-orion-native-glass": "true" } as Record<string, string>)
        : {})}
    >
      <AppShell
        height="fill"
        variant="section"
        contentPadding={0}
        sideNav={navigation ?? undefined}
        // "fill" mode is a fixed 100dvh shell: the sideNav and content panels
        // own their scroll internally (each has its own overflow-y: auto), so
        // the shell itself never needs to scroll. Without this, content that
        // overflows a panel's width bleeds out and drags the whole page into
        // a horizontal scroll instead of clipping at the panel boundary.
        style={{
          overflow: "hidden",
          ...(nativeGlass
            ? { backgroundColor: "transparent", background: "transparent" }
            : null),
        }}
      >
        {children}
      </AppShell>
    </Section>
  );
}
