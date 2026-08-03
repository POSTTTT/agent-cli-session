import "./globals.css";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Local CLI Sessions",
  description:
    "Browse, search and clean up Claude Code, Codex and Gemini CLI session logs stored on this machine.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <a href="#content" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        <main id="content" className="mx-auto max-w-7xl px-6 py-10">
          {children}
        </main>
      </body>
    </html>
  );
}
