// 2026-05-01 — Inline error banner. Uses role="alert" so screen readers announce
// the message immediately when it appears. Optional onDismiss renders a close
// button so transient errors can be cleared without a page action.

type Props = {
  message: string | null
  onDismiss?: () => void
  className?: string
}

export function ErrorBanner({ message, onDismiss, className = '' }: Props) {
  if (!message) return null
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-950/30 px-4 py-3 text-sm text-rose-100/90 ${className}`}
    >
      <svg
        className="mt-0.5 size-4 shrink-0 text-rose-300"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="0.6" fill="currentColor" />
      </svg>
      <p className="flex-1 leading-relaxed">{message}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="rounded-md p-1 text-rose-200/70 transition hover:bg-rose-500/10 hover:text-rose-100"
        >
          <svg
            className="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  )
}
