import { AppShell } from "@astryxdesign/core/AppShell";
import { SideNav } from "@astryxdesign/core/SideNav";
import type { ReactNode } from "react";

export function AppFrame({
  navigation,
  children,
}: {
  navigation: ReactNode;
  children: ReactNode;
}) {
  // Responsive contract:
  //   > 1024px  nav 256 | content | inspector 380
  //   <= 1024px inspector overlays content
  //   <= 768px  nav collapses into AppShell mobile navigation
  return (
    <AppShell
      height="fill"
      variant="section"
      contentPadding={0}
      sideNav={
        <SideNav
          collapsible
          resizable={{
            defaultWidth: 256,
            minWidth: 220,
            maxWidth: 320,
            autoSaveId: "meld-side-nav",
          }}
        >
          {navigation}
        </SideNav>
      }
    >
      {children}
    </AppShell>
  );
}
