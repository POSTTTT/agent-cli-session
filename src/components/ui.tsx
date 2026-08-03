import Link from "next/link";

/**
 * Shared page furniture. The claude / codex / gemini routes are three copies
 * of the same three pages, so the chrome lives here once — restyle in one
 * place, all nine pages follow.
 */

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-7">
      <h1 className="text-[28px] font-semibold leading-tight">{title}</h1>
      {children && (
        <p className="mt-2 max-w-[68ch] text-[13px] leading-relaxed text-muted">
          {children}
        </p>
      )}
    </header>
  );
}

/** One bordered panel split into cells, not a row of identical cards. */
export function StatPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface md:flex-row md:divide-x md:divide-y-0">
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 px-5 py-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
        {label}
      </div>
      <div className="mt-1.5 font-mono text-[22px] font-medium tabular-nums text-fg">
        {value}
      </div>
    </div>
  );
}

export function SearchForm({
  action,
  q,
  placeholder,
}: {
  action: string;
  q: string;
  placeholder: string;
}) {
  return (
    <form action={action} className="flex gap-2">
      <input
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-fg outline-none transition-colors hover:border-line-strong focus:border-accent"
        autoFocus
      />
      <button
        type="submit"
        className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-bg transition-transform hover:opacity-90 active:scale-[0.98]"
      >
        Search
      </button>
    </form>
  );
}

/** Results as one divided list — avoids a stack of look-alike cards. */
export function ResultList({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {children}
    </div>
  );
}

export function ResultRow({
  href,
  path,
  meta,
  snippet,
}: {
  href: string;
  path: string;
  meta: string;
  snippet: string;
}) {
  return (
    <Link
      href={href}
      className="block px-4 py-3 transition-colors hover:bg-surface-2"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-xs text-accent">{path}</span>
        <span
          className="font-mono text-[11px] text-faint"
          suppressHydrationWarning
        >
          {meta}
        </span>
      </div>
      <div className="mt-1.5 truncate text-[13px] text-muted">…{snippet}…</div>
    </Link>
  );
}

/** Composed placeholder for "nothing here yet" and "nothing matched". */
export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      <p className="text-sm text-muted">{title}</p>
      {hint && <p className="mt-1.5 text-[13px] text-faint">{hint}</p>}
    </div>
  );
}
