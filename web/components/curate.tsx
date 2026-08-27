"use client";

import { useState, useTransition } from "react";

async function save(body: Record<string, unknown>) {
  await fetch("/api/curation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function StarButton({ id, initial }: { id: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [, start] = useTransition();
  return (
    <button
      onClick={() => {
        const next = !on;
        setOn(next);
        start(() => void save({ id, starred: next }));
      }}
      title={on ? "starred" : "star this conversation"}
      className={`rounded-md border px-2 py-1 text-[12px] transition-colors ${
        on
          ? "border-accent/40 bg-accent/12 text-accent"
          : "border-line text-faint hover:border-faint hover:text-muted"
      }`}
    >
      {on ? "★ starred" : "☆ star"}
    </button>
  );
}

export function TurnKeep({ id, turn, initial }: { id: string; turn: number; initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <button
      onClick={() => {
        const next = !on;
        setOn(next);
        void save({ id, turn });
      }}
      title={on ? "kept — click to drop" : "keep this turn"}
      className={on ? "text-accent" : "text-faint hover:text-muted"}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

export function NoteBox({ id, initial }: { id: string; initial: string }) {
  const [note, setNote] = useState(initial);
  const [saved, setSaved] = useState(true);
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-2 flex items-center justify-between text-[12px] tracking-wide text-faint uppercase">
        <span>Note</span>
        <span className={saved ? "opacity-0" : "text-accent"}>unsaved</span>
      </div>
      <textarea
        value={note}
        rows={2}
        placeholder="what was worth keeping here…"
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
        onBlur={() => {
          void save({ id, note });
          setSaved(true);
        }}
        className="w-full resize-y bg-transparent text-[14px] leading-relaxed text-ink outline-none placeholder:text-faint"
      />
    </div>
  );
}
