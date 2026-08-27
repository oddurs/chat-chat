"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCuration } from "@/lib/use-curation";
import { asset } from "@/lib/paths";
import { Avatar, modelProfile } from "@/lib/profiles";
import { CopyButton } from "@/components/copy";
import { turnMarkdown } from "@/components/bits";
import { Prose } from "@/components/prose";
import type { Turn, RunConfig } from "@/lib/logs";

type Loaded = { id: string; config: RunConfig; turns: Turn[] };
type Kept = { id: string; config: string; turn: Turn };

/** Everything starred or kept in this browser, across every run. */
export default function Keepers() {
  const curation = useCuration();
  const [kept, setKept] = useState<Kept[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const all = curation;
    const ids = Object.keys(all);
    Promise.all(
      ids.map((id) =>
        fetch(asset(`/data/conversations/${id}.json`))
          .then((r) => (r.ok ? (r.json() as Promise<Loaded>) : null))
          .catch(() => null),
      ),
    ).then((loaded) => {
      const rows: Kept[] = [];
      loaded.forEach((c, i) => {
        if (!c) return;
        for (const idx of all[ids[i]].turns ?? []) {
          const turn = c.turns.find((t) => t.idx === idx);
          if (turn) rows.push({ id: c.id, config: c.config.name ?? c.id, turn });
        }
      });
      setKept(rows);
      setLoading(false);
    });
  }, [curation]);

  const starred = Object.entries(curation).filter(([, c]) => c.starred);
  const bundle = kept
    .map((k) => `${turnMarkdown(k.turn.name, k.turn.model, k.turn.content)}\n*— ${k.config}*\n`)
    .join("\n---\n\n");

  if (loading) return <p className="text-[14px] text-faint">loading…</p>;

  if (!kept.length && !starred.length) {
    return (
      <p className="rounded-xl border border-line bg-panel p-6 text-[14px] text-muted">
        Nothing kept yet. Star a conversation, or star individual turns inside one (or press{" "}
        <code className="font-mono text-accent">s</code> while reading), and they collect here.
        Kept items live in this browser only.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 text-[12px] tracking-wide text-faint uppercase">
        <span>
          {kept.length} kept turn{kept.length === 1 ? "" : "s"} · {starred.length} starred conversations
        </span>
        {kept.length > 0 && (
          <CopyButton text={bundle} label="copy all kept turns" className="ml-auto normal-case" />
        )}
      </div>

      <div className="flex flex-col gap-3">
        {kept.map((k) => (
          <article key={`${k.id}-${k.turn.idx}`} className="rounded-xl border border-line bg-panel p-5">
            <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[12px] text-faint">
              <Avatar model={k.turn.model} size={20} />
              <span className="text-muted">{k.turn.name}</span>
              <span className="font-mono">{modelProfile(k.turn.model).name}</span>
              <span className="text-line">·</span>
              <Link href={`/c/${k.id}#turn-${k.turn.idx}`} className="font-mono hover:text-accent">
                {k.config} #{k.turn.idx}
              </Link>
              <CopyButton
                text={turnMarkdown(k.turn.name, k.turn.model, k.turn.content)}
                className="ml-auto"
              />
            </div>
            <Prose text={k.turn.content.trim()} className="text-[15px] leading-[1.65]" />
          </article>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {starred.map(([id, c]) => (
          <Link
            key={id}
            href={`/c/${id}`}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] hover:bg-raised"
          >
            <span className="text-accent">★</span>
            <span className="font-mono text-[12px] text-muted">{id}</span>
            {c.note && <span className="text-muted italic">{c.note}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
