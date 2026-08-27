import Link from "next/link";
import { readContagion, readIdentify, type ContagionRun } from "@/lib/experiments";
import { Avatar, modelProfile, providerColor } from "@/lib/profiles";

export const dynamic = "force-dynamic";

function Stat({ value, label, tone = "" }: { value: string; label: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className={`font-mono text-[26px] leading-none ${tone || "text-ink"}`}>{value}</div>
      <div className="mt-2 text-[12px] leading-snug text-faint">{label}</div>
    </div>
  );
}

function byModel(runs: ContagionRun[]) {
  const acc = new Map<string, Record<string, { n: number; ok: number }>>();
  for (const r of runs) {
    const row = acc.get(r.free_model) ?? {};
    const arm = row[r.arm] ?? { n: 0, ok: 0 };
    arm.n += 1;
    arm.ok += r.correct ? 1 : 0;
    row[r.arm] = arm;
    acc.set(r.free_model, row);
  }
  return [...acc.entries()];
}

export default function Experiments() {
  const ident = readIdentify();
  const cont = readContagion();
  const chance = ident?.labs.length ? 1 / ident.labs.length : 0;
  const wrongTotal = Object.values(ident?.wrong_guesses ?? {}).reduce((a, b) => a + b, 0);

  const right = cont?.arms.right;
  const wrong = cont?.arms.wrong;
  const rightRate = right ? right.correct / right.runs : null;
  const wrongRate = wrong ? wrong.correct / wrong.runs : null;

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <header>
          <h1 className="text-[15px] font-medium">Can a model tell who it is talking to?</h1>
          <p className="mt-1 max-w-[52rem] text-[14px] leading-relaxed text-muted">
            Two models from different labs talk for ten turns, each trying to identify the other and
            forbidden from revealing itself. Then each is asked, in its own context, to name the lab.
          </p>
        </header>

        {!ident ? (
          <p className="rounded-xl border border-line bg-panel p-5 text-[14px] text-muted">
            Not run yet — <code className="font-mono text-accent">./chatchat.py batch matrix-identify.toml</code>{" "}
            then <code className="font-mono text-accent">./chatchat.py identify</code>.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat
                value={`${Math.round((ident.correct / ident.total) * 100)}%`}
                label={`correct — ${ident.correct} of ${ident.total} guesses, against ${Math.round(
                  chance * 100,
                )}% chance across ${ident.labs.length} labs`}
              />
              <Stat
                value={`${Math.round((ident.mirror / ident.total) * 100)}%`}
                label="named their own lab while talking to someone else"
                tone="text-accent"
              />
              <Stat
                value={`${ident.wrong_guesses.anthropic ?? 0}/${wrongTotal}`}
                label="wrong guesses that said Anthropic — the modal answer, whoever was actually speaking"
                tone="text-accent"
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-line bg-panel">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] tracking-wide text-faint uppercase">
                    <th className="px-4 py-2.5 text-left font-medium">guesser</th>
                    <th className="px-2 py-2.5 text-left font-medium">was talking to</th>
                    <th className="px-2 py-2.5 text-left font-medium">guessed</th>
                    <th className="px-2 py-2.5 text-right font-medium">conf</th>
                    <th className="px-4 py-2.5 text-left font-medium">what it says it noticed</th>
                  </tr>
                </thead>
                <tbody>
                  {ident.guesses.map((g, i) => (
                    <tr key={i} className="border-t border-line-soft align-top">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <Avatar model={g.guesser} size={16} />
                          {modelProfile(g.guesser).name}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 font-mono text-[12px] text-muted">{g.truth}</td>
                      <td className="px-2 py-2.5 font-mono text-[12px]">
                        <span className={g.right ? "text-[#68a678]" : "text-[#e0645c]"}>
                          {g.right ? "✓" : "✗"} {g.guess ?? "—"}
                        </span>
                        {g.own_lab && !g.right && (
                          <span className="ml-1.5 text-[10px] text-accent">itself</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-[12px] text-faint">
                        {g.conf.toFixed(2)}
                      </td>
                      <td className="max-w-[26rem] px-4 py-2.5 text-[12px] leading-snug text-faint">
                        {g.evidence.slice(0, 180)}
                        {g.evidence.length > 180 ? "…" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="max-w-[52rem] text-[13px] leading-relaxed text-muted">
              Almost every model names <em className="italic">safety behaviour</em> as its evidence —
              refusal style, policy citations, “constitutional” phrasing, safety tiering. That
              behaviour is convergent across labs, which is why it identifies nobody, and why the
              guess it produces is so often Anthropic.
            </p>
          </>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <header>
          <h1 className="text-[15px] font-medium">Does a confidently wrong partner spread the error?</h1>
          <p className="mt-1 max-w-[52rem] text-[14px] leading-relaxed text-muted">
            One seat is primed to hold an answer with total confidence and no hedging; the other is
            free and told to push back if it disagrees. They must converge on a single answer. In the
            control arm the primed seat holds the <em className="italic">correct</em> answer, so the
            gap between arms is what a confident wrong partner costs. No referee, no provocations —
            here agreement is the thing being measured.
          </p>
        </header>

        {!cont ? (
          <p className="rounded-xl border border-line bg-panel p-5 text-[14px] text-muted">
            Not scored yet — <code className="font-mono text-accent">./chatchat.py contagion</code>.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat
                value={rightRate === null ? "—" : `${Math.round(rightRate * 100)}%`}
                label="free model ends on the truth when its partner is confidently right"
              />
              <Stat
                value={wrongRate === null ? "—" : `${Math.round(wrongRate * 100)}%`}
                label="free model ends on the truth when its partner is confidently wrong"
                tone="text-[#e0645c]"
              />
              <Stat
                value={
                  rightRate === null || wrongRate === null
                    ? "—"
                    : `${Math.round((rightRate - wrongRate) * 100)}pp`
                }
                label="accuracy surrendered to a confident partner who is wrong"
                tone="text-accent"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {byModel(cont.runs).map(([model, arms]) => (
                <div key={model} className="rounded-xl border border-line bg-panel p-4">
                  <div className="flex items-center gap-2">
                    <Avatar model={model} size={22} />
                    <span className="text-[13px]">{modelProfile(model).name}</span>
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    {["right", "wrong"].map((arm) => {
                      const a = arms[arm];
                      if (!a) return null;
                      const pct = a.ok / a.n;
                      return (
                        <div key={arm} className="flex items-center gap-3 text-[12px]">
                          <span className="w-28 text-faint">partner {arm}</span>
                          <span className="h-2 w-28 overflow-hidden rounded-full bg-line">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${pct * 100}%`,
                                background: arm === "wrong" ? "#e0645c" : providerColor(model),
                              }}
                            />
                          </span>
                          <span className="font-mono text-faint">
                            {a.ok}/{a.n}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto rounded-xl border border-line bg-panel">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] tracking-wide text-faint uppercase">
                    <th className="px-4 py-2.5 text-left font-medium">free model</th>
                    <th className="px-2 py-2.5 text-left font-medium">partner</th>
                    <th className="px-2 py-2.5 text-left font-medium">truth</th>
                    <th className="px-2 py-2.5 text-left font-medium">ended on</th>
                    <th className="px-4 py-2.5 text-left font-medium">its explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {cont.runs.map((r) => (
                    <tr key={r.run} className="border-t border-line-soft align-top">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <Link href={`/c/${r.run}`} className="flex items-center gap-1.5 hover:text-accent">
                          <Avatar model={r.free_model} size={16} />
                          {modelProfile(r.free_model).name}
                        </Link>
                      </td>
                      <td className="px-2 py-2.5 font-mono text-[12px] text-faint">{r.arm}</td>
                      <td className="px-2 py-2.5 font-mono text-[12px] text-muted">{r.truth}</td>
                      <td
                        className={`px-2 py-2.5 font-mono text-[12px] ${
                          r.correct ? "text-[#68a678]" : "text-[#e0645c]"
                        }`}
                      >
                        {r.correct ? "✓" : "✗"} {r.answer.slice(0, 24)}
                      </td>
                      <td className="max-w-[24rem] px-4 py-2.5 text-[12px] leading-snug text-faint">
                        {r.changed_mind ? <span className="text-accent">changed its mind · </span> : null}
                        {r.why.slice(0, 150)}
                        {r.why.length > 150 ? "…" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
