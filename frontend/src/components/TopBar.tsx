// 2026-05-01 — Persistent header for both routes. Holds:
//   - brand mark (Clarity)
//   - mode pills (Editor / Hearing) — driven by react-router's location
//   - live status dot + label (idle / recording / streaming / finalized)
//   - secondary action slot (e.g. "New document" on the editor page)
// Status is intentionally a small visual chip rather than a noisy banner so it
// stays out of the user's way once they understand the system.

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

export type WorkspaceStatus =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'transcribing' }
  | { kind: 'streaming'; label?: string }
  | { kind: 'finalized' }
  | { kind: 'error' }

type Props = {
  status?: WorkspaceStatus
  actions?: ReactNode
}

function statusVisual(status: WorkspaceStatus | undefined): {
  dot: string
  label: string
  pulse: boolean
} {
  switch (status?.kind) {
    case 'recording':
      return { dot: 'bg-rose-400', label: 'Recording', pulse: true }
    case 'transcribing':
      return { dot: 'bg-violet-400', label: 'Transcribing', pulse: true }
    case 'streaming':
      return {
        dot: 'bg-violet-400',
        label: status.label ?? 'Streaming',
        pulse: true,
      }
    case 'finalized':
      return { dot: 'bg-emerald-400', label: 'Finalized', pulse: false }
    case 'error':
      return { dot: 'bg-rose-500', label: 'Error', pulse: false }
    case 'idle':
    default:
      return { dot: 'bg-zinc-500', label: 'Ready', pulse: false }
  }
}

export function TopBar({ status, actions }: Props) {
  const visual = statusVisual(status)

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="group inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-white"
          aria-label="Clarity home"
        >
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-[11px] font-bold text-white shadow-lg shadow-violet-900/40">
            C
          </span>
          <span className="hidden sm:inline">Clarity</span>
        </Link>
        <span
          className="hidden h-5 w-px bg-white/10 sm:inline-block"
          aria-hidden
        />
        <div
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-black/30 px-3 py-1 text-[11px] text-zinc-400"
          aria-live="polite"
        >
          <span
            className={`relative inline-flex size-2 rounded-full ${visual.dot}`}
            aria-hidden
          >
            {visual.pulse ? (
              <span
                className={`absolute inset-0 animate-ping rounded-full ${visual.dot} opacity-60`}
              />
            ) : null}
          </span>
          {visual.label}
        </div>
      </div>

      <div className="flex items-center gap-2">{actions}</div>
    </div>
  )
}
