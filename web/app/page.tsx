import Link from "next/link";
import { listConversations, logDir } from "@/lib/logs";
import { Avatar, modelProfile } from "@/lib/profiles";

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

export default function Home() {
  const conversations = listConversations();

  if (!conversations.length) {
    return (
      <div className="rounded-xl border border-line bg-panel p-8 text-[14px] text-muted">
        <p className="mb-3 text-ink">No conversations yet.</p>
        <p>
          Run one, then reload:
          <code className="mt-2 block font-mono text-[13px] text-accent">
            ./chatchat.py run configs/cross-model.toml
          </code>
        </p>
        <p className="mt-4 text-[13px] text-faint">
          Reading <span className="font-mono">{logDir()}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="mb-1 text-[13px] font-medium tracking-wide text-faint uppercase">
        {conversations.length} conversation{conversations.length === 1 ? "" : "s"}
      </h1>

      {conversations.map((c) => {
        const a = modelProfile(c.config.a.model);
        const b = modelProfile(c.config.b.model);
        const findings = c.analysis?.judge?.findings ?? [];
        return (
          <Link
            key={c.id}
            href={`/c/${c.id}`}
            className="group rounded-xl border border-line bg-panel p-5 transition-colors hover:border-line/0 hover:bg-raised hover:ring-1 hover:ring-line"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <Avatar model={c.config.a.model} size={26} />
                  <span className="text-[14px] font-medium">{c.config.a.name ?? "A"}</span>
                  <span className="text-[13px] text-faint">vs</span>
                  <span className="text-[14px] font-medium">{c.config.b.name ?? "B"}</span>
                  <Avatar model={c.config.b.model} size={26} />
                </div>
                <p className="mt-2.5 line-clamp-2 text-[14px] leading-relaxed text-muted">
                  {c.config.seed}
                </p>
              </div>
              <div className="shrink-0 text-right text-[12px] text-faint">
                <div className="font-mono text-[13px] text-muted">{c.config.name ?? c.id}</div>
                <div className="mt-1">{when(c.started)}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-faint">
              <span className="font-mono">{a.name}</span>
              <span className="text-line">·</span>
              <span className="font-mono">{b.name}</span>
              <span className="text-line">·</span>
              <span>{c.turns.filter((t) => t.speaker !== "seed").length} turns</span>
              <span>{c.tokens.toLocaleString()} tok</span>
              <span>${c.cost.toFixed(3)}</span>
              <span>{c.elapsed}s</span>
              <span
                className={
                  c.stopReason === "error" ? "text-[#e0645c]" : "text-faint"
                }
              >
                {c.stopReason.replace("_", " ")}
              </span>
              {findings.length > 0 && (
                <span className="ml-auto rounded-full border border-accent/35 bg-accent/10 px-2 py-0.5 text-accent">
                  {findings.length} findings
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
