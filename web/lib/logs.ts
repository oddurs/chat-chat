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
  latency: number;
  ts: string;
};

export type AgentConfig = {
  name?: string;
  model: string;
  system?: string;
  temperature?: number;
  top_p?: number;
  seed?: number;
  max_tokens?: number;
};

export type RunConfig = {
  name?: string;
  seed: string;
  max_turns?: number;
  max_seconds?: number;
  a: AgentConfig;
  b: AgentConfig;
};

export type Finding = { turns: number[]; tag: string; why: string; quote: string };

export type Analysis = {
  turns: number;
  tokens: number;
  heuristics: { idx: number; name: string; score: number; novelty: number; self_sim: number; echo: number; tags: string[] }[];
  judge?: { findings: Finding[]; arc: string; collapse_turn: number | null };
};

export type Conversation = {
  id: string;
  config: RunConfig;
  configPath: string;
  started: string;
  turns: Turn[];
  stopReason: string;
  elapsed: number;
  errors: { idx: number; error: string }[];
  tokens: number;
  cost: number;
  analysis: Analysis | null;
};

const LOG_DIR = process.env.CHATCHAT_LOGS ?? path.join(process.cwd(), "..", "logs");

function parse(file: string): Conversation | null {
  const id = path.basename(file, ".jsonl");
  let config: RunConfig | null = null;
  let configPath = "";
  let started = "";
  let stopReason = "running";
  let elapsed = 0;
  const turns: Turn[] = [];
  const errors: { idx: number; error: string }[] = [];

  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue; // a run killed mid-write leaves a partial last line
    }
    if (rec.type === "meta") {
      config = rec.config;
      configPath = rec.config_path;
      started = rec.started;
    } else if (rec.type === "turn") turns.push(rec);
    else if (rec.type === "end") {
      stopReason = rec.stop_reason;
      elapsed = rec.elapsed;
    } else if (rec.type === "error") errors.push({ idx: rec.idx, error: rec.error });
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
    id,
    config,
    configPath,
    started,
    turns,
    stopReason,
    elapsed,
    errors,
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

export function logDir() {
  return LOG_DIR;
}
