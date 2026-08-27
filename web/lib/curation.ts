/**
 * Stars, notes and kept turns live in the visitor's own browser. The site is a static export
 * with nowhere to write, and this is per-person scratch anyway — one reader's keepers are not
 * another's. Every access is guarded: storage throws outright in some privacy modes.
 */
export type Curation = { starred?: boolean; note?: string; turns?: number[] };
export type CurationFile = Record<string, Curation>;

const KEY = "chatchat.curation.v1";

/** A stable empty snapshot: useSyncExternalStore loops forever on a fresh object each call. */
const EMPTY: CurationFile = {};

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cached: CurationFile = EMPTY;

function announce() {
  for (const l of listeners) l();
}

export function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab writing the same key should update this one too.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Reparsed only when the stored string actually changed, so the reference stays stable. */
export function snapshot(): CurationFile {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = raw ? JSON.parse(raw) : EMPTY;
    } catch {
      cached = EMPTY;
    }
  }
  return cached;
}

export const serverSnapshot = () => EMPTY;

export function readAll(): CurationFile {
  return snapshot();
}

export function read(id: string): Curation {
  return readAll()[id] ?? {};
}

export function write(id: string, patch: Curation): Curation {
  const all = readAll();
  const next = { ...all[id], ...patch };
  if (!next.starred && !next.note?.trim() && !next.turns?.length) delete all[id];
  else all[id] = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked. Nothing to do but leave the UI as it is.
  }
  announce();
  return next;
}

export function toggleTurn(id: string, turn: number): Curation {
  const cur = read(id);
  const turns = new Set(cur.turns ?? []);
  if (turns.has(turn)) turns.delete(turn);
  else turns.add(turn);
  return write(id, { ...cur, turns: [...turns].sort((a, b) => a - b) });
}
