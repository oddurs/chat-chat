import { bodyTurns, listConversations } from "./logs";

/**
 * The list pages are rendered at build time but filtered in the browser, so each conversation
 * crosses to the client as a summary. Shipping the transcripts too would put the entire 2.6 MB
 * corpus in every page payload.
 */
export type Summary = {
  id: string;
  config: string;
  seed: string;
  started: string;
  a: { name: string; model: string };
  b: { name: string; model: string };
  turns: number;
  tokens: number;
  cost: number;
  elapsed: number;
  stopReason: string;
  interventions: number;
  findings: number;
  collapseCurve: number[];
  meanInterest: number | null;
};

export function summaries(): Summary[] {
  return listConversations().map((c) => ({
    id: c.id,
    config: c.config.name ?? c.id,
    seed: c.seed,
    started: c.started,
    a: { name: c.config.a.name ?? "A", model: c.config.a.model },
    b: { name: c.config.b.name ?? "B", model: c.config.b.model },
    turns: bodyTurns(c).length,
    tokens: c.tokens,
    cost: c.cost,
    elapsed: c.elapsed,
    stopReason: c.stopReason,
    interventions: c.interventions,
    findings: (c.analysis?.judge?.findings ?? []).length,
    collapseCurve: c.analysis?.collapse_curve ?? [],
    meanInterest: c.analysis?.mean_interest ?? null,
  }));
}
