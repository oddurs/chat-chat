import { Fragment } from "react";
import { parseBlocks, type Block, type Inline } from "@/lib/markdown";

function renderInline(nodes: Inline[]): React.ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return <Fragment key={i}>{n.v}</Fragment>;
      case "b":
        return (
          <strong key={i} className="font-semibold text-ink">
            {renderInline(n.kids)}
          </strong>
        );
      case "i":
        return (
          <em key={i} className="italic">
            {renderInline(n.kids)}
          </em>
        );
      case "code":
        return (
          <code
            key={i}
            className="rounded border border-line-soft bg-bg/60 px-1 py-px font-mono text-[0.88em] text-ink"
          >
            {n.v}
          </code>
        );
      case "link":
        return (
          <a
            key={i}
            href={n.href}
            rel="noreferrer noopener"
            target="_blank"
            className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
          >
            {renderInline(n.kids)}
          </a>
        );
    }
  });
}

function renderBlock(b: Block, i: number): React.ReactNode {
  switch (b.t) {
    case "p":
      return (
        <p key={i} className="whitespace-pre-wrap">
          {renderInline(b.kids)}
        </p>
      );
    case "h":
      return (
        <p key={i} className="font-semibold text-ink" style={{ fontSize: `${1.15 - b.level * 0.03}em` }}>
          {renderInline(b.kids)}
        </p>
      );
    case "ul":
      return (
        <ul key={i} className="list-outside list-disc space-y-1 pl-5 marker:text-faint">
          {b.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol
          key={i}
          start={b.start}
          className="list-outside list-decimal space-y-1 pl-5 marker:font-mono marker:text-faint"
        >
          {b.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote key={i} className="border-l-2 border-line pl-3 text-muted italic">
          {renderInline(b.kids)}
        </blockquote>
      );
    case "code":
      return (
        <pre
          key={i}
          className="overflow-x-auto rounded-lg border border-line-soft bg-bg/60 p-3 font-mono text-[0.85em] leading-relaxed"
        >
          <code>{b.v}</code>
        </pre>
      );
    case "table":
      return (
        <div key={i} className="overflow-x-auto">
          <table className="w-full border-collapse text-[0.95em]">
            <thead>
              <tr>
                {b.head.map((cell, j) => (
                  <th
                    key={j}
                    className="border-b border-line px-2 py-1.5 text-left font-medium text-faint"
                  >
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, j) => (
                <tr key={j} className="border-b border-line-soft last:border-0">
                  {row.map((cell, k) => (
                    <td key={k} className="px-2 py-1.5 align-top">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr key={i} className="border-line" />;
  }
}

/** Model output, rendered with the small amount of markdown these models actually emit. */
export function Prose({ text, className = "" }: { text: string; className?: string }) {
  return <div className={`flex flex-col gap-3 ${className}`}>{parseBlocks(text).map(renderBlock)}</div>;
}

/** Single-line contexts (finding quotes, table cells): inline formatting only, no block layout. */
export function ProseLine({ text }: { text: string }) {
  return <>{renderInline(parseBlocks(text).flatMap((b) => ("kids" in b ? b.kids : [])))}</>;
}
