"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

/** Keeps the command centre current: refreshes server data every minute while visible. */
export function LiveRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [at, setAt] = useState(() => new Date());
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      start(() => router.refresh());
      setAt(new Date());
    };
    const id = setInterval(tick, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return (
    <button
      onClick={() => { start(() => router.refresh()); setAt(new Date()); }}
      className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-xs text-muted hover:text-fg"
      aria-label="Refresh now"
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-ok" />
      </span>
      {/* the time is per-viewer by design: server and browser render it at different moments */}
      Live · <span suppressHydrationWarning>{at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}</span>
      <RefreshCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
    </button>
  );
}
