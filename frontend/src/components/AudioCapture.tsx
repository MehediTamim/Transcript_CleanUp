// 2026-05-01 — Reusable audio capture card. Two entry points (Upload / Record)
// then a single "ready" state with a primary action provided by the parent
// (transcribe-only on EditorPage, run-pipeline on HearingPage). The component
// is intentionally controlled-ish: it owns the mic recorder and the picked
// file, but bubbles the final Blob + filename to the parent via onReady so the
// caller can decide what to do next.

import { useEffect, useRef, useState } from 'react'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { friendlyMessage } from '../lib/errors'
import { btnGhost, btnDanger, btnPrimary, mutedText, subtleText } from '../lib/tokens'
import { Spinner } from './Spinner'

export type AudioCaptureProps = {
  // Disable the entire card (used while the parent is busy upstream).
  disabled?: boolean
  // Label for the primary CTA shown when audio is ready (e.g. "Transcribe").
  primaryLabel: string
  // Label shown while the parent is processing the ready blob.
  primaryBusyLabel?: string
  // True while the parent's primary action is running.
  primaryBusy?: boolean
  // Fired when the user clicks the primary CTA on a ready blob.
  onPrimary: (blob: Blob, filename: string) => void
  // Bubble error messages up so the page can surface them in its own banner.
  onError?: (message: string) => void
  // Compact mode shrinks vertical padding. Defaults to false.
  compact?: boolean
}

export function AudioCapture({
  disabled = false,
  primaryLabel,
  primaryBusyLabel = 'Working…',
  primaryBusy = false,
  onPrimary,
  onError,
  compact = false,
}: AudioCaptureProps) {
  const recorder = useAudioRecorder()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pickedLabel, setPickedLabel] = useState<string | null>(null)
  const [pickedBlob, setPickedBlob] = useState<Blob | null>(null)
  const [readingFile, setReadingFile] = useState(false)

  // Forward recorder errors to the parent (translated to friendly text).
  useEffect(() => {
    if (recorder.error) onError?.(friendlyMessage(recorder.error))
  }, [recorder.error, onError])

  // Whichever source produced audio last wins.
  const blob = pickedBlob ?? recorder.blob
  const filename = pickedLabel ?? 'recording.webm'
  const ready = !!blob && !recorder.recording

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    recorder.reset()
    setPickedLabel(f.name)
    setReadingFile(true)
    try {
      const buf = await f.arrayBuffer()
      setPickedBlob(new Blob([buf], { type: f.type || 'audio/webm' }))
    } catch (err) {
      onError?.(friendlyMessage(err))
    } finally {
      setReadingFile(false)
    }
  }

  const clearAudio = () => {
    setPickedBlob(null)
    setPickedLabel(null)
    recorder.reset()
  }

  const busy = disabled || readingFile || primaryBusy

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/webm,.webm,.mp3,.wav,.m4a,.ogg"
        className="hidden"
        onChange={(e) => void onPickFile(e)}
      />
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={busy || recorder.recording}
          onClick={() => fileInputRef.current?.click()}
          className={`${btnGhost} h-12 flex-1`}
        >
          <svg
            className="size-4 opacity-70"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
          Upload a file
        </button>
        {!recorder.recording ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void recorder.start()}
            className={`${btnGhost} h-12 flex-1`}
          >
            <span className="flex size-2 rounded-full bg-emerald-400/90" aria-hidden />
            Record with mic
          </button>
        ) : (
          <button
            type="button"
            onClick={recorder.stop}
            className={`${btnDanger} h-12 flex-1`}
          >
            <span className="flex size-2 animate-pulse rounded-full bg-white" aria-hidden />
            Stop recording
          </button>
        )}
      </div>

      {recorder.recording ? (
        <p className={`text-center text-sm ${mutedText}`}>We&apos;re listening…</p>
      ) : null}

      {readingFile ? (
        <p className="flex justify-center gap-2 text-sm text-zinc-400">
          <Spinner className="text-violet-400" /> Reading file…
        </p>
      ) : null}

      {ready ? (
        <div className="rounded-2xl border border-white/[0.05] bg-black/25 p-4">
          <p className={`text-center text-xs ${subtleText}`}>
            {pickedLabel ? `“${pickedLabel}”` : 'Recording'} ready
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onPrimary(blob, filename)}
            className={`${btnPrimary} mt-3 h-11 w-full`}
          >
            {primaryBusy ? (
              <>
                <Spinner className="text-zinc-700" /> {primaryBusyLabel}
              </>
            ) : (
              primaryLabel
            )}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={clearAudio}
            className="mt-2 w-full text-center text-xs text-zinc-500 transition hover:text-zinc-300"
          >
            Remove audio
          </button>
        </div>
      ) : null}
    </div>
  )
}
