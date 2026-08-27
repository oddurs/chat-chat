import Link from "next/link";
import { notFound } from "next/navigation";
import {
  bodyTurns,
  getConversation,
  listConversations,
  type AgentConfig,
  type Conversation,
  type Event,
  type Heuristic,
  type Turn,
} from "@/lib/logs";
import { readCuration } from "@/lib/curation";
import { Avatar, modelProfile } from "@/lib/profiles";
import { Chip, Sparkline, StopBadge, conversationMarkdown, turnMarkdown } from "@/components/bits";
import { NoteBox, StarButton, TurnKeep } from "@/components/curate";
import { CopyButton } from "@/components/copy";
import { LiveRefresh } from "@/components/live";

export const dynamic = "force-dynamic";

function Profile({ agent, side }: { agent: AgentConfig; side: "a" | "b" }) {
  const p = modelProfile(agent.model);
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center gap-3">
        <Avatar model={agent.model} size={38} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-medium">{agent.name ?? side.toUpperCase()}</span>
            <span className="text-[11px] text-faint uppercase">{side}</span>
          </div>
          <div className="truncate text-[13px] text-muted">
            {p.name} <span className="text-faint">· {p.provider.label}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip title="temperature">temp {agent.temperature ?? 1.0}</Chip>
        {agent.top_p !== undefined && <Chip title="top_p">top_p {agent.top_p}</Chip>}
        {agent.seed !== undefined && <Chip title="sampling seed">seed {agent.seed}</Chip>}
        <Chip title="max_tokens per reply">max {agent.max_tokens ?? 500}</Chip>
        {agent.reasoning?.effort && <Chip title="reasoning effort">think {agent.reasoning.effort}</Chip>}
      </div>

      {agent.system && (
        <details className="group mt-3">
          <summary className="cursor-pointer list-none text-[12px] text-faint hover:text-muted">
            <span className="group-open:hidden">▸ system prompt</span>
            <span className="hidden group-open:inline">▾ system prompt</span>
          </summary>
          <p className="mt-2 border-l border-line pl-3 text-[13px] leading-relaxed whitespace-pre-wrap text-muted">
            {agent.system}
          </p>
        </details>
      )}
    </div>
  );
}

function Bubble({
  id,
  turn,
  agent,
  stat,
  findings,
  kept,
}: {
  id: string;
  turn: Turn;
  agent: AgentConfig;
  stat?: Heuristic;
  findings: string[];
  kept: boolean;
}) {
  const right = turn.speaker === "b";
  const p = modelProfile(turn.model);
  const truncated = !!agent.max_tokens && (turn.usage?.completion_tokens ?? 0) >= agent.max_tokens;

  return (
    <div id={`turn-${turn.idx}`} className="scroll-mt-20">
      <div className={`flex gap-3 ${right ? "flex-row-reverse" : ""}`}>
        <Avatar model={turn.model} size={32} />
        <div className={`flex min-w-0 max-w-[82%] flex-col ${right ? "items-end" : "items-start"}`}>
          <div className="mb-1.5 flex items-center gap-2 text-[12px]">
            <span className="font-medium text-muted">{turn.name}</span>
            <span className="text-faint">{p.name}</span>
            <span className="text-line">·</span>
            <span className="font-mono text-faint">#{turn.idx}</span>
            <TurnKeep id={id} turn={turn.idx} initial={kept} />
          </div>

          <div
            className={`bubble rounded-2xl border px-4 py-3 text-[15px] leading-[1.65] whitespace-pre-wrap ${
              right ? "rounded-tr-sm border-line bg-raised" : "rounded-tl-sm border-line-soft bg-panel"
            } ${kept ? "ring-1 ring-accent/30" : ""}`}
            style={
              findings.length
                ? { borderColor: "color-mix(in oklab, var(--color-accent) 30%, transparent)" }
                : undefined
            }
          >
            {turn.content.trim()}
          </div>

          <div
            className={`mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-faint ${
              right ? "justify-end" : ""
            }`}
          >
            <span className="font-mono">{turn.latency}s</span>
            <span className="font-mono">{turn.usage?.completion_tokens ?? "?"} tok</span>
            {turn.provider && <span title="provider that served this turn">{turn.provider}</span>}
            {truncated && (
              <span className="text-[#c98a3f]" title={`hit max_tokens (${agent.max_tokens})`}>
                cut off
              </span>
            )}
            {stat && (
              <span className="font-mono" title="interest score">
                {stat.score.toFixed(2)}
              </span>
            )}
            {stat?.tags?.map((t) => (
              <span key={t} className="rounded bg-raised px-1.5 py-0.5">
                {t}
              </span>
            ))}
            {findings.map((f) => (
              <span key={f} className="rounded bg-accent/12 px-1.5 py-0.5 text-accent" title="flagged by a judge">
                {f}
              </span>
            ))}
            <CopyButton text={turnMarkdown(turn.name, turn.model, turn.content)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Interjection({ event }: { event: Event }) {
  if (event.type === "intervention") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[70%] rounded-full border border-[#c98a3f]/35 bg-[#c98a3f]/8 px-4 py-1.5 text-center text-[12px] text-[#c98a3f]">
          ⟐ {event.text.replace("[MODERATOR] ", "")}
          <span className="ml-2 opacity-60">({event.reason})</span>
        </div>
      </div>
    );
  }
  if (event.type === "referee" && event.collapsed) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[70%] text-center text-[12px] text-faint italic">referee: {event.why}</div>
      </div>
    );
  }
  return null;
}

