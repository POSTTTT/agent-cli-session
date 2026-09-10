import "./globals.css";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { lastActivityByTool } from "@/lib/lastactivity";

export const metadata: Metadata = {
  title: "Local CLI Sessions",
  description: "Manage Claude Code and Codex session logs",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const activity = await lastActivityByTool();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <SiteHeader activity={activity} />
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
