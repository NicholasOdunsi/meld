import type { Metadata } from "next";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import { DesktopOnlyGate } from "@/ui/desktop-only-gate";
import { AstryxProvider } from "./astryx-provider";

export const metadata: Metadata = {
  title: "Meld",
  description: "Personal AI product lifecycle",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AstryxProvider>
          <DesktopOnlyGate>{children}</DesktopOnlyGate>
        </AstryxProvider>
      </body>
    </html>
  );
}
