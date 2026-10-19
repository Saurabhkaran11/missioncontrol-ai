export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-semibold tracking-tight text-ink ${className}`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <rect x="1" y="1" width="22" height="22" rx="6" fill="#3346D3" />
        <circle
          cx="12"
          cy="12"
          r="5.5"
          fill="none"
          stroke="white"
          strokeWidth="2"
        />
        <circle cx="12" cy="12" r="1.8" fill="white" />
      </svg>
      MissionControl<span className="text-accent">AI</span>
    </span>
  );
}
