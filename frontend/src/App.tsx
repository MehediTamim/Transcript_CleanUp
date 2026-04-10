import { useCallback, useRef, useState } from 'react'
import { apiFormJson, apiJson } from './api'
import type { RunCreateResponse, RunStateResponse, TranscribeResponse } from './types'

function humanizeError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('503') || m.includes('unavailable'))
    return "We're having trouble right now. Please try again in a moment."
  if (m.includes('microphone') || m.includes('denied') || m.includes('notallowed'))
    return 'Your browser blocked the microphone. Allow access in settings, then try again.'
  if (m.includes('empty') && m.includes('speech'))
    return "We didn't catch any words. Try speaking a little longer or closer to the mic."
  if (m.includes('at least 1 character') || m.includes('string_too_short'))
    return 'Please add some text or a recording with speech before continuing.'
  if (m.includes('network') || m.includes('failed to fetch'))
    return 'Check your connection and try again.'
  if (m.includes('413') || m.includes('too large'))
    return 'That file is a bit too large. Try a shorter clip.'
  if (m.includes('415') || m.includes('unsupported'))
    return 'That file type is not supported. Try MP3, WAV, M4A, or WebM.'
  return "Something didn't work. Please try again."
}

function Spinner({ className = '' }: { className?: string }) {
  return (
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
  )
}

