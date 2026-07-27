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
    >
      {children}
    </AppShell>
  );
}
