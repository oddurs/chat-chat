import Link from "next/link";
import { allFindings, bodyTurns } from "@/lib/logs";
import { familyOf, blurbOf, FAMILIES, OTHER } from "@/lib/phenomena";
import { Avatar, modelProfile } from "@/lib/profiles";
import { ProseLine } from "@/components/prose";

export const dynamic = "force-dynamic";

export default async function Findings({ searchParams }: PageProps<"/findings">) {
  const p = await searchParams;
  const family = typeof p?.family === "string" ? p.family : null;
  const model = typeof p?.model === "string" ? p.model : null;

  const all = allFindings().map((r) => ({ ...r, family: familyOf(r.finding.tag) }));

  const counts = new Map<string, number>();
  for (const r of all) counts.set(r.family, (counts.get(r.family) ?? 0) + 1);
  const order = [...FAMILIES.map((f) => f.name), OTHER.name].filter((n) => counts.get(n));

  let rows = all;
  if (family) rows = rows.filter((r) => r.family === family);
  if (model)
    rows = rows.filter((r) =>
      [r.conversation.config.a.model, r.conversation.config.b.model].includes(model),
    );

  // Findings several independent judges agreed on come first — that is what "confirmed" means here.
  rows = [...rows].sort(
    (x, y) =>
      (y.finding.votes?.length ?? 1) - (x.finding.votes?.length ?? 1) ||
      y.conversation.started.localeCompare(x.conversation.started),
  );

  const models = [
    ...new Set(all.flatMap((r) => [r.conversation.config.a.model, r.conversation.config.b.model])),
  ].sort();

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-3">
        <h1 className="text-[15px] font-medium">
          What {new Set(all.map((r) => r.conversation.id)).size} unsupervised conversations contained
        </h1>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {order.map((name) => {
            const on = family === name;
            return (
              <Link
                key={name}
                href={on ? "/findings" : `/findings?family=${encodeURIComponent(name)}`}
                className={`rounded-xl border p-3 transition-colors ${
                  on ? "border-accent/40 bg-accent/8" : "border-line bg-panel hover:bg-raised"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-[14px] ${on ? "text-accent" : "text-ink"}`}>{name}</span>
                  <span className="font-mono text-[16px] text-muted">{counts.get(name)}</span>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-faint">{blurbOf(name)}</p>
              </Link>
            );
          })}
        </div>
      </header>

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

      <div className="flex flex-col gap-4">
        {rows.map(({ finding: f, conversation: c, family: fam }, i) => (
          <article
            key={`${c.id}-${i}`}
            className="rounded-xl border border-line bg-panel p-6 transition-colors hover:bg-raised"
          >
            <blockquote className="border-l-2 border-accent/50 pl-4 text-[17px] leading-[1.6] text-ink">
              “<ProseLine text={f.quote.trim()} />”
            </blockquote>

            <p className="mt-3 text-[14px] leading-relaxed text-muted">
              <ProseLine text={f.why} />
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-faint">
              <span className="rounded-full border border-accent/30 bg-accent/8 px-2 py-0.5 text-accent">
                {fam}
              </span>
              <span className="font-mono">{f.tag}</span>
              {f.votes && f.votes.length > 1 && (
                <span title={f.votes.join(", ")}>{f.votes.length} judges agreed</span>
              )}
              <span className="text-line">·</span>
              <Avatar model={c.config.a.model} size={16} />
              <span className="font-mono">{modelProfile(c.config.a.model).name}</span>
              <span className="text-line">×</span>
              <Avatar model={c.config.b.model} size={16} />
              <span className="font-mono">{modelProfile(c.config.b.model).name}</span>
              <span className="text-line">·</span>
              <span>{bodyTurns(c).length} turns</span>
              <span className="ml-auto flex gap-2">
                {f.turns.map((t) => (
                  <Link key={t} href={`/c/${c.id}#turn-${t}`} className="font-mono hover:text-accent">
                    read #{t} →
                  </Link>
                ))}
              </span>
            </div>
          </article>
        ))}
        {rows.length === 0 && (
          <p className="rounded-xl border border-line bg-panel p-6 text-[14px] text-muted">
            Nothing matches that filter.
          </p>
        )}
      </div>
    </div>
  );
}