export default function App() {
  const [raw, setRaw] = useState('')
  const [threadId, setThreadId] = useState<string | null>(null)
  const [run, setRun] = useState<RunStateResponse | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [pickedLabel, setPickedLabel] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const setFriendlyError = (e: unknown) => {
    const rawMsg = e instanceof Error ? e.message : String(e)
    setError(humanizeError(rawMsg))
  }

  const refresh = useCallback(async (tid: string) => {
    const s = await apiJson<RunStateResponse>(`/api/runs/${tid}`)
    setRun(s)
    if (s.interrupt?.research_enriched) {
      setEditDraft(s.interrupt.research_enriched)
    }
  }, [])

  const startRunFromText = useCallback(
    async (text: string) => {
      setError(null)
      setBusy(true)
      setRun(null)
      setThreadId(null)
      try {
        const created = await apiJson<RunCreateResponse>('/api/runs', {
          method: 'POST',
          body: JSON.stringify({ raw_transcript: text }),
        })
        setThreadId(created.thread_id)
        await refresh(created.thread_id)
      } catch (e) {
        setFriendlyError(e)
      } finally {
        setBusy(false)
      }
    },
    [refresh],
  )

  const startRun = () => {
    const text = raw.trim()
    if (!text) {
      setError('Add a message or recording first, then tap Clean it up.')
      return
    }
    void startRunFromText(text)
  }

  const transcribeBlob = async (
    blob: Blob,
    filename: string,
  ): Promise<TranscribeResponse> => {
    const fd = new FormData()
    fd.append('file', blob, filename)
    return apiFormJson<TranscribeResponse>('/api/transcribe/', fd)
  }

  const transcriptFromResponse = (data: TranscribeResponse): string => {
    const direct = (data.transcript ?? '').trim()
    if (direct) return direct
    return (data.segments ?? [])
      .map((s) => s.text.trim())
      .filter(Boolean)
      .join(' ')
      .trim()
  }

  const onTranscribeOnly = async (blob: Blob, filename: string) => {
    setError(null)
    setBusy(true)
    try {
      const data = await transcribeBlob(blob, filename)
      const text = transcriptFromResponse(data)
      if (!text) {
        setError(humanizeError('empty speech'))
        return
      }
      setRaw(text)
    } catch (e) {
      setFriendlyError(e)
    } finally {
      setBusy(false)
    }
  }

  const onTranscribeAndClean = async (blob: Blob, filename: string) => {
    setError(null)
    setBusy(true)
    setRun(null)
    setThreadId(null)
    try {
      const data = await transcribeBlob(blob, filename)
      const text = transcriptFromResponse(data)
      if (!text) {
        setError(humanizeError('empty speech'))
        return
      }
      setRaw(text)
      const created = await apiJson<RunCreateResponse>('/api/runs', {
        method: 'POST',
        body: JSON.stringify({ raw_transcript: text }),
      })
      setThreadId(created.thread_id)
      await refresh(created.thread_id)
    } catch (e) {
      setFriendlyError(e)
    } finally {
      setBusy(false)
    }
  }

  const resume = async (editedText: string | null) => {
    if (!threadId) return
    setError(null)
    setBusy(true)
    try {
      await apiJson<RunStateResponse>(`/api/runs/${threadId}/resume`, {
        method: 'POST',
        body: JSON.stringify({ edited_text: editedText }),
      })
      await refresh(threadId)
    } catch (e) {
      setFriendlyError(e)
    } finally {
      setBusy(false)
    }
  }

  const copyFinal = async () => {
    const text = (run?.values.final_clean as string) || ''
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const startRecording = async () => {
    setError(null)
    setRecordedBlob(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''
      const mr = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, {
          type: mr.mimeType || 'audio/webm',
        })
        setRecordedBlob(blob)
        recorderRef.current = null
      }
      mr.start(250)
      recorderRef.current = mr
      setRecording(true)
    } catch (e) {
      setFriendlyError(e)
    }
  }

  const stopRecording = () => {
    const mr = recorderRef.current
    if (mr && mr.state !== 'inactive') mr.stop()
    setRecording(false)
  }

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setRecordedBlob(null)
    setPickedLabel(f.name)
    setError(null)
    void (async () => {
      setBusy(true)
      try {
        const buf = await f.arrayBuffer()
        const blob = new Blob([buf], { type: f.type || 'audio/webm' })
        setRecordedBlob(blob)
      } catch (err) {
        setFriendlyError(err)
      } finally {
        setBusy(false)
      }
    })()
  }

  const audioFilename = pickedLabel ?? 'recording.webm'

  const statusHeadline = () => {
    if (!run) return null
    if (run.status === 'awaiting_human')
      return 'Almost there — take a quick look'
    if (run.status === 'completed') return 'Your conversation is ready'
    if (run.status === 'running') return 'Refining your words…'
    return null
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070708] text-zinc-100">
      <div
        className="pointer-events-none absolute -left-32 top-0 h-[520px] w-[520px] rounded-full bg-violet-600/[0.12] blur-[100px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 bottom-0 h-[420px] w-[420px] rounded-full bg-fuchsia-600/[0.08] blur-[90px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-px w-[min(80%,720px)] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <header className="mb-12 text-center sm:mb-16">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Clarity
          </p>
          <h1 className="mx-auto max-w-lg text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl sm:leading-[1.15]">
            Turn messy audio or notes into a clean conversation
          </h1>
          <p className="mx-auto mt-4 max-w-md text-pretty text-sm leading-relaxed text-zinc-400">
            Upload a recording, use your mic, or paste text. We&apos;ll tidy it up
            so you can copy a polished dialogue.
          </p>
        </header>

        <main className="flex flex-1 flex-col gap-6">
          {/* Audio */}
          <section className="rounded-[1.75rem] border border-white/[0.06] bg-zinc-900/35 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset] backdrop-blur-xl sm:p-8">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Start with audio</h2>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  Optional — skip this if you already have text below.
                </p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/webm,.webm,.mp3,.wav,.m4a,.ogg"
              className="hidden"
              onChange={onPickFile}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                disabled={busy || recording}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] text-sm font-medium text-zinc-200 transition hover:border-white/[0.12] hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
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
              {!recording ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startRecording()}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] text-sm font-medium text-zinc-200 transition hover:border-white/[0.12] hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span
                    className="flex size-2 rounded-full bg-emerald-400/90 shadow-[0_0_12px_rgba(52,211,153,0.5)]"
                    aria-hidden
                  />
                  Record with mic
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-500/90 text-sm font-semibold text-white shadow-lg shadow-rose-900/30 transition hover:bg-rose-400"
                >
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/50 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-white" />
                  </span>
                  Stop recording
                </button>
              )}
            </div>

            {recording ? (
              <p className="mt-4 text-center text-sm text-zinc-400">
                Speak naturally — we&apos;re capturing your voice.
              </p>
            ) : null}

            {recordedBlob && !recording ? (
              <div className="mt-6 rounded-2xl border border-white/[0.05] bg-black/20 p-4">
                <p className="text-center text-xs text-zinc-500">
                  {pickedLabel ? `“${pickedLabel}” is ready` : 'Your recording is ready'}
                </p>
                {busy ? (
                  <p className="mt-4 flex items-center justify-center gap-2 text-sm text-zinc-400">
                    <Spinner className="text-violet-400" />
                    Hang tight…
                  </p>
                ) : null}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onTranscribeOnly(recordedBlob, audioFilename)}
                    className="h-11 rounded-xl border border-white/10 bg-transparent px-5 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.05] disabled:opacity-40"
                  >
                    Add words to the box below
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void onTranscribeAndClean(recordedBlob, audioFilename)
                    }
                    className="h-11 rounded-xl bg-white px-5 text-sm font-semibold text-zinc-950 shadow-lg shadow-black/20 transition hover:bg-zinc-100 disabled:opacity-40"
                  >
                    Clean it all up for me
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRecordedBlob(null)
                    setPickedLabel(null)
                  }}
                  className="mt-3 w-full text-center text-xs text-zinc-600 underline-offset-2 hover:text-zinc-400 hover:underline"
                >
                  Remove this audio
                </button>
              </div>
            ) : null}
          </section>

          {/* Text */}
          <section className="rounded-[1.75rem] border border-white/[0.06] bg-zinc-900/35 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset] backdrop-blur-xl sm:p-8">
            <label className="mb-3 block text-sm font-semibold text-white">
              Your notes or transcript
            </label>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              disabled={busy}
              placeholder="Paste what you have — rough notes, auto-captions, or anything wordy…"
              rows={8}
              className="w-full resize-y rounded-2xl border border-white/[0.06] bg-black/25 px-4 py-3.5 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 outline-none ring-0 transition focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
            />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                disabled={busy || !raw.trim()}
                onClick={() => void startRun()}
                className="inline-flex h-12 min-w-[200px] items-center justify-center gap-2 rounded-2xl bg-white px-6 text-sm font-semibold text-zinc-950 shadow-lg shadow-black/25 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {busy ? (
                  <>
                    <Spinner className="text-zinc-700" /> One moment…
                  </>
                ) : (
                  'Clean it up'
                )}
              </button>
              {threadId && run?.status === 'running' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void refresh(threadId)}
                  className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
                >
                  Nothing changed? Tap to refresh
                </button>
              ) : null}
            </div>
          </section>

          {error ? (
            <div
              role="alert"
              className="rounded-2xl border border-rose-500/20 bg-rose-950/30 px-4 py-3 text-center text-sm text-rose-100/90"
            >
              {error}
            </div>
          ) : null}

          {run ? (
            <section className="rounded-[1.75rem] border border-white/[0.06] bg-zinc-900/40 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset] backdrop-blur-xl sm:p-8">
              {statusHeadline() ? (
                <h2 className="mb-1 text-center text-lg font-semibold text-white">
                  {statusHeadline()}
                </h2>
              ) : null}

              {run.status === 'awaiting_human' ? (
                <div className="mt-4 space-y-4">
                  <p className="text-center text-sm leading-relaxed text-zinc-400">
                    Here&apos;s a tidier version. Tweak anything you like, then
                    continue.
                  </p>
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    disabled={busy}
                    rows={10}
                    className="w-full resize-y rounded-2xl border border-white/[0.06] bg-black/30 px-4 py-3.5 text-sm leading-relaxed text-zinc-100 outline-none focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void resume(editDraft)}
                      className="h-12 rounded-2xl bg-white px-6 text-sm font-semibold text-zinc-950 shadow-lg hover:bg-zinc-100 disabled:opacity-40"
                    >
                      {busy ? (
                        <span className="inline-flex items-center justify-center gap-2">
                          <Spinner className="text-zinc-700" /> Finishing…
                        </span>
                      ) : (
                        'Looks good — finish up'
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void resume(null)}
                      className="h-12 rounded-2xl border border-white/10 px-6 text-sm font-medium text-zinc-300 hover:bg-white/[0.05] disabled:opacity-40"
                    >
                      Use this version as-is
                    </button>
                  </div>
                </div>
              ) : null}

              {run.status === 'completed' &&
              typeof run.values.final_clean === 'string' ? (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => void copyFinal()}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-5 text-sm font-medium text-white transition hover:bg-white/[0.1]"
                    >
                      {copied ? 'Copied!' : 'Copy to clipboard'}
                    </button>
                  </div>
                  <div className="max-h-[min(60vh,480px)] overflow-auto rounded-2xl border border-white/[0.05] bg-black/30 p-5">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200">
                      {run.values.final_clean}
                    </pre>
                  </div>
                </div>
              ) : null}

              {run.status === 'running' ? (
                <div className="mt-6 flex flex-col items-center gap-3 py-4">
                  <Spinner className="size-6 text-violet-400" />
                  <p className="text-sm text-zinc-500">This usually takes a little bit.</p>
                </div>
              ) : null}
            </section>
          ) : null}
        </main>

        <footer className="mt-auto pt-16 text-center text-[11px] text-zinc-600">
          Made for clear, professional conversations — private to your session.
        </footer>
      </div>
    </div>
  )
}
