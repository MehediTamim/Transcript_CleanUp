// 2026-05-01 — Legacy LangGraph "quick pass" pipeline (Research → human gate →
// Cleanup) presented as a side drawer instead of a footer accordion. Keeping
// it accessible but out of the main editor flow respects the README's primary
// chat-driven journey while still serving users who want a one-shot output.

import { useCallback, useEffect, useState } from 'react'
import { apiJson } from '../api'
import { Spinner } from './Spinner'
import { btnGhost, btnPrimary, eyebrow } from '../lib/tokens'
import type { RunCreateResponse, RunStateResponse } from '../types'

type Props = {
  open: boolean
  onClose: () => void
  rawTranscript: string
  onError: (e: unknown) => void
}

export function LegacyQuickPass({ open, onClose, rawTranscript, onError }: Props) {
  const [run, setRun] = useState<RunStateResponse | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [edit, setEdit] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(
    async (tid: string) => {
      try {
        const s = await apiJson<RunStateResponse>(`/api/runs/${tid}`)
        setRun(s)
        if (s.interrupt?.research_enriched) setEdit(s.interrupt.research_enriched)
      } catch (e) {
        onError(e)
      }
    },
    [onError],
  )

  const start = async () => {
    const t = rawTranscript.trim()
    if (!t) {
      onError(new Error('Add some text first.'))
      return
    }
    setBusy(true)
    setRun(null)
    setThreadId(null)
    try {
      const created = await apiJson<RunCreateResponse>('/api/runs', {
        method: 'POST',
        body: JSON.stringify({ raw_transcript: t }),
      })
      setThreadId(created.thread_id)
      await refresh(created.thread_id)
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }

  const resume = async (editedText: string | null) => {
    if (!threadId) return
    setBusy(true)
    try {
      await apiJson<RunStateResponse>(`/api/runs/${threadId}/resume`, {
        method: 'POST',
        body: JSON.stringify({ edited_text: editedText }),
      })
      await refresh(threadId)
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }

  // Reset internal state when the drawer is closed so reopening starts fresh.
  useEffect(() => {
    if (!open) {
      setRun(null)
      setThreadId(null)
      setEdit('')
      setBusy(false)
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Quick pass pipeline"
    >
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-white/[0.06] bg-zinc-950/95 p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className={`${eyebrow} mb-1`}>Legacy</p>
            <h3 className="text-sm font-semibold text-white">Quick pass (auto-clean)</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              One-shot pipeline: Research → human review → Cleanup. No chat.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-100"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          disabled={busy || !rawTranscript.trim()}
          onClick={() => void start()}
          className={`${btnPrimary} h-10`}
        >
          {busy && !run ? (
            <>
              <Spinner className="text-zinc-700" /> Starting…
            </>
          ) : (
            'Run quick pass'
          )}
        </button>

        {run?.status === 'running' ? (
          <p className="flex items-center gap-2 text-xs text-zinc-400">
            <Spinner className="size-3" /> Pipeline running…
          </p>
        ) : null}

        {run?.status === 'awaiting_human' ? (
          <div className="space-y-2">
            <p className="text-xs text-zinc-400">
              Review and tweak the enriched draft, then continue:
            </p>
            <textarea
              value={edit}
              onChange={(e) => setEdit(e.target.value)}
              rows={10}
              className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs leading-relaxed text-zinc-200 outline-none focus:border-violet-500/40"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void resume(edit)}
                className={`${btnPrimary} h-9 px-4`}
              >
                Continue with edits
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void resume(null)}
                className={`${btnGhost} h-9`}
              >
                Use as suggested
              </button>
            </div>
          </div>
        ) : null}

        {run?.status === 'completed' &&
        typeof run.values.final_clean === 'string' ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-300">Result</p>
            <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs leading-relaxed text-zinc-200">
              {run.values.final_clean}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  )
}
