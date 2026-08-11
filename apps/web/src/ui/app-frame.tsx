import { AppShell } from "@astryxdesign/core/AppShell";
import type { ReactNode } from "react";

export function AppFrame({
  navigation,
  children,
}: {
  navigation: ReactNode;
  children: ReactNode;
}) {
  // Responsive contract:
  //   > 1024px  workspace rail | nav 256 | content | inspector 380
  //   <= 1024px inspector overlays content
  //   <= 768px  navigation collapses into AppShell mobile navigation
  return (
    <AppShell
      height="fill"
      variant="section"
      contentPadding={0}
      sideNav={navigation}
      // "fill" mode is a fixed 100dvh shell: the sideNav and content panels
      // own their scroll internally (each has its own overflow-y: auto), so
      // the shell itself never needs to scroll. Without this, content that
      // overflows a panel's width bleeds out and drags the whole page into
      // a horizontal scroll instead of clipping at the panel boundary.
      style={{ overflow: "hidden" }}
    >
      {children}
    </AppShell>
  );
}
