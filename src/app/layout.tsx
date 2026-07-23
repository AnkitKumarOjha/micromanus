import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MicroManus — deep research agent",
  description:
    "A deep-research AI agent with live web access, per-thread context, downloadable PDF reports, and bring-your-own-key model support.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
