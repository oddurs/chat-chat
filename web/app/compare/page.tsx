import Link from "next/link";
import { getConversation, bodyTurns, type Conversation } from "@/lib/logs";
import { Avatar, modelProfile } from "@/lib/profiles";
import { StopBadge } from "@/components/bits";

export const dynamic = "force-dynamic";

function Column({ c }: { c: Conversation }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="rounded-xl border border-line bg-panel p-4">
        <div className="flex items-center gap-2 text-[13px]">
          <Avatar model={c.config.a.model} size={22} />
          <span className="font-mono text-[12px] text-muted">{modelProfile(c.config.a.model).name}</span>
          <span className="text-faint">×</span>
          <Avatar model={c.config.b.model} size={22} />
          <span className="font-mono text-[12px] text-muted">{modelProfile(c.config.b.model).name}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-faint">
          <span className="font-mono">{c.config.name}</span>
          <span>{bodyTurns(c).length} turns</span>
          <span>${c.cost.toFixed(3)}</span>
          <StopBadge reason={c.stopReason} />
          {c.analysis?.mean_interest !== undefined && <span>interest {c.analysis.mean_interest}</span>}
        </div>
        <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted">{c.seed}</p>
        <Link href={`/c/${c.id}`} className="mt-2 inline-block text-[12px] text-faint hover:text-accent">
          open →
        </Link>
      </div>

      {bodyTurns(c).map((t) => (
        <div key={t.idx} className="rounded-xl border border-line-soft bg-panel px-4 py-3">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] text-faint">
            <span className="text-muted">{t.name}</span>
            <span className="font-mono">#{t.idx}</span>
          </div>
          <p className="text-[14px] leading-[1.6] whitespace-pre-wrap">{t.content.trim()}</p>
        </div>
      ))}
    </div>
  );
}

export default async function Compare({ searchParams }: PageProps<"/compare">) {
  const p = await searchParams;
  const a = typeof p?.a === "string" ? getConversation(p.a) : null;
  const b = typeof p?.b === "string" ? getConversation(p.b) : null;

  if (!a || !b) {
    return (
      <p className="rounded-xl border border-line bg-panel p-6 text-[14px] text-muted">
        Pass two conversation ids: <code className="font-mono text-accent">/compare?a=…&amp;b=…</code>
        <br />
        Every conversation page links to a comparison against the closest other run.
      </p>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Column c={a} />
      <Column c={b} />
    </div>
  );
}
