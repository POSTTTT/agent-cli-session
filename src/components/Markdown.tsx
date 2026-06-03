import React from "react";

export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocksCached(text);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  );
}

/* parseBlocks is pure, but Markdown re-renders whenever its parent does.
   Cache parsed output by source text so a parent re-render (filter toggle,
   expanding one card) doesn't re-tokenize every message. Bounded so it
   can't grow without limit on huge transcripts. */
const PARSE_CACHE = new Map<string, Block[]>();
const PARSE_CACHE_MAX = 2000;

function parseBlocksCached(text: string): Block[] {
  const hit = PARSE_CACHE.get(text);
  if (hit) return hit;
  const blocks = parseBlocks(text);
  if (PARSE_CACHE.size >= PARSE_CACHE_MAX) {
    // Drop the oldest entry (Map preserves insertion order).
    const oldest = PARSE_CACHE.keys().next().value;
    if (oldest !== undefined) PARSE_CACHE.delete(oldest);
  }
  PARSE_CACHE.set(text, blocks);
  return blocks;
}

/* ---------- block parser ---------- */

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; level: number; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; lang: string; text: string }
  | { kind: "quote"; text: string };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] ?? "";
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      out.push({ kind: "code", lang, text: buf.join("\n") });
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      out.push({ kind: "h", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push({ kind: "quote", text: buf.join("\n") });
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push({ kind: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push({ kind: "ol", items });
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph (collect until blank or block boundary)
    const buf: string[] = [line];
    i++;
    while (i < lines.length) {
      const nxt = lines[i];
      if (
        nxt.trim() === "" ||
        /^```/.test(nxt) ||
        /^#{1,6}\s/.test(nxt) ||
        /^>\s?/.test(nxt) ||
        /^\s*[-*]\s+/.test(nxt) ||
        /^\s*\d+\.\s+/.test(nxt)
      )
        break;
      buf.push(nxt);
      i++;
    }
    out.push({ kind: "p", text: buf.join("\n") });
  }
  return out;
}

function renderBlock(b: Block, key: number): React.ReactNode {
  switch (b.kind) {
    case "h": {
      const cls =
        b.level <= 2
          ? "text-base font-semibold"
          : b.level === 3
            ? "text-sm font-semibold"
            : "text-sm font-medium";
      return (
        <div key={key} className={cls}>
          {renderInline(b.text)}
        </div>
      );
    }
    case "code":
      return (
        <pre
          key={key}
          className="overflow-auto rounded-md border border-white/10 bg-black/40 p-2 font-mono text-[11px] leading-snug text-white/80"
        >
          {b.text}
        </pre>
      );
    case "ul":
      return (
        <ul key={key} className="ml-1 list-disc space-y-0.5 pl-4">
          {b.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={key} className="ml-1 list-decimal space-y-0.5 pl-5">
          {b.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote
          key={key}
          className="border-l-2 border-white/20 pl-3 text-white/70"
        >
          {renderInline(b.text)}
        </blockquote>
      );
    case "p":
    default:
      return (
        <p key={key} className="whitespace-pre-wrap break-words">
          {renderInline(b.text)}
        </p>
      );
  }
}

/* ---------- inline parser: code, bold, italic, links ---------- */

function renderInline(text: string): React.ReactNode[] {
  // Walk the string and emit a list of React nodes.
  const out: React.ReactNode[] = [];
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = "";
    }
  };

  while (i < text.length) {
    const ch = text[i];

    // Inline code: `...`
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        out.push(
          <code
            key={out.length}
            className="rounded bg-white/10 px-1 py-[1px] font-mono text-[12px] text-amber-200"
          >
            {text.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }

    // Bold: **...**
    if (ch === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        out.push(
          <strong key={out.length} className="font-semibold text-white">
            {renderInline(text.slice(i + 2, end))}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    }

    // Italic: *...* or _..._
    if ((ch === "*" || ch === "_") && text[i + 1] !== ch) {
      const end = text.indexOf(ch, i + 1);
      if (end !== -1 && end > i + 1) {
        const inner = text.slice(i + 1, end);
        // Skip pathological cases like "_a_b_c" where the closing _ is mid-word.
        if (!/\s/.test(inner[0]) && !/\s/.test(inner[inner.length - 1])) {
          flush();
          out.push(
            <em key={out.length} className="italic">
              {renderInline(inner)}
            </em>,
          );
          i = end + 1;
          continue;
        }
      }
    }

    // Link: [text](url)
    if (ch === "[") {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(text.slice(i));
      if (linkMatch) {
        flush();
        out.push(
          <a
            key={out.length}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="text-sky-300 underline hover:text-sky-200"
          >
            {linkMatch[1]}
          </a>,
        );
        i += linkMatch[0].length;
        continue;
      }
    }

    buf += ch;
    i++;
  }
  flush();
  return out;
}
