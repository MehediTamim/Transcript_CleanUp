import { useEffect, useRef, useState } from 'react'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { friendlyMessage } from '../lib/errors'
import { btnGhost, btnDanger, btnPrimary, mutedText, subtleText } from '../lib/tokens'
import { Spinner } from './Spinner'

export type AudioCaptureProps = {
  disabled?: boolean
  primaryLabel: string
  primaryBusyLabel?: string
  primaryBusy?: boolean
  onPrimary: (blob: Blob, filename: string) => void
  onError?: (message: string) => void
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
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  // Whichever source produced audio last wins.
  const blob = pickedBlob ?? recorder.blob
  const filename = pickedLabel ?? 'recording.webm'
  const ready = !!blob && !recorder.recording

  // Forward recorder errors to the parent.
  useEffect(() => {
    if (recorder.error) onError?.(friendlyMessage(recorder.error))
  }, [recorder.error, onError])

  // Create a playable object URL whenever the active blob changes, revoke the old one.
  useEffect(() => {
    if (!blob) { setAudioUrl(null); return }
    const url = URL.createObjectURL(blob)
    setAudioUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

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
        <p className={`text-center text-sm ${mutedText}`}>We&apos;re listening&hellip;</p>
      ) : null}

      {readingFile ? (
        <p className="flex justify-center gap-2 text-sm text-zinc-400">
          <Spinner className="text-violet-400" /> Reading file&hellip;
        </p>
      ) : null}

      {ready ? (
        <div className="rounded-2xl border border-white/[0.05] bg-black/25 p-4">
          <p className={`text-center text-xs ${subtleText}`}>
            {pickedLabel ? `"${pickedLabel}"` : 'Recording'} ready
          </p>

          {audioUrl ? (
            <audio
              controls
              src={audioUrl}
              className="mt-3 w-full rounded-lg"
              aria-label="Preview audio"
            />
          ) : null}

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
