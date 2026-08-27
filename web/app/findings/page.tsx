import { allFindings, bodyTurns } from "@/lib/logs";
import { familyOf } from "@/lib/phenomena";
import { FindingsBrowser, type FindingRow } from "@/components/findings-browser";

export default function Findings() {
  const rows: FindingRow[] = allFindings().map(({ finding: f, conversation: c }) => ({
    id: c.id,
    config: c.config.name ?? c.id,
    started: c.started,
    tag: f.tag,
    family: familyOf(f.tag),
    why: f.why,
    quote: f.quote,
    turns: f.turns,
    votes: f.votes?.length ?? 1,
    altTags: f.alt_tags ?? [],
    a: c.config.a.model,
    b: c.config.b.model,
    conversationTurns: bodyTurns(c).length,
  }));

  return <FindingsBrowser rows={rows} />;
}
