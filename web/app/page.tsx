import { summaries } from "@/lib/summary";
import { ConversationList } from "@/components/conversation-list";

export default function Home() {
  const rows = summaries();

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-line bg-panel p-8 text-[14px] text-muted">
        <p className="mb-3 text-ink">No conversations in this build.</p>
        <code className="block font-mono text-[13px] text-accent">./chatchat.py batch matrices/screen.toml</code>
      </div>
    );
  }

  return <ConversationList summaries={rows} />;
}
