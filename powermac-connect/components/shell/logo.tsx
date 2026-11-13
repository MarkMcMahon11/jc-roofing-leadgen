export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="size-8 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#10244d" />
        <rect x="0.5" y="0.5" width="63" height="63" rx="13.5" fill="none" stroke="#2f7dff" strokeOpacity="0.45" />
        <path d="M14 46V18h14.5c6.4 0 10.5 3.9 10.5 9.6S34.9 37.2 28.5 37.2H21V46h-7Zm7-14.9h6.9c2.6 0 4.1-1.4 4.1-3.6s-1.5-3.6-4.1-3.6H21v7.2Z" fill="#e8edf7" />
        <path d="M38 46 44 30l6 16" stroke="#66a3ff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      {!compact && (
        <div className="leading-none">
          <div className="text-[15px] font-semibold tracking-[0.02em] text-fg">
            POWERMAC <span className="text-accent-hi">CONNECT</span>
          </div>
          <div className="mt-1 text-[10.5px] tracking-[0.08em] text-subtle uppercase">Construction OS</div>
        </div>
      )}
    </div>
  );
}
