"use client";

import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { ArchiveArrowUp } from "@boxicons/react";
import type { ReactNode } from "react";

const meldTheme = {
  ...neutralTheme,
  icons: {
    ...neutralTheme.icons,
    arrowUp: (
      <ArchiveArrowUp
        width="1em"
        height="1em"
        fill="currentColor"
        removePadding
      />
    ),
  },
};

export function AstryxProvider({ children }: { children: ReactNode }) {
  return (
    <Theme theme={meldTheme} mode="system">
      {children}
    </Theme>
  );
}
