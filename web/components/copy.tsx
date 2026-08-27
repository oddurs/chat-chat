"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className={`text-faint transition-colors hover:text-muted ${className}`}
      title="copy as markdown"
    >
      {done ? "copied" : label}
    </button>
  );
}
