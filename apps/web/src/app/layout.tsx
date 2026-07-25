import type { Metadata } from "next";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
