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
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#100d09]">
      {/* Row 1: brand */}
      <div className="mx-auto flex max-w-7xl items-center px-6 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <TerminalIcon />
          <span className="text-lg font-semibold tracking-tight">
            <span className="text-amber-400">~/cli-sessions</span>
            <span className="text-white/40"> $ </span>
            <span>local-cli-sessions</span>
            <span className="term-cursor" aria-hidden>
              █
            </span>
          </span>
        </Link>
      </div>

      {/* Row 2: tool toggle */}
      <div className="flex justify-center pb-1">
        <div className="relative inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
          {/* Sliding highlight behind the active tab. */}
          {thumb && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-1 bottom-1 bg-[#e0a23c] transition-[left,width] duration-300 ease-out"
              style={{ left: thumb.left, width: thumb.width }}
            />
          )}
          {TOOLS.map((t, i) => {
            const active = tool === t.key;
            return (
              <Link
                key={t.key}
                href={t.href}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                className={`relative z-10 inline-flex items-center gap-2 rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                  active ? "text-black" : "text-white/70 hover:text-white"
                }`}
              >
                <BrandMark src={t.logo} alt={t.label} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Row 3: section nav */}
      <nav className="relative flex justify-center gap-8 px-6">
        {sub.map((s, i) => {
          const active = s.key === section;
          return (
            <Link
              key={s.key}
              href={s.href}
              ref={(el) => {
                navRefs.current[i] = el;
              }}
              className={`relative py-2 text-sm font-semibold uppercase tracking-wide transition-colors ${
                active
                  ? "text-amber-400"
                  : "text-sky-300/70 hover:text-sky-200"
              }`}
            >
              {active ? `[ ${s.label} ]` : s.label}
            </Link>
          );
        })}
        {/* Sliding underline that tracks the active section. */}
        {underline && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 h-0.5 bg-[#e0a23c] transition-[left,width] duration-300 ease-out"
            style={{ left: underline.left, width: underline.width }}
          />
        )}
      </nav>
    </header>
  );
}

function TerminalIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#e0a23c"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 17l6-5-6-5" />
      <path d="M12 19h8" />
    </svg>
  );
}

/** Tool brand logo (served from /public). */
function BrandMark({ src, alt }: { src: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      width={18}
      height={18}
      className="h-[18px] w-[18px] object-contain"
    />
  );
}

