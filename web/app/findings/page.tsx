import Link from "next/link";
import { allFindings, bodyTurns } from "@/lib/logs";
import { Avatar, modelProfile } from "@/lib/profiles";
import { ProseLine } from "@/components/prose";

export const dynamic = "force-dynamic";

export default async function Findings({ searchParams }: PageProps<"/findings">) {
  const p = await searchParams;
  const tag = typeof p?.tag === "string" ? p.tag : null;
  const model = typeof p?.model === "string" ? p.model : null;
  const config = typeof p?.config === "string" ? p.config : null;

  let rows = allFindings();
  const tally = new Map<string, number>();
  for (const { finding } of rows) tally.set(finding.tag, (tally.get(finding.tag) ?? 0) + 1);
  const topTags = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);

  if (tag) rows = rows.filter((r) => r.finding.tag === tag);
  if (config) rows = rows.filter((r) => r.conversation.config.name === config);
  if (model)
    rows = rows.filter((r) =>
      [r.conversation.config.a.model, r.conversation.config.b.model].includes(model),
    );

  const models = [
    ...new Set(allFindings().flatMap((r) => [r.conversation.config.a.model, r.conversation.config.b.model])),
  ].sort();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="mr-1 tracking-wide text-faint uppercase">{rows.length} findings</span>
        {(tag || model || config) && (
          <Link href="/findings" className="rounded-md border border-line px-2 py-0.5 text-faint hover:text-ink">
            clear
          </Link>
        )}
        {topTags.map(([t, n]) => (
          <Link
            key={t}
            href={tag === t ? "/findings" : `/findings?tag=${encodeURIComponent(t)}`}
            className={`rounded-md border px-2 py-0.5 ${
              tag === t ? "border-accent/40 bg-accent/12 text-accent" : "border-line text-faint hover:text-muted"
            }`}
          >
            {t} <span className="text-faint">{n}</span>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        {models.map((m) => (
          <Link
            key={m}
            href={model === m ? "/findings" : `/findings?model=${encodeURIComponent(m)}`}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono ${
              model === m ? "border-accent/40 bg-accent/12 text-accent" : "border-line text-faint hover:text-muted"
            }`}
          >
            <Avatar model={m} size={14} />
            {modelProfile(m).name}
          </Link>
        ))}
      </div>

      {rows.length === 0 && (
        <p className="rounded-xl border border-line bg-panel p-6 text-[14px] text-muted">
          Nothing matches. Judged findings appear here after{" "}
          <code className="font-mono text-accent">./chatchat.py analyze</code>.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {rows.map(({ finding: f, conversation: c }, i) => (
          <article key={`${c.id}-${i}`} className="rounded-xl border border-line bg-panel p-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[15px] font-medium text-accent">{f.tag}</span>
              {f.votes && f.votes.length > 1 && (
                <span
                  className="rounded-full border border-accent/35 bg-accent/10 px-2 py-0.5 text-[11px] text-accent"
                  title={f.votes.join(", ")}
                >
                  {f.votes.length} judges agree
                </span>
              )}
              <Link
                href={`/c/${c.id}`}
                className="ml-auto font-mono text-[12px] text-faint hover:text-muted"
              >
                {c.config.name}
              </Link>
            </div>

            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              <ProseLine text={f.why} />
            </p>
            <p className="mt-2.5 border-l-2 border-accent/40 pl-3.5 text-[15px] leading-relaxed text-ink italic">
              “<ProseLine text={f.quote.trim()} />”
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-faint">
              <Avatar model={c.config.a.model} size={18} />
              <span className="font-mono">{modelProfile(c.config.a.model).name}</span>
              <span className="text-line">×</span>
              <Avatar model={c.config.b.model} size={18} />
              <span className="font-mono">{modelProfile(c.config.b.model).name}</span>
              <span className="text-line">·</span>
              <span>{bodyTurns(c).length} turns</span>
              {f.alt_tags && f.alt_tags.length > 0 && (
                <span className="text-faint" title="what other judges called it">
                  also: {f.alt_tags.join(", ")}
                </span>
              )}
              <span className="ml-auto flex gap-2">
                {f.turns.map((t) => (
                  <Link key={t} href={`/c/${c.id}#turn-${t}`} className="font-mono hover:text-accent">
                    open #{t} →
                  </Link>
                ))}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
