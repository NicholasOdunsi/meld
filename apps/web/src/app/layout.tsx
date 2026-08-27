import type { Metadata } from "next";
import { Archivo, Pixelify_Sans } from "next/font/google";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import "@/ui/meld/tokens.css";
import "./global.css";
import { WorkspaceRevealProvider } from "@/features/workspaces/workspace-reveal-provider";
import { DesktopOnlyGate } from "@/ui/desktop-only-gate";
import { AstryxProvider } from "./astryx-provider";

// Brand typography. Archivo is the legible workhorse -- loaded as the variable
// font with the `wdth` axis so Expanded display type comes from the same file
// instead of a second family. Pixelify Sans is the pixel voice, reserved for
// metadata and labels. `global.css` maps both onto the theme's font tokens.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--meld-font-archivo",
  display: "swap",
});

const pixelifySans = Pixelify_Sans({
  subsets: ["latin"],
  variable: "--meld-font-pixelify",
  display: "swap",
});

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
    // `data-theme` is set here rather than left to the client Theme provider so
    // the server-rendered HTML already carries the mode -- Astryx's reset keys
    // `color-scheme` off it, and without it browser chrome flashes dark before
    // hydration.
    <html
      lang="en"
      data-theme="light"
      className={`${archivo.variable} ${pixelifySans.variable}`}
      suppressHydrationWarning
    >
      <body>
        <AstryxProvider>
          <DesktopOnlyGate>
            <WorkspaceRevealProvider>{children}</WorkspaceRevealProvider>
          </DesktopOnlyGate>
        </AstryxProvider>
      </body>
    </html>
  );
}
