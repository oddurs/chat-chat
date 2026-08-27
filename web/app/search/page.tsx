"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { asset } from "@/lib/paths";
import { Avatar } from "@/lib/profiles";

type Row = { id: string; config: string; idx: number; name: string; model: string | null; content: string };

/** A window around the first hit, with the hit marked. */
function snippet(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return null;
  const start = Math.max(0, i - 100);
  const end = Math.min(text.length, i + q.length + 180);
  return {
    before: (start > 0 ? "…" : "") + text.slice(start, i),
    hit: text.slice(i, i + q.length),
    after: text.slice(i + q.length, end) + (end < text.length ? "…" : ""),
  };
}

export default function Search() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");

  // The transcripts are a few megabytes, so they load only when someone opens search.
  useEffect(() => {
    fetch(asset("/data/search.json"))
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const hits = useMemo(() => {
    if (!rows || q.trim().length < 2) return [];
    const seen = new Map<string, number>();
    const out: { row: Row; s: NonNullable<ReturnType<typeof snippet>> }[] = [];
    for (const row of rows) {
      const s = snippet(row.content, q.trim());
      if (!s) continue;
      const n = seen.get(row.id) ?? 0;
      if (n >= 8) continue; // never let one conversation flood the page
      seen.set(row.id, n + 1);
      out.push({ row, s });
      if (out.length >= 120) break;
    }
    return out;
  }, [rows, q]);

  return (
    <div className="flex flex-col gap-5">
      <input
        value={q}
        autoFocus
        onChange={(e) => setQ(e.target.value)}
        placeholder={rows ? `search ${rows.length.toLocaleString()} turns…` : "loading transcripts…"}
        className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-[15px] text-ink outline-none placeholder:text-faint focus:border-faint"
      />

      {q.trim().length >= 2 && (
        <p className="text-[12px] tracking-wide text-faint uppercase">
          {hits.length} match{hits.length === 1 ? "" : "es"} for “{q.trim()}”
        </p>
      )}

      <div className="flex flex-col gap-3">
        {hits.map(({ row, s }) => (
          <Link
            key={`${row.id}-${row.idx}`}
            href={`/c/${row.id}#turn-${row.idx}`}
            className="rounded-xl border border-line bg-panel p-4 transition-colors hover:bg-raised"
          >
            <div className="mb-2 flex items-center gap-2 text-[12px] text-faint">
              <Avatar model={row.model} size={18} />
              <span className="text-muted">{row.name}</span>
              <span className="font-mono">#{row.idx}</span>
              <span className="text-line">·</span>
              <span className="font-mono">{row.config}</span>
            </div>
            <p className="text-[14px] leading-relaxed text-muted">
              {s.before}
              <mark className="rounded bg-accent/25 px-0.5 text-ink">{s.hit}</mark>
              {s.after}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
