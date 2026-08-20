"use client";

import { LinkProvider } from "@astryxdesign/core/Link";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { ArchiveArrowUp } from "@boxicons/react";
import NextLink from "next/link";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

type AppLinkProps = ComponentPropsWithoutRef<typeof NextLink> & {
  to?: ComponentPropsWithoutRef<typeof NextLink>["href"];
};

const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
  { to: routerAgnosticHref, ...props },
  ref,
) {
  // Astryx supplies `to` for router compatibility. Next uses `href` only.
  void routerAgnosticHref;
  return <NextLink {...props} ref={ref} />;
});

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
    <Theme theme={meldTheme} mode="light">
      <LinkProvider component={AppLink}>{children}</LinkProvider>
    </Theme>
  );
}
