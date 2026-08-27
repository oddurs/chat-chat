type Item = { idx: number; name: string; color: string; score: number; flagged: boolean };

/** A vertical index of the whole conversation: one bar per turn, length = interest score,
 *  colour = speaker, ring = a judge flagged it. Anchors only, no client JS. */
export function TurnRail({ items }: { items: Item[] }) {
  if (items.length < 4) return null;
  return (
    <nav
      aria-label="turns"
      className="fixed top-1/2 right-5 z-10 hidden -translate-y-1/2 flex-col gap-[3px] xl:flex"
    >
      {items.map((it) => (
        <a
          key={it.idx}
          href={`#turn-${it.idx}`}
          title={`#${it.idx} · ${it.name} · interest ${it.score.toFixed(2)}${it.flagged ? " · flagged" : ""}`}
          className="group flex h-[7px] items-center justify-end"
        >
          {it.flagged && <span className="mr-1 h-[5px] w-[5px] rounded-full bg-accent" />}
          <span
            className="block h-[3px] rounded-full opacity-45 transition-opacity group-hover:opacity-100"
            style={{ width: 10 + it.score * 30, background: it.color }}
          />
        </a>
      ))}
    </nav>
  );
}
