"use client";

import Link from "next/link";
import { useState } from "react";
import type { ModelStat, PairStat } from "@/lib/stats";
import { Avatar, modelProfile, providerColor } from "@/lib/profiles";

const CONTROLLED = "table"; // the round-robin: identical seats, one seed, only the models vary

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }}
        />
      </span>
      <span className="font-mono text-[11px] text-faint">{value.toFixed(2)}</span>
    </span>
  );
}

function Matrix({ models, pairs }: { models: string[]; pairs: PairStat[] }) {
  const cell = new Map<string, PairStat>();
  for (const p of pairs) {
    cell.set(`${p.a}|${p.b}`, p);
    cell.set(`${p.b}|${p.a}`, p);
  }
  const maxTurns = Math.max(1, ...pairs.map((p) => p.turns));

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[3px] text-[11px]">
        <thead>
          <tr>
            <th />
            {models.map((m) => (
              <th key={m} className="p-0 pb-1 align-bottom">
                <span className="flex justify-center" title={m}>
                  <Avatar model={m} size={18} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((row) => (
            <tr key={row}>
              <th className="pr-2 text-right font-normal whitespace-nowrap text-faint" title={row}>
                <span className="flex items-center justify-end gap-1.5">
                  {modelProfile(row).name}
                  <Avatar model={row} size={16} />
                </span>
              </th>
              {models.map((col) => {
                const p = cell.get(`${row}|${col}`);
                if (!p) return <td key={col} className="h-7 w-9 rounded bg-panel/40" />;
                const strength = p.turns / maxTurns;
                return (
                  <td key={col} className="p-0">
                    <Link
                      href={`/c/${p.id}`}
                      title={`${modelProfile(row).name} × ${modelProfile(col).name} — ${p.turns} turns${
                        p.collapsed ? ", collapsed" : p.timedOut ? ", cut off by the clock" : ""
                      }, ${p.findings} findings, dissent ${p.dissent.toFixed(2)}`}
                      className="flex h-7 w-9 items-center justify-center rounded font-mono text-[10px] text-ink/80 transition-transform hover:scale-110"
                      style={{
                        background: p.timedOut
                          ? "var(--color-raised)"
                          : `color-mix(in oklab, ${
                              p.collapsed ? "#c98a3f" : "var(--color-accent)"
                            } ${12 + strength * 55}%, var(--color-panel))`,
                        color: p.timedOut ? "var(--color-faint)" : undefined,
                      }}
                    >
                      {p.turns}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type Scope = { stats: ModelStat[]; pairs: PairStat[] };

export function ModelsView({ scopes }: { scopes: Record<string, Scope> }) {
  const names = Object.keys(scopes);
  const [scope, setScope] = useState(names.includes(CONTROLLED) ? CONTROLLED : names[0]);
  const controlled = scope === CONTROLLED;

  const { stats, pairs } = scopes[scope] ?? { stats: [], pairs: [] };
  const models = [...new Set(pairs.flatMap((x) => [x.a, x.b]))].sort();

  const maxDissent = Math.max(0.01, ...stats.map((s) => s.dissent));
  const maxAssent = Math.max(0.01, ...stats.map((s) => s.assent));
  const maxWords = Math.max(1, ...stats.map((s) => s.words));

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="text-[15px] font-medium">How the models behave at the same table</h1>
        <p className="max-w-[52rem] text-[14px] leading-relaxed text-muted">
          {controlled ? (
            <>
              Every pairing below sat in <em className="italic">identical seats</em>: same seed, same
              system prompt, same limits. Only the two models change, so the differences are
              attributable to them.
            </>
          ) : (
            <>
              <span className="text-[#c98a3f]">Confounded view.</span> These runs used different
              configs, so a model that looks inquisitive may simply have been cast as the
              interviewer. Use the controlled tournament for claims about models themselves.
            </>
          )}
        </p>
        <nav className="flex flex-wrap gap-2 text-[12px]">
          {names.map((name) => (
            <button
              key={name}
              onClick={() => setScope(name)}
              className={`rounded-md border px-2 py-0.5 font-mono ${
                scope === name
                  ? "border-accent/40 bg-accent/12 text-accent"
                  : "border-line text-faint hover:text-muted"
              }`}
            >
              {name === CONTROLLED ? "controlled" : name}
            </button>
          ))}
        </nav>
      </header>

      {pairs.length === 0 ? (
        <p className="rounded-xl border border-line bg-panel p-6 text-[14px] text-muted">
          No runs in this scope. The tournament is{" "}
          <code className="font-mono text-accent">./chatchat.py batch matrices/tournament.toml</code>.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-[12px] tracking-wide text-faint uppercase">
              Who survives whom · turns before the conversation ended
            </h2>
            <Matrix models={models} pairs={pairs} />
            <p className="text-[12px] text-faint">
              Warmer is longer. <span className="text-[#c98a3f]">Amber</span> means the referee called
              collapse and the run was stopped. <span className="text-faint">Grey</span> means the
              wall clock cut it off — a slow model, not a short conversation, so read nothing into
              it. The diagonal is a model talking to itself.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-[12px] tracking-wide text-faint uppercase">Fingerprints</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {stats.map((s) => (
                <article key={s.model} className="rounded-xl border border-line bg-panel p-4">
                  <div className="flex items-center gap-2.5">
                    <Avatar model={s.model} size={28} />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium">
                        {modelProfile(s.model).name}
                      </div>
                      <div className="text-[11px] text-faint">
                        {modelProfile(s.model).provider.label} · {s.runs} runs · {s.turns} turns
                      </div>
                    </div>
                  </div>

                  <dl className="mt-3 flex flex-col gap-1.5 text-[12px]">
                    {(
                      [
                        ["pushes back", s.dissent, maxDissent],
                        ["agrees", s.assent, maxAssent],
                        ["asks", s.questions, 1],
                        ["words / turn", s.words, maxWords],
                      ] as [string, number, number][]
                    ).map(([label, value, max]) => (
                      <div key={label} className="flex items-center justify-between gap-3">
                        <dt className="text-faint">{label}</dt>
                        <dd>
                          <Bar value={value} max={max} color={providerColor(s.model)} />
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {s.fights.length > 1 && (
                    <p className="mt-3 border-t border-line-soft pt-2.5 text-[12px] text-faint">
                      argues most with{" "}
                      <span className="text-muted">{modelProfile(s.fights[0].model).name}</span>, least
                      with{" "}
                      <span className="text-muted">
                        {modelProfile(s.fights[s.fights.length - 1].model).name}
                      </span>
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
