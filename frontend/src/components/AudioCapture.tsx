import { useEffect, useRef, useState } from 'react'
import { btnGhost, btnPrimary, subtleText } from '../lib/tokens'
import { Spinner } from './Spinner'

const SUPPORTED_MIME_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a',
  'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/webm', 'video/webm',
  'audio/ogg', 'audio/flac', 'audio/x-flac', 'audio/aac',
])
const SUPPORTED_EXTENSIONS = new Set([
  'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac', 'aac',
])

function isSupportedFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return SUPPORTED_MIME_TYPES.has(file.type) || SUPPORTED_EXTENSIONS.has(ext)
}

export type AudioCaptureProps = {
  disabled?: boolean
  primaryLabel: string
  primaryBusyLabel?: string
  primaryBusy?: boolean
  onPrimary: (blob: Blob, filename: string) => void
  compact?: boolean
}

export function AudioCapture({
  disabled = false,
  primaryLabel,
  primaryBusyLabel = 'Working…',
  primaryBusy = false,
  onPrimary,
  compact = false,
}: AudioCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pickedLabel, setPickedLabel] = useState<string | null>(null)
  const [pickedBlob, setPickedBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const blob = pickedBlob ?? null
  const filename = pickedLabel ?? 'audio.webm'
  const ready = !!blob

  // Create a playable object URL whenever the blob changes, revoke the old one.
  useEffect(() => {
    if (!blob) { setAudioUrl(null); return }
    const url = URL.createObjectURL(blob)
    setAudioUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return

    if (!isSupportedFile(f)) {
      const ext = f.name.split('.').pop()?.toUpperCase() ?? 'this format'
      setFileError(
        `"${f.name}" is not supported. Please upload an audio file (MP3, WAV, M4A, WEBM, OGG, FLAC, AAC).`
      )
      setPickedBlob(null)
      setPickedLabel(null)
      return
    }

    setFileError(null)
    setPickedLabel(f.name)
    setPickedBlob(f) // File extends Blob — use directly to preserve MIME type
  }

  const clearAudio = () => {
    setPickedBlob(null)
    setPickedLabel(null)
    setFileError(null)
  }

  const busy = disabled || primaryBusy

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/webm,.webm,.mp3,.wav,.m4a,.ogg"
        className="hidden"
        onChange={(e) => void onPickFile(e)}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => fileInputRef.current?.click()}
        className={`${btnGhost} h-12 w-full`}
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
        Upload audio file
      </button>

      {fileError ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          <svg
            className="mt-0.5 size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <span>{fileError}</span>
        </div>
      ) : null}

      {ready ? (
        <div className="rounded-2xl border border-white/[0.05] bg-black/25 p-4">
          <p className={`text-center text-xs ${subtleText}`}>
            {pickedLabel ? `"${pickedLabel}"` : 'File'} ready
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
            Remove file
          </button>
        </div>
      ) : null}
    </div>
  )
}
