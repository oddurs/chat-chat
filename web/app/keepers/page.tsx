import Link from "next/link";
import { getConversation, type Conversation } from "@/lib/logs";
import { readCuration } from "@/lib/curation";
import { Avatar, modelProfile } from "@/lib/profiles";
import { CopyButton } from "@/components/copy";
import { turnMarkdown } from "@/components/bits";

export const dynamic = "force-dynamic";

/** Everything starred or kept, across every run — the actual output of a harvesting session. */
export default function Keepers() {
  const curation = readCuration();
  const entries = Object.entries(curation)
    .map(([id, c]) => ({ id, curation: c, conversation: getConversation(id) }))
    .filter((e): e is { id: string; curation: (typeof curation)[string]; conversation: Conversation } =>
      e.conversation !== null,
    )
    .sort((x, y) => y.conversation.started.localeCompare(x.conversation.started));

  const keptTurns = entries.flatMap(({ id, curation: cur, conversation: c }) =>
    (cur.turns ?? []).map((idx) => ({ id, c, turn: c.turns.find((t) => t.idx === idx) })).filter((k) => k.turn),
  );

  const bundle = keptTurns
    .map(({ c, turn }) => `${turnMarkdown(turn!.name, turn!.model, turn!.content)}\n*— ${c.config.name}*\n`)
    .join("\n---\n\n");

  if (!entries.length) {
    return (
      <p className="rounded-xl border border-line bg-panel p-6 text-[14px] text-muted">
        Nothing kept yet. Star a conversation, or star individual turns inside one, and they collect here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 text-[12px] tracking-wide text-faint uppercase">
        <span>
          {keptTurns.length} kept turn{keptTurns.length === 1 ? "" : "s"} ·{" "}
          {entries.filter((e) => e.curation.starred).length} starred conversations
        </span>
        {keptTurns.length > 0 && (
          <CopyButton text={bundle} label="copy all kept turns" className="ml-auto normal-case" />
        )}
      </div>

      <div className="flex flex-col gap-3">
        {keptTurns.map(({ id, c, turn }) => (
          <article key={`${id}-${turn!.idx}`} className="rounded-xl border border-line bg-panel p-5">
            <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[12px] text-faint">
              <Avatar model={turn!.model} size={20} />
              <span className="text-muted">{turn!.name}</span>
              <span className="font-mono">{modelProfile(turn!.model).name}</span>
              <span className="text-line">·</span>
              <Link href={`/c/${id}#turn-${turn!.idx}`} className="font-mono hover:text-accent">
                {c.config.name} #{turn!.idx}
              </Link>
              <CopyButton
                text={turnMarkdown(turn!.name, turn!.model, turn!.content)}
                className="ml-auto"
              />
            </div>
            <p className="text-[15px] leading-[1.65] whitespace-pre-wrap">{turn!.content.trim()}</p>
          </article>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {entries
          .filter((e) => e.curation.starred)
          .map(({ id, curation: cur, conversation: c }) => (
            <Link
              key={id}
              href={`/c/${id}`}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] hover:bg-raised"
            >
              <span className="text-accent">★</span>
              <span className="font-mono text-[12px] text-muted">{c.config.name}</span>
              <Avatar model={c.config.a.model} size={18} />
              <Avatar model={c.config.b.model} size={18} />
              {cur.note && <span className="text-muted italic">{cur.note}</span>}
              <span className="ml-auto font-mono text-[11px] text-faint">
                {c.turns.length - 1} turns · ${c.cost.toFixed(3)}
              </span>
            </Link>
          ))}
      </div>
    </div>
  );
}
