import fs from "node:fs";
import path from "node:path";
import { LOG_DIR } from "./logs";

export type Curation = { starred?: boolean; note?: string; turns?: number[] };
export type CurationFile = Record<string, Curation>;

const FILE = path.join(LOG_DIR, "curation.json");

export function readCuration(): CurationFile {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

export function writeCuration(id: string, patch: Curation): CurationFile {
  const all = readCuration();
  const next = { ...all[id], ...patch };
  // Drop empty records so the file stays a list of things you actually kept.
  if (!next.starred && !next.note?.trim() && !next.turns?.length) delete all[id];
  else all[id] = next;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
  return all;
}

export function toggleTurn(id: string, turn: number): CurationFile {
  const cur = readCuration()[id] ?? {};
  const turns = new Set(cur.turns ?? []);
  if (turns.has(turn)) turns.delete(turn);
  else turns.add(turn);
  return writeCuration(id, { ...cur, turns: [...turns].sort((a, b) => a - b) });
}
