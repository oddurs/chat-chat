import fs from "node:fs";
import path from "node:path";

export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
};

export type Turn = {
  type: "turn";
  idx: number;
  speaker: "a" | "b" | "seed";
  name: string;
  model: string | null;
  content: string;
  usage: Usage;
  provider?: string;
  gen_id?: string;
  latency: number;
  ts: string;
};

/** Anything the harness did between turns: a provocation, a referee ruling, a failed call. */
export type Event =
  | { type: "intervention"; after: number; text: string; reason: string; collapse_score?: number }
  | { type: "referee"; after: number; collapsed?: boolean; why?: string; model?: string; error?: string }
  | { type: "error"; idx: number; speaker: string; error: string };

export type AgentConfig = {
  name?: string;
  model: string;
  system?: string;
  temperature?: number;
  top_p?: number;
  seed?: number;
  max_tokens?: number;
  reasoning?: { effort?: string };
};

export type RunConfig = {
  name?: string;
  seed?: string;
  seeds?: string[];
  max_turns?: number;
  max_seconds?: number;
  max_cost?: number;
  stop?: { referee?: string; referee_every?: number; collapse_threshold?: number };
  intervene?: { every?: number; on_collapse?: boolean; max?: number };
  a: AgentConfig;
  b: AgentConfig;
};

export type Finding = {
  turns: number[];
  tag: string;
  why: string;
  quote: string;
  votes?: string[];
  alt_tags?: string[];
};

export type Heuristic = {
  idx: number;
  name: string;
  score: number;
  novelty: number;
  self_sim: number;
  echo: number;
  assent?: number;
  dissent?: number;
  collapse?: number;
  tags: string[];
};

export type Analysis = {
  turns: number;
  tokens: number;
  cost?: number;
  mean_interest?: number;
  collapse_turn?: number | null;
  collapse_curve?: number[];
  judges?: string[];
  heuristics: Heuristic[];
  judge?: { findings: Finding[]; arc: string; arcs?: Record<string, string>; collapse_turn: number | null };
};

export type Conversation = {
  id: string;
  config: RunConfig;
  seed: string;
  started: string;
  turns: Turn[];
  events: Event[];
  stopReason: string;
  elapsed: number;
  interventions: number;
  collapseTurn: number | null;
  tokens: number;
  cost: number;
  analysis: Analysis | null;
};

export const LOG_DIR = process.env.CHATCHAT_LOGS ?? path.join(process.cwd(), "..", "logs");

function parse(file: string): Conversation | null {
  let config: RunConfig | null = null;
  let seed = "";
  let started = "";
  let stopReason = "running";
  let elapsed = 0;
  let interventions = 0;
  let collapseTurn: number | null = null;
  const turns: Turn[] = [];
  const events: Event[] = [];

  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue; // a run killed mid-write leaves a partial last line
    }
    switch (rec.type) {
      case "meta":
        config = rec.config;
        seed = rec.seed ?? rec.config?.seed ?? rec.config?.seeds?.[0] ?? "";
        started = rec.started;
        break;
      case "turn":
        turns.push(rec);
        break;
      case "end":
        stopReason = rec.stop_reason;
        elapsed = rec.elapsed;
        interventions = rec.interventions ?? 0;
        collapseTurn = rec.collapse_turn ?? null;
        break;
      default:
        events.push(rec);
    }
  }
  if (!config) return null;

  let analysis: Analysis | null = null;
  const apath = file.replace(/\.jsonl$/, ".analysis.json");
  if (fs.existsSync(apath)) {
    try {
      analysis = JSON.parse(fs.readFileSync(apath, "utf8"));
    } catch {}
  }

  return {
    id: path.basename(file, ".jsonl"),
    config,
    seed,
    started,
    turns,
    events,
    stopReason,
    elapsed,
    interventions,
    collapseTurn,
    tokens: turns.reduce((n, t) => n + (t.usage?.total_tokens ?? 0), 0),
    cost: turns.reduce((n, t) => n + (t.usage?.cost ?? 0), 0),
    analysis,
  };
}

export function listConversations(): Conversation[] {
  if (!fs.existsSync(LOG_DIR)) return [];
  return fs
    .readdirSync(LOG_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => parse(path.join(LOG_DIR, f)))
    .filter((c): c is Conversation => c !== null)
    .sort((x, y) => y.started.localeCompare(x.started));
}

export function getConversation(id: string): Conversation | null {
  const file = path.join(LOG_DIR, `${path.basename(id)}.jsonl`);
  return fs.existsSync(file) ? parse(file) : null;
}

export function bodyTurns(c: Conversation) {
  return c.turns.filter((t) => t.speaker !== "seed");
}

/** Every judged finding across every conversation, newest run first. */
export function allFindings() {
  return listConversations().flatMap((c) =>
    (c.analysis?.judge?.findings ?? []).map((f) => ({ finding: f, conversation: c })),
  );
}
