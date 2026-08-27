"use client";

import Link from "next/link";
import { useState } from "react";
import { blurbOf, FAMILIES, OTHER } from "@/lib/phenomena";
import { Avatar, modelProfile } from "@/lib/profiles";
import { ProseLine } from "@/components/prose";

export type FindingRow = {
  id: string;
  config: string;
  started: string;
  tag: string;
  family: string;
  why: string;
  quote: string;
  turns: number[];
  votes: number;
  altTags: string[];
  a: string;
  b: string;
  conversationTurns: number;
};

export function FindingsBrowser({ rows }: { rows: FindingRow[] }) {
  const [family, setFamily] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.family, (counts.get(r.family) ?? 0) + 1);
  const order = [...FAMILIES.map((f) => f.name), OTHER.name].filter((n) => counts.get(n));
  const models = [...new Set(rows.flatMap((r) => [r.a, r.b]))].sort();

  let shown = rows;
  if (family) shown = shown.filter((r) => r.family === family);
  if (model) shown = shown.filter((r) => r.a === model || r.b === model);
  shown = [...shown].sort((x, y) => y.votes - x.votes || y.started.localeCompare(x.started));

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-3">
        <h1 className="text-[15px] font-medium">
          What {new Set(rows.map((r) => r.id)).size} unsupervised conversations contained
        </h1>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {order.map((name) => {
            const on = family === name;
            return (
              <button
                key={name}
                onClick={() => setFamily(on ? null : name)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  on ? "border-accent/40 bg-accent/8" : "border-line bg-panel hover:bg-raised"
                }`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`text-[14px] ${on ? "text-accent" : "text-ink"}`}>{name}</span>
                  <span className="font-mono text-[16px] text-muted">{counts.get(name)}</span>
                </span>
                <span className="mt-1 block text-[12px] leading-snug text-faint">{blurbOf(name)}</span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="flex flex-wrap gap-2 text-[11px]">
        {models.map((m) => (
          <button
            key={m}
            onClick={() => setModel((v) => (v === m ? null : m))}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono ${
              model === m ? "border-accent/40 bg-accent/12 text-accent" : "border-line text-faint hover:text-muted"
            }`}
          >
            <Avatar model={m} size={14} />
            {modelProfile(m).name}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {shown.map((f, i) => (
          <article
            key={`${f.id}-${i}`}
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
                {f.family}
              </span>
              <span className="font-mono">{f.tag}</span>
              {f.votes > 1 && <span>{f.votes} judges agreed</span>}
              <span className="text-line">·</span>
              <Avatar model={f.a} size={16} />
              <span className="font-mono">{modelProfile(f.a).name}</span>
              <span className="text-line">×</span>
              <Avatar model={f.b} size={16} />
              <span className="font-mono">{modelProfile(f.b).name}</span>
              <span className="text-line">·</span>
              <span>{f.conversationTurns} turns</span>
              <span className="ml-auto flex gap-2">
                {f.turns.map((t) => (
                  <Link key={t} href={`/c/${f.id}#turn-${t}`} className="font-mono hover:text-accent">
                    read #{t} →
                  </Link>
                ))}
              </span>
            </div>
          </article>
        ))}
        {shown.length === 0 && (
          <p className="rounded-xl border border-line bg-panel p-6 text-[14px] text-muted">
            Nothing matches that filter.
          </p>
        )}
      </div>
    </div>
  );
}
