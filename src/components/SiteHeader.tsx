"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Tool = "claude" | "codex" | "gemini";
type Section = "projects" | "search" | "stats";

const TOOLS: { key: Tool; href: string; label: string; logo: string }[] = [
  { key: "claude", href: "/", label: "Claude", logo: "/claudecode-logo.png" },
  { key: "codex", href: "/codex", label: "Codex", logo: "/codex-logo.png" },
  { key: "gemini", href: "/gemini", label: "Gemini", logo: "/gemini-logo.png" },
];

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const tool: Tool =
    pathname === "/codex" || pathname.startsWith("/codex/")
      ? "codex"
      : pathname === "/gemini" || pathname.startsWith("/gemini/")
        ? "gemini"
        : "claude";

  // Sliding highlight: a single "thumb" that animates to the active tab.
  // SiteHeader lives in the layout, so it survives route changes — the
  // thumb transitions smoothly as `tool` updates from usePathname().
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(
    null,
  );

  useEffect(() => {
    const measure = () => {
      const idx = TOOLS.findIndex((t) => t.key === tool);
      const el = tabRefs.current[idx];
      if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [tool]);

  const section: Section = pathname.includes("/search")
    ? "search"
    : pathname.includes("/stats")
      ? "stats"
      : "projects";

  // Same sliding treatment for the section underline.
  const navRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [underline, setUnderline] = useState<{
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    const measure = () => {
      const idx = ["projects", "search", "stats"].indexOf(section);
      const el = navRefs.current[idx];
      if (el) setUnderline({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [section, tool]);

  const base = tool === "claude" ? "" : `/${tool}`;
  const sub: { key: Section; label: string; href: string }[] = [
    { key: "projects", label: "Projects", href: `${base}/` || "/" },
    { key: "search", label: "Search", href: `${base}/search` },
    { key: "stats", label: "Stats", href: `${base}/stats` },
  ];

  return (
    // Solid, not translucent: the token colours are var()-based, so Tailwind
    // alpha modifiers (bg-bg/90) silently compile to nothing.
    <header className="sticky top-0 z-30 border-b border-line bg-bg">
      {/* Row 1: brand left, tool switcher right. */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 pb-3 pt-4">
        <Link
          href="/"
          className="flex items-baseline gap-2 text-[15px] font-semibold text-fg transition-opacity hover:opacity-80"
        >
          <span aria-hidden className="text-accent">
            $
          </span>
          cli-sessions
        </Link>

        <div className="relative inline-flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
          {/* Sliding highlight behind the active tab. */}
          {thumb && (
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-1 top-1 rounded-md bg-surface-2 ring-1 ring-line-strong transition-[left,width] duration-300 ease-out"
              style={{ left: thumb.left, width: thumb.width }}
            />
          )}
          {TOOLS.map((t, i) => {
            const active = tool === t.key;
            return (
              <Link
                key={t.key}
                href={t.href}
                aria-current={active ? "page" : undefined}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                className={`relative z-10 inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  active ? "text-fg" : "text-faint hover:text-muted"
                }`}
              >
                <BrandMark src={t.logo} alt="" dim={!active} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Row 2: section nav, left-aligned under the brand. */}
      <nav
        aria-label="Sections"
        className="relative mx-auto flex max-w-7xl gap-6 px-6"
      >
        {sub.map((s, i) => {
          const active = s.key === section;
          return (
            <Link
              key={s.key}
              href={s.href}
              aria-current={active ? "page" : undefined}
              ref={(el) => {
                navRefs.current[i] = el;
              }}
              className={`relative -mb-px border-b-2 border-transparent py-2.5 text-[13px] font-medium transition-colors ${
                active ? "text-fg" : "text-faint hover:text-muted"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
        {/* Sliding underline that tracks the active section. */}
        {underline && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 h-0.5 bg-accent transition-[left,width] duration-300 ease-out"
            style={{ left: underline.left, width: underline.width }}
          />
        )}
      </nav>
    </header>
  );
}

/** Tool brand logo (served from /public). Decorative — the label names it. */
function BrandMark({
  src,
  alt,
  dim,
}: {
  src: string;
  alt: string;
  dim: boolean;
}) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      width={16}
      height={16}
      aria-hidden={alt === "" ? true : undefined}
      className={`h-4 w-4 object-contain transition-opacity ${
        dim ? "opacity-50" : "opacity-100"
      }`}
    />
  );
}
