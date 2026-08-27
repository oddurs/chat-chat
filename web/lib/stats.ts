import { bodyTurns, listConversations, type Conversation, type Heuristic } from "./logs";

export type ModelStat = {
  model: string;
  runs: number;
  turns: number;
  dissent: number;
  assent: number;
  questions: number;
  words: number;
  interest: number;
  findings: number;
  /** Opponents this model produced the most and least disagreement against. */
  fights: { model: string; dissent: number }[];
};

export type PairStat = {
  a: string;
  b: string;
  id: string;
  turns: number;
  collapsed: boolean;
  /** Ended on the wall clock rather than on anything conversational — a slow-model artifact
   *  that must not be read as "this pairing had less to say". */
  timedOut: boolean;
  dissent: number;
  findings: number;
};

function statsByTurn(c: Conversation): Map<number, Heuristic> {
  return new Map((c.analysis?.heuristics ?? []).map((h) => [h.idx, h]));
}

/**
 * Aggregate behaviour per model. `config` restricts to one config — pass the controlled
 * tournament to get numbers that mean anything: across mixed configs a model's "personality"
 * is really its casting, since an interviewer asks questions because it was told to.
 */
export function modelStats(config?: string): ModelStat[] {
  const acc = new Map<string, ModelStat & { fightAcc: Map<string, number[]> }>();
  const runsSeen = new Map<string, Set<string>>();

  for (const c of listConversations()) {
    if (config && c.config.name !== config) continue;
    const byIdx = statsByTurn(c);
    const models = { a: c.config.a.model, b: c.config.b.model };
    const findings = c.analysis?.judge?.findings ?? [];

    for (const t of bodyTurns(c)) {
      const model = models[t.speaker as "a" | "b"];
      const other = models[t.speaker === "a" ? "b" : "a"];
      const h = byIdx.get(t.idx);
      const row =
        acc.get(model) ??
        acc
          .set(model, {
            model,
            runs: 0,
            turns: 0,
            dissent: 0,
            assent: 0,
            questions: 0,
            words: 0,
            interest: 0,
            findings: 0,
            fights: [],
            fightAcc: new Map(),
          })
          .get(model)!;

      row.turns += 1;
      row.dissent += h?.dissent ?? 0;
      row.assent += h?.assent ?? 0;
      // Question density is not in the stored analysis, but it is just arithmetic on the text.
      row.questions += Math.min(1, (t.content.match(/\?/g)?.length ?? 0) / Math.max(1, (t.content.match(/[.!?]+/g)?.length ?? 1)));
      row.interest += h?.score ?? 0;
      row.words += t.content.split(/\s+/).length;
      row.findings += findings.filter((f) => f.turns.includes(t.idx)).length;
      row.fightAcc.set(other, [...(row.fightAcc.get(other) ?? []), h?.dissent ?? 0]);

      const seen = runsSeen.get(model) ?? new Set<string>();
      seen.add(c.id);
      runsSeen.set(model, seen);
    }
  }

  return [...acc.values()]
    .map(({ fightAcc, ...row }) => ({
      ...row,
      runs: runsSeen.get(row.model)?.size ?? 0,
      dissent: row.dissent / row.turns,
      assent: row.assent / row.turns,
      questions: row.questions / row.turns,
      words: row.words / row.turns,
      interest: row.interest / row.turns,
      fights: [...fightAcc.entries()]
        .map(([model, xs]) => ({ model, dissent: xs.reduce((a, b) => a + b, 0) / xs.length }))
        .sort((x, y) => y.dissent - x.dissent),
    }))
    .sort((x, y) => y.dissent - x.dissent);
}

/** One row per conversation in a config, keyed by the pair that held it. */
export function pairStats(config?: string): PairStat[] {
  return listConversations()
    .filter((c) => !config || c.config.name === config)
    .map((c) => {
      const h = c.analysis?.heuristics ?? [];
      return {
        a: c.config.a.model,
        b: c.config.b.model,
        id: c.id,
        turns: bodyTurns(c).length,
        collapsed: c.stopReason === "collapse",
        timedOut: c.stopReason === "max_seconds",
        dissent: h.length ? h.reduce((n, x) => n + (x.dissent ?? 0), 0) / h.length : 0,
        findings: (c.analysis?.judge?.findings ?? []).length,
      };
    });
}

/** Config names that actually hold a controlled comparison (one seed, identical seats). */
export function configNames(): string[] {
  return [...new Set(listConversations().map((c) => c.config.name ?? ""))].filter(Boolean).sort();
}
