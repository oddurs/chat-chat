"use client";

import Link from "next/link";
import { useState } from "react";
import type { Summary } from "@/lib/summary";
import { useCuration } from "@/lib/use-curation";
import { Avatar, modelProfile } from "@/lib/profiles";
import { Sparkline, StopBadge } from "@/components/bits";
import { StarButton } from "@/components/curate";

function when(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConversationList({ summaries }: { summaries: Summary[] }) {
  const curation = useCuration();
  const [onlyStarred, setOnlyStarred] = useState(false);
  const [config, setConfig] = useState<string | null>(null);

  const configs = [...new Set(summaries.map((s) => s.config))].sort();
  let rows = summaries;
  if (onlyStarred) rows = rows.filter((s) => curation[s.id]?.starred);
  if (config) rows = rows.filter((s) => s.config === config);

  const spend = rows.reduce((n, s) => n + s.cost, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="mb-1 flex flex-wrap items-center gap-3 text-[13px]">
        <span className="tracking-wide text-faint uppercase">
          {rows.length} conversation{rows.length === 1 ? "" : "s"} · ${spend.toFixed(2)}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button
            onClick={() => setOnlyStarred((v) => !v)}
            className={`rounded-md border px-2 py-0.5 ${
              onlyStarred
                ? "border-accent/40 bg-accent/12 text-accent"
                : "border-line text-faint hover:text-muted"
            }`}
          >
            ★ starred
          </button>
          {configs.map((name) => (
            <button
              key={name}
              onClick={() => setConfig((c) => (c === name ? null : name))}
              className={`rounded-md border px-2 py-0.5 font-mono text-[12px] ${
                config === name
                  ? "border-accent/40 bg-accent/12 text-accent"
                  : "border-line text-faint hover:text-muted"
              }`}
            >
              {name}
            </button>
          ))}
        </span>
      </div>

      {rows.map((c) => {
        const curated = curation[c.id];
        return (
          <div
            key={c.id}
            className="group rounded-xl border border-line bg-panel p-5 transition-colors hover:bg-raised"
          >
            <div className="flex items-start justify-between gap-4">
              <Link href={`/c/${c.id}`} className="min-w-0 grow">
                <div className="flex items-center gap-2.5">
                  <Avatar model={c.a.model} size={26} />
                  <span className="text-[14px] font-medium">{c.a.name}</span>
                  <span className="text-[13px] text-faint">vs</span>
                  <span className="text-[14px] font-medium">{c.b.name}</span>
                  <Avatar model={c.b.model} size={26} />
                </div>
                <p className="mt-2.5 line-clamp-2 text-[14px] leading-relaxed text-muted">{c.seed}</p>
                {curated?.note && (
                  <p className="mt-2 border-l-2 border-accent/40 pl-2.5 text-[13px] text-accent/90 italic">
                    {curated.note}
                  </p>
                )}
              </Link>
              <div className="shrink-0 text-right text-[12px] text-faint">
                <StarButton id={c.id} />
                <div className="mt-1.5 font-mono text-[13px] text-muted">{c.config}</div>
                <div className="mt-0.5">{when(c.started)}</div>
                {c.collapseCurve.length > 1 && (
                  <div className="mt-2 flex justify-end">
                    <Sparkline curve={c.collapseCurve} />
                  </div>
                )}
              </div>
            </div>

            <Link
              href={`/c/${c.id}`}
              className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-faint"
            >
              <span className="font-mono">{modelProfile(c.a.model).name}</span>
              <span className="text-line">·</span>
              <span className="font-mono">{modelProfile(c.b.model).name}</span>
              <span className="text-line">·</span>
              <span>{c.turns} turns</span>
              <span>{c.tokens.toLocaleString()} tok</span>
              <span>${c.cost.toFixed(3)}</span>
              <span>{c.elapsed}s</span>
              <StopBadge reason={c.stopReason} />
              {c.interventions > 0 && (
                <span className="text-[#c98a3f]" title="harness provocations injected">
                  ⟐ {c.interventions}
                </span>
              )}
              {c.findings > 0 && (
                <span className="ml-auto rounded-full border border-accent/35 bg-accent/10 px-2 py-0.5 text-accent">
                  {c.findings} findings
                </span>
              )}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
