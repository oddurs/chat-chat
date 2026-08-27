import Link from "next/link";
import { listConversations } from "@/lib/logs";
import { Avatar } from "@/lib/profiles";

export const dynamic = "force-dynamic";

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

export default async function Search({ searchParams }: PageProps<"/search">) {
  const p = await searchParams;
  const q = typeof p?.q === "string" ? p.q.trim() : "";

  const hits = q
    ? listConversations().flatMap((c) =>
        c.turns
          .map((t) => ({ c, t, s: snippet(t.content, q) }))
          .filter((h) => h.s !== null)
          .slice(0, 8),
      )
    : [];

  return (
    <div className="flex flex-col gap-5">
      <form action="/search" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="search every transcript…"
          className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-[15px] text-ink outline-none placeholder:text-faint focus:border-faint"
        />
      </form>

      {q && (
        <p className="text-[12px] tracking-wide text-faint uppercase">
          {hits.length} match{hits.length === 1 ? "" : "es"} for “{q}”
        </p>
      )}

      <div className="flex flex-col gap-3">
        {hits.map(({ c, t, s }) => (
          <Link
            key={`${c.id}-${t.idx}`}
            href={`/c/${c.id}#turn-${t.idx}`}
            className="rounded-xl border border-line bg-panel p-4 transition-colors hover:bg-raised"
          >
            <div className="mb-2 flex items-center gap-2 text-[12px] text-faint">
              <Avatar model={t.model} size={18} />
              <span className="text-muted">{t.name}</span>
              <span className="font-mono">#{t.idx}</span>
              <span className="text-line">·</span>
              <span className="font-mono">{c.config.name}</span>
            </div>
            <p className="text-[14px] leading-relaxed text-muted">
              {s!.before}
              <mark className="rounded bg-accent/25 px-0.5 text-ink">{s!.hit}</mark>
              {s!.after}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
