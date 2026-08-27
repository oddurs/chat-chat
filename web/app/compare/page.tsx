"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { asset } from "@/lib/paths";
import { Avatar, modelProfile } from "@/lib/profiles";
import { Prose } from "@/components/prose";
import { StopBadge } from "@/components/bits";
import type { Turn, RunConfig, Analysis } from "@/lib/logs";

type Loaded = {
  id: string;
  config: RunConfig;
  seed: string;
  stopReason: string;
  turns: Turn[];
  analysis: Analysis | null;
};

function useConversation(id: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    fetch(asset(`/data/conversations/${id}.json`))
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => live && setLoaded(c))
      .catch(() => live && setLoaded(null));
    return () => {
      live = false;
    };
  }, [id]);
  // Derived rather than cleared in the effect, so nothing sets state synchronously.
  return id && loaded?.id === id ? loaded : null;
}

function Column({ c }: { c: Loaded }) {
  const body = c.turns.filter((t) => t.speaker !== "seed");
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
          <span>{body.length} turns</span>
          <StopBadge reason={c.stopReason} />
          {c.analysis?.mean_interest !== undefined && <span>interest {c.analysis.mean_interest}</span>}
        </div>
        <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted">{c.seed}</p>
        <Link href={`/c/${c.id}`} className="mt-2 inline-block text-[12px] text-faint hover:text-accent">
          open →
        </Link>
      </div>

      {body.map((t) => (
        <div key={t.idx} className="rounded-xl border border-line-soft bg-panel px-4 py-3">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] text-faint">
            <span className="text-muted">{t.name}</span>
            <span className="font-mono">#{t.idx}</span>
          </div>
          <Prose text={t.content.trim()} className="text-[14px] leading-[1.6]" />
        </div>
      ))}
    </div>
  );
}

function CompareInner() {
  const params = useSearchParams();
  const a = useConversation(params.get("a"));
  const b = useConversation(params.get("b"));

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

export default function Compare() {
  return (
    <Suspense fallback={<p className="text-[14px] text-faint">loading…</p>}>
      <CompareInner />
    </Suspense>
  );
}
