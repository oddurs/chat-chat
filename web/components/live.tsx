"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** A run still writing to its log: re-render the server component every few seconds. */
export function LiveRefresh({ every = 3000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [router, every]);

  return (
    <span className="flex items-center gap-1.5 text-[12px] text-accent">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-accent opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      live
    </span>
  );
}
