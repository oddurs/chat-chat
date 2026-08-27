"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const HELP: [string, string][] = [
  ["j / k", "next / previous turn"],
  ["f / F", "next / previous flagged turn"],
  ["s", "keep the turn you're on"],
  ["g / G", "top / bottom"],
  ["?", "this"],
];

function turns(flaggedOnly = false): HTMLElement[] {
  const sel = flaggedOnly ? '[id^="turn-"][data-flagged="1"]' : '[id^="turn-"]';
  return [...document.querySelectorAll<HTMLElement>(sel)];
}

/** The turn nearest the top of the viewport — what "the turn you're on" means. */
function current(): HTMLElement | undefined {
  return turns()
    .map((el) => ({ el, d: Math.abs(el.getBoundingClientRect().top - 80) }))
    .sort((a, b) => a.d - b.d)[0]?.el;
}

function go(list: HTMLElement[], dir: 1 | -1) {
  const here = current();
  const at = here ? list.indexOf(here) : -1;
  const next =
    at >= 0
      ? list[Math.min(list.length - 1, Math.max(0, at + dir))]
      : dir > 0
        ? list[0]
        : list[list.length - 1];
  next?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function Keys({ id }: { id: string }) {
  const [help, setHelp] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;

      switch (e.key) {
        case "j":
          return go(turns(), 1);
        case "k":
          return go(turns(), -1);
        case "f":
          return go(turns(true), 1);
        case "F":
          return go(turns(true), -1);
        case "g":
          return window.scrollTo({ top: 0, behavior: "smooth" });
        case "G":
          return window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        case "?":
          return setHelp((h) => !h);
        case "s": {
          const turn = Number(current()?.id.replace("turn-", ""));
          if (!Number.isFinite(turn)) return;
          await fetch("/api/curation", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id, turn }),
          });
          router.refresh();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, router]);

  return (
    <div className="fixed right-5 bottom-5 z-20 hidden sm:block">
      {help ? (
        <dl className="rounded-xl border border-line bg-panel/95 p-3 text-[12px] shadow-lg backdrop-blur">
          {HELP.map(([k, what]) => (
            <div key={k} className="flex gap-3 py-0.5">
              <dt className="w-12 font-mono text-accent">{k}</dt>
              <dd className="text-muted">{what}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <button
          onClick={() => setHelp(true)}
          className="rounded-md border border-line bg-panel/80 px-2 py-1 font-mono text-[11px] text-faint backdrop-blur hover:text-muted"
        >
          j k f s ?
        </button>
      )}
    </div>
  );
}
