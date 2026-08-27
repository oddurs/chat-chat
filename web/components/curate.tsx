"use client";

import { toggleTurn, write } from "@/lib/curation";
import { useCuration } from "@/lib/use-curation";

export function StarButton({ id }: { id: string }) {
  const starred = !!useCuration()[id]?.starred;
  return (
    <button
      onClick={() => write(id, { starred: !starred })}
      title={starred ? "starred" : "star this conversation"}
      className={`rounded-md border px-2 py-1 text-[12px] transition-colors ${
        starred
          ? "border-accent/40 bg-accent/12 text-accent"
          : "border-line text-faint hover:border-faint hover:text-muted"
      }`}
    >
      {starred ? "\u2605 starred" : "\u2606 star"}
    </button>
  );
}

export function TurnKeep({ id, turn }: { id: string; turn: number }) {
  const kept = (useCuration()[id]?.turns ?? []).includes(turn);
  return (
    <button
      onClick={() => toggleTurn(id, turn)}
      title={kept ? "kept \u2014 click to drop" : "keep this turn"}
      className={kept ? "text-accent" : "text-faint hover:text-muted"}
    >
      {kept ? "\u2605" : "\u2606"}
    </button>
  );
}

export function NoteBox({ id }: { id: string }) {
  // The store is the only state: every keystroke writes, so there is nothing to synchronise.
  const note = useCuration()[id]?.note ?? "";
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-2 text-[12px] tracking-wide text-faint uppercase">Note</div>
      <textarea
        value={note}
        rows={2}
        placeholder="what was worth keeping here\u2026"
        onChange={(e) => write(id, { note: e.target.value })}
        className="w-full resize-y bg-transparent text-[14px] leading-relaxed text-ink outline-none placeholder:text-faint"
      />
      <p className="mt-2 text-[11px] text-faint">Stored in this browser only.</p>
    </div>
  );
}
