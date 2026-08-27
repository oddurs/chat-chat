import type { Conversation } from "@/lib/logs";

export function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="rounded-md border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted"
    >
      {children}
    </span>
  );
}

const STOP_STYLE: Record<string, string> = {
  collapse: "text-[#c98a3f]",
  error: "text-[#e0645c]",
  crash: "text-[#e0645c]",
  budget: "text-[#c98a3f]",
  batch_budget: "text-[#c98a3f]",
  running: "text-accent",
};

export function StopBadge({ reason }: { reason: string }) {
  return <span className={STOP_STYLE[reason] ?? "text-faint"}>{reason.replace(/_/g, " ")}</span>;
}

/** Collapse pressure over the conversation. Flat and low is a live conversation. */
export function Sparkline({ curve, threshold = 0.55 }: { curve: number[]; threshold?: number }) {
  if (curve.length < 2) return null;
  const w = 120;
  const h = 22;
  const pts = curve
    .map((v, i) => `${(i / (curve.length - 1)) * w},${h - Math.max(0, Math.min(1, v)) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible" aria-label="collapse pressure">
      <line
        x1="0"
        x2={w}
        y1={h - threshold * h}
        y2={h - threshold * h}
        stroke="var(--color-line)"
        strokeDasharray="2 3"
      />
      <polyline points={pts} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" opacity="0.85" />
    </svg>
  );
}

export function conversationMarkdown(c: Conversation) {
  const head = [
    `# ${c.config.name ?? c.id}`,
    "",
    `**${c.config.a.name}** — \`${c.config.a.model}\` · **${c.config.b.name}** — \`${c.config.b.model}\``,
    "",
    `> ${c.seed}`,
    "",
  ];
  const body = c.turns
    .filter((t) => t.speaker !== "seed")
    .map((t) => `**${t.name}** · \`${t.model}\`\n\n${t.content.trim()}\n`);
  return [...head, ...body].join("\n");
}

export function turnMarkdown(name: string, model: string | null, content: string) {
  return `**${name}**${model ? ` · \`${model}\`` : ""}\n\n${content.trim()}\n`;
}
