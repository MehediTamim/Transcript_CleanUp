// 2026-05-01 — Generic segmented control. Used in three places:
//   1. Raw / Preview toggle inside MarkdownDocCard
//   2. Editor / Hearing mode pills in TopBar
//   3. Source / Chat / Final tabs on mobile in EditorPage
// Generic over the option ids so the consumer gets type-safe onChange.

import type { ReactNode } from 'react'

export type SegmentedTabOption<T extends string> = {
  id: T
  label: string
  icon?: ReactNode
  badge?: string
}

type Props<T extends string> = {
  options: ReadonlyArray<SegmentedTabOption<T>>
  value: T
  onChange: (id: T) => void
  ariaLabel?: string
  className?: string
  size?: 'sm' | 'md'
  fullWidth?: boolean
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
  size = 'sm',
  fullWidth = false,
}: Props<T>) {
  const padX = size === 'sm' ? 'px-3.5' : 'px-4'
  const padY = size === 'sm' ? 'py-1.5' : 'py-2'
  const text = size === 'sm' ? 'text-xs' : 'text-sm'
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex gap-1 rounded-full border border-white/[0.08] bg-black/30 p-1 ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
    >
      {options.map((opt) => {
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={`${fullWidth ? 'flex-1' : ''} inline-flex items-center justify-center gap-1.5 rounded-full ${padX} ${padY} ${text} font-medium transition ${
              active
                ? 'bg-white/[0.12] text-zinc-100 shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]'
                : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            {opt.icon}
            <span>{opt.label}</span>
            {opt.badge ? (
              <span className="ml-1 rounded-full bg-violet-500/20 px-1.5 text-[10px] font-semibold text-violet-200">
                {opt.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
