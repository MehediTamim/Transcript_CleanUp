// 2026-05-01 — Tiny accessible spinner. Inherits color via currentColor so any
// parent can tint it (e.g. white on dark buttons, violet on muted surfaces).

type Props = {
  className?: string
  label?: string
}

export function Spinner({ className = '', label }: Props) {
  return (
    <span role={label ? 'status' : undefined} className="inline-flex items-center gap-2">
      <svg
        className={`size-4 animate-spin ${className}`}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {label ? <span className="text-xs text-zinc-400">{label}</span> : null}
    </span>
  )
}
