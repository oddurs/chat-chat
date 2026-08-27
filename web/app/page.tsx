import Link from "next/link";
import { listConversations, bodyTurns, LOG_DIR } from "@/lib/logs";
import { readCuration } from "@/lib/curation";
import { Avatar, modelProfile } from "@/lib/profiles";
import { Sparkline, StopBadge } from "@/components/bits";
import { StarButton } from "@/components/curate";
import { LiveRefresh } from "@/components/live";

export const dynamic = "force-dynamic"; // logs land on disk between requests

function when(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const onlyStarred = params?.starred === "1";
  const configFilter = typeof params?.config === "string" ? params.config : null;

  const curation = readCuration();
  let conversations = listConversations();
  const configs = [...new Set(conversations.map((c) => c.config.name ?? c.id))].sort();
  if (onlyStarred) conversations = conversations.filter((c) => curation[c.id]?.starred);
  if (configFilter) conversations = conversations.filter((c) => c.config.name === configFilter);

  const live = conversations.some((c) => c.stopReason === "running");
  const spend = conversations.reduce((n, c) => n + c.cost, 0);

  if (!listConversations().length) {
    return (
      <div className="rounded-xl border border-line bg-panel p-8 text-[14px] text-muted">
        <p className="mb-3 text-ink">No conversations yet.</p>
        <code className="block font-mono text-[13px] text-accent">./chatchat.py batch matrix.toml</code>
        <p className="mt-4 text-[13px] text-faint">
          Reading <span className="font-mono">{LOG_DIR}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="mb-1 flex flex-wrap items-center gap-3 text-[13px]">
        <span className="tracking-wide text-faint uppercase">
          {conversations.length} conversation{conversations.length === 1 ? "" : "s"} · ${spend.toFixed(3)}
        </span>
        {live && <LiveRefresh />}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Link
            href={onlyStarred ? "/" : "/?starred=1"}
            className={`rounded-md border px-2 py-0.5 ${
              onlyStarred ? "border-accent/40 bg-accent/12 text-accent" : "border-line text-faint hover:text-muted"
            }`}
          >
            ★ starred
          </Link>
          {configs.map((name) => (
            <Link
              key={name}
              href={configFilter === name ? "/" : `/?config=${encodeURIComponent(name)}`}
              className={`rounded-md border px-2 py-0.5 font-mono text-[12px] ${
                configFilter === name
                  ? "border-accent/40 bg-accent/12 text-accent"
                  : "border-line text-faint hover:text-muted"
              }`}
            >
              {name}
            </Link>
          ))}
        </span>
      </div>

      {conversations.map((c) => {
        const a = modelProfile(c.config.a.model);
        const b = modelProfile(c.config.b.model);
        const findings = c.analysis?.judge?.findings ?? [];
        const curated = curation[c.id];
        return (
          <div
            key={c.id}
            className="group rounded-xl border border-line bg-panel p-5 transition-colors hover:bg-raised"
          >
            <div className="flex items-start justify-between gap-4">
              <Link href={`/c/${c.id}`} className="min-w-0 grow">
                <div className="flex items-center gap-2.5">
                  <Avatar model={c.config.a.model} size={26} />
                  <span className="text-[14px] font-medium">{c.config.a.name ?? "A"}</span>
                  <span className="text-[13px] text-faint">vs</span>
                  <span className="text-[14px] font-medium">{c.config.b.name ?? "B"}</span>
                  <Avatar model={c.config.b.model} size={26} />
                  {c.stopReason === "running" && <LiveRefresh />}
                </div>
                <p className="mt-2.5 line-clamp-2 text-[14px] leading-relaxed text-muted">{c.seed}</p>
                {curated?.note && (
                  <p className="mt-2 border-l-2 border-accent/40 pl-2.5 text-[13px] text-accent/90 italic">
                    {curated.note}
                  </p>
                )}
              </Link>
              <div className="shrink-0 text-right text-[12px] text-faint">
                <div className="flex items-center justify-end gap-2">
                  <StarButton id={c.id} initial={!!curated?.starred} />
                </div>
                <div className="mt-1.5 font-mono text-[13px] text-muted">{c.config.name ?? c.id}</div>
                <div className="mt-0.5">{when(c.started)}</div>
                {!!c.analysis?.collapse_curve?.length && (
                  <div className="mt-2 flex justify-end">
                    <Sparkline curve={c.analysis.collapse_curve} />
                  </div>
                )}
              </div>
            </div>

            <Link
              href={`/c/${c.id}`}
              className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-faint"
            >
              <span className="font-mono">{a.name}</span>
              <span className="text-line">·</span>
              <span className="font-mono">{b.name}</span>
              <span className="text-line">·</span>
              <span>{bodyTurns(c).length} turns</span>
              <span>{c.tokens.toLocaleString()} tok</span>
              <span>${c.cost.toFixed(3)}</span>
              <span>{c.elapsed}s</span>
              <StopBadge reason={c.stopReason} />
              {c.interventions > 0 && (
                <span className="text-[#c98a3f]" title="harness provocations injected">
                  ⟐ {c.interventions}
                </span>
              )}
              {findings.length > 0 && (
                <span className="ml-auto rounded-full border border-accent/35 bg-accent/10 px-2 py-0.5 text-accent">
                  {findings.length} findings
                </span>
              )}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