function Analysis({ c }: { c: Conversation }) {
  const judge = c.analysis?.judge;
  if (!judge) return null;
  const arcs = Object.entries(judge.arcs ?? {});
  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <div className="mb-2 flex items-center gap-2 text-[12px] tracking-wide text-faint uppercase">
        <span>Arc</span>
        {c.analysis?.judges && (
          <span className="font-mono normal-case" title="judges">
            {c.analysis.judges.map((j) => modelProfile(j).name).join(" · ")}
          </span>
        )}
      </div>
      <p className="text-[14px] leading-relaxed text-muted">{judge.arc}</p>
      {arcs.length > 1 && (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none text-[12px] text-faint hover:text-muted">
            ▸ what the other judges saw
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {arcs.slice(1).map(([m, arc]) => (
              <p key={m} className="border-l border-line pl-3 text-[13px] leading-relaxed text-muted">
                <span className="font-mono text-faint">{modelProfile(m).name}: </span>
                {arc}
              </p>
            ))}
          </div>
        </details>
      )}

      {judge.findings.length > 0 && (
        <>
          <h2 className="mt-5 mb-3 text-[12px] font-medium tracking-wide text-faint uppercase">Findings</h2>
          <ol className="flex flex-col gap-3.5">
            {judge.findings.map((f, i) => (
              <li key={i} className="border-l-2 border-accent/40 pl-3.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[14px] font-medium text-accent">{f.tag}</span>
                  {f.votes && f.votes.length > 1 && (
                    <span className="text-[11px] text-accent/70" title={f.votes.join(", ")}>
                      {f.votes.length} judges
                    </span>
                  )}
                  {f.turns.map((t) => (
                    <Link key={t} href={`#turn-${t}`} className="font-mono text-[11px] text-faint hover:text-muted">
                      #{t}
                    </Link>
                  ))}
                </div>
                <p className="mt-1 text-[14px] leading-relaxed text-muted">{f.why}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-faint italic">“{f.quote.trim()}”</p>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

export default async function ConversationPage({ params }: PageProps<"/c/[id]">) {
  const { id } = await params;
  const c = getConversation(id);
  if (!c) notFound();

  const curated = readCuration()[id] ?? {};
  const kept = new Set(curated.turns ?? []);
  const stats = new Map((c.analysis?.heuristics ?? []).map((h) => [h.idx, h]));
  const flagged = new Map<number, string[]>();
  for (const f of c.analysis?.judge?.findings ?? [])
    for (const t of f.turns) flagged.set(t, [...(flagged.get(t) ?? []), f.tag]);

  const body = bodyTurns(c);
  const sibling = listConversations().find((o) => o.id !== c.id && o.config.name === c.config.name);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-[13px] text-faint hover:text-muted">
            ← all conversations
          </Link>
          {c.stopReason === "running" && <LiveRefresh />}
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[12px] text-faint">
          <span>{body.length} turns</span>
          <span>{c.tokens.toLocaleString()} tok</span>
          <span>${c.cost.toFixed(4)}</span>
          <span>{c.elapsed}s</span>
          <StopBadge reason={c.stopReason} />
          {c.analysis?.mean_interest !== undefined && <span title="mean interest">int {c.analysis.mean_interest}</span>}
          {!!c.analysis?.collapse_curve?.length && <Sparkline curve={c.analysis.collapse_curve} />}
          <CopyButton text={conversationMarkdown(c)} label="copy markdown" />
          {sibling && (
            <Link href={`/compare?a=${c.id}&b=${sibling.id}`} className="hover:text-accent">
              compare →
            </Link>
          )}
          <StarButton id={c.id} initial={!!curated.starred} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Profile agent={c.config.a} side="a" />
        <Profile agent={c.config.b} side="b" />
      </div>

      <section className="rounded-xl border border-line bg-panel p-5">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-faint">
          <span className="font-medium tracking-wide uppercase">Seed</span>
          <span className="text-line">·</span>
          <span>
            limit {c.config.max_turns} turns / {c.config.max_seconds}s / ${c.config.max_cost}
          </span>
          {c.config.stop?.referee && (
            <>
              <span className="text-line">·</span>
              <span className="font-mono">referee {modelProfile(c.config.stop.referee).name}</span>
            </>
          )}
          {c.collapseTurn && (
            <>
              <span className="text-line">·</span>
              <span className="text-[#c98a3f]">collapse detected @{c.collapseTurn}</span>
            </>
          )}
          <span className="text-line">·</span>
          <span>{new Date(c.started).toLocaleString()}</span>
        </div>
        <p className="text-[15px] leading-relaxed text-ink">{c.seed}</p>
      </section>

      <NoteBox id={c.id} initial={curated.note ?? ""} />

      <Analysis c={c} />

      <div className="flex flex-col gap-6 py-2">
        {body.map((t) => (
          <div key={t.idx} className="flex flex-col gap-6">
            <Bubble
              id={c.id}
              turn={t}
              agent={c.config[t.speaker as "a" | "b"]}
              stat={stats.get(t.idx)}
              findings={flagged.get(t.idx) ?? []}
              kept={kept.has(t.idx)}
            />
            {c.events
              .filter((e) => "after" in e && e.after === t.idx)
              .map((e, i) => (
                <Interjection key={i} event={e} />
              ))}
          </div>
        ))}
      </div>

      {c.events
        .filter((e): e is Extract<Event, { type: "error" }> => e.type === "error")
        .map((e, i) => (
          <div
            key={i}
            className="rounded-xl border border-[#e0645c]/30 bg-[#e0645c]/8 p-4 text-[13px] text-[#e0645c]"
          >
            <span className="font-mono">turn {e.idx} failed:</span> {e.error}
          </div>
        ))}
    </div>
  );
}
