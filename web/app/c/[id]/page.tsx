import Link from "next/link";
import { notFound } from "next/navigation";
import { getConversation, type AgentConfig, type Conversation, type Turn } from "@/lib/logs";
import { Avatar, modelProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="rounded-md border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted"
    >
      {children}
    </span>
  );
}

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
        <Chip title="max_tokens per reply">max {agent.max_tokens ?? 400}</Chip>
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
  turn,
  agent,
  score,
  tags,
  findings,
}: {
  turn: Turn;
  agent: AgentConfig;
  score?: number;
  tags?: string[];
  findings: string[];
}) {
  const right = turn.speaker === "b";
  const p = modelProfile(turn.model);
  const truncated =
    !!agent.max_tokens && (turn.usage?.completion_tokens ?? 0) >= agent.max_tokens;

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
          </div>

          <div
            className={`bubble rounded-2xl border px-4 py-3 text-[15px] leading-[1.65] whitespace-pre-wrap ${
              right
                ? "rounded-tr-sm border-line bg-raised"
                : "rounded-tl-sm border-line-soft bg-panel"
            }`}
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
            {truncated && (
              <span className="text-[#c98a3f]" title={`hit max_tokens (${agent.max_tokens})`}>
                cut off
              </span>
            )}
            {score !== undefined && (
              <span className="font-mono" title="heuristic interest score">
                {score.toFixed(2)}
              </span>
            )}
            {tags?.map((t) => (
              <span key={t} className="rounded bg-raised px-1.5 py-0.5">
                {t}
              </span>
            ))}
            {findings.map((f) => (
              <span
                key={f}
                className="rounded bg-accent/12 px-1.5 py-0.5 text-accent"
                title="flagged by the judge"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Analysis({ c }: { c: Conversation }) {
  const judge = c.analysis?.judge;
  if (!judge) return null;
  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <h2 className="mb-2 text-[12px] font-medium tracking-wide text-faint uppercase">Arc</h2>
      <p className="text-[14px] leading-relaxed text-muted">{judge.arc}</p>
      {!!judge.collapse_turn && (
        <p className="mt-2 text-[13px] text-[#c98a3f]">
          Collapsed around{" "}
          <Link href={`#turn-${judge.collapse_turn}`} className="underline underline-offset-2">
            turn {judge.collapse_turn}
          </Link>
        </p>
      )}

      {judge.findings.length > 0 && (
        <>
          <h2 className="mt-5 mb-3 text-[12px] font-medium tracking-wide text-faint uppercase">
            Findings
          </h2>
          <ol className="flex flex-col gap-3.5">
            {judge.findings.map((f, i) => (
              <li key={i} className="border-l-2 border-accent/40 pl-3.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[14px] font-medium text-accent">{f.tag}</span>
                  {f.turns.map((t) => (
                    <Link
                      key={t}
                      href={`#turn-${t}`}
                      className="font-mono text-[11px] text-faint hover:text-muted"
                    >
                      #{t}
                    </Link>
                  ))}
                </div>
                <p className="mt-1 text-[14px] leading-relaxed text-muted">{f.why}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-faint italic">
                  “{f.quote.trim()}”
                </p>
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

  const heur = new Map((c.analysis?.heuristics ?? []).map((h) => [h.idx, h]));
  const flagged = new Map<number, string[]>();
  for (const f of c.analysis?.judge?.findings ?? [])
    for (const t of f.turns) flagged.set(t, [...(flagged.get(t) ?? []), f.tag]);

  const body = c.turns.filter((t) => t.speaker !== "seed");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-[13px] text-faint hover:text-muted">
          ← all conversations
        </Link>
        <div className="flex items-center gap-3 font-mono text-[12px] text-faint">
          <span>{body.length} turns</span>
          <span>{c.tokens.toLocaleString()} tok</span>
          <span>${c.cost.toFixed(4)}</span>
          <span>{c.elapsed}s</span>
          <span className={c.stopReason === "error" ? "text-[#e0645c]" : ""}>
            {c.stopReason.replace("_", " ")}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Profile agent={c.config.a} side="a" />
        <Profile agent={c.config.b} side="b" />
      </div>

      <section className="rounded-xl border border-line bg-panel p-5">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-faint">
          <span className="font-medium tracking-wide text-faint uppercase">Seed</span>
          <span className="text-line">·</span>
          <span className="font-mono">{c.configPath}</span>
          <span className="text-line">·</span>
          <span>limit {c.config.max_turns} turns / {c.config.max_seconds}s</span>
          <span className="text-line">·</span>
          <span>{new Date(c.started).toLocaleString()}</span>
        </div>
        <p className="text-[15px] leading-relaxed text-ink">{c.config.seed}</p>
      </section>

      <Analysis c={c} />

      <div className="flex flex-col gap-6 py-2">
        {body.map((t) => (
          <Bubble
            key={t.idx}
            turn={t}
            agent={c.config[t.speaker as "a" | "b"]}
            score={heur.get(t.idx)?.score}
            tags={heur.get(t.idx)?.tags}
            findings={flagged.get(t.idx) ?? []}
          />
        ))}
      </div>

      {c.errors.map((e) => (
        <div
          key={e.idx}
          className="rounded-xl border border-[#e0645c]/30 bg-[#e0645c]/8 p-4 text-[13px] text-[#e0645c]"
        >
          <span className="font-mono">turn {e.idx} failed:</span> {e.error}
        </div>
      ))}
    </div>
  );
}
