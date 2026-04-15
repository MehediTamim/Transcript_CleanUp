import { useCallback, useMemo, useRef, useState } from 'react'
import { apiFormJson, apiJson, postSessionChatStream } from './api'
import { MarkdownPreview } from './MarkdownPreview'
import type {
  ChatMessageItem,
  FinalizeResponse,
  RunCreateResponse,
  RunStateResponse,
  SessionCreateResponse,
  SessionDetailResponse,
  TranscribeResponse,
} from './types'

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
  if (m.includes('409') || m.includes('finalized'))
    return 'This conversation is already finished. Start a new one to keep going.'
  if (m.includes('network') || m.includes('failed to fetch'))
    return 'Check your connection and try again.'
  if (m.includes('413') || m.includes('too large'))
    return 'That file is a bit too large. Try a shorter clip.'
  if (m.includes('415') || m.includes('unsupported'))
    return 'That file type is not supported. Try MP3, WAV, M4A, or WebM.'
  return "Something didn't work. Please try again."
}

function lastAssistantDraft(
  messages: ChatMessageItem[],
  streaming: string,
): string | null {
  const s = streaming.trim()
  if (s) return streaming
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return messages[i].content
  }
  return null
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
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [command, setCommand] = useState('')
  const [streaming, setStreaming] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [pickedLabel, setPickedLabel] = useState<string | null>(null)
  const [finalContent, setFinalContent] = useState<string | null>(null)
  const [sessionFinalized, setSessionFinalized] = useState(false)
  const [copied, setCopied] = useState(false)
  const [preFinalizeView, setPreFinalizeView] = useState<'raw' | 'preview'>('preview')
  const [finalDocView, setFinalDocView] = useState<'raw' | 'preview'>('preview')
  const [showLegacy, setShowLegacy] = useState(false)
  const [legacyRun, setLegacyRun] = useState<RunStateResponse | null>(null)
  const [legacyThreadId, setLegacyThreadId] = useState<string | null>(null)
  const [legacyEdit, setLegacyEdit] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  const setFriendlyError = (e: unknown) => {
    const rawMsg = e instanceof Error ? e.message : String(e)
    setError(humanizeError(rawMsg))
  }

  const scrollChat = () => {
    queueMicrotask(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }))
  }

  const loadSession = useCallback(async (sid: string) => {
    const data = await apiJson<SessionDetailResponse>(`/api/sessions/${sid}`)
    setMessages(data.messages)
    setSessionFinalized(data.status === 'finalized')
    if (data.finalized_content) setFinalContent(data.finalized_content)
  }, [])

  const resetWorkspace = () => {
    setSessionId(null)
    setMessages([])
    setCommand('')
    setStreaming('')
    setFinalContent(null)
    setSessionFinalized(false)
    setError(null)
    setLegacyRun(null)
    setLegacyThreadId(null)
    setLegacyEdit('')
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

  const sendCommand = async () => {
    const text = command.trim()
    if (!text) return
    const base = raw.trim()
    if (!base) {
      setError('Add a transcript first (audio, mic, or paste).')
      return
    }
    setError(null)
    setBusy(true)
    setStreaming('')
    try {
      let sid = sessionId
      if (!sid) {
        const created = await apiJson<SessionCreateResponse>('/api/sessions', {
          method: 'POST',
          body: JSON.stringify({ initial_transcript: base }),
        })
        sid = created.session_id
        setSessionId(sid)
      }
      setCommand('')
      const userMsg: ChatMessageItem = {
        id: `local-${Date.now()}`,
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
      }
      setMessages((m) => [...m, userMsg])
      scrollChat()

      let acc = ''
      const err = await postSessionChatStream(sid, text, (d) => {
        acc += d
        setStreaming(acc)
        scrollChat()
      })
      setStreaming('')
      if (err.error) {
        setFriendlyError(new Error(err.error))
        setMessages((m) => m.filter((x) => x.id !== userMsg.id))
        return
      }
      await loadSession(sid)
    } catch (e) {
      setFriendlyError(e)
    } finally {
      setBusy(false)
    }
  }

  const onFinalize = async () => {
    if (!sessionId) return
    setError(null)
    setBusy(true)
    try {
      const res = await apiJson<FinalizeResponse>(
        `/api/sessions/${sessionId}/finalize`,
        { method: 'POST', body: JSON.stringify({}) },
      )
      setFinalContent(res.final_content)
      setSessionFinalized(true)
      await loadSession(sessionId)
    } catch (e) {
      setFriendlyError(e)
    } finally {
      setBusy(false)
    }
  }

  const copyFinal = async () => {
    if (!finalContent) return
    await navigator.clipboard.writeText(finalContent)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const downloadFinal = () => {
    if (!finalContent) return
    const blob = new Blob([finalContent], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'document.txt'
    a.click()
    URL.revokeObjectURL(url)
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

  const refreshLegacy = useCallback(async (tid: string) => {
    const s = await apiJson<RunStateResponse>(`/api/runs/${tid}`)
    setLegacyRun(s)
    if (s.interrupt?.research_enriched) setLegacyEdit(s.interrupt.research_enriched)
  }, [])

  const startLegacyRun = async () => {
    const t = raw.trim()
    if (!t) {
      setError('Add text above for a quick pass, or use the chat instead.')
      return
    }
    setError(null)
    setBusy(true)
    setLegacyRun(null)
    setLegacyThreadId(null)
    try {
      const created = await apiJson<RunCreateResponse>('/api/runs', {
        method: 'POST',
        body: JSON.stringify({ raw_transcript: t }),
      })
      setLegacyThreadId(created.thread_id)
      await refreshLegacy(created.thread_id)
    } catch (e) {
      setFriendlyError(e)
    } finally {
      setBusy(false)
    }
  }

  const resumeLegacy = async (editedText: string | null) => {
    if (!legacyThreadId) return
    setBusy(true)
    try {
      await apiJson<RunStateResponse>(`/api/runs/${legacyThreadId}/resume`, {
        method: 'POST',
        body: JSON.stringify({ edited_text: editedText }),
      })
      await refreshLegacy(legacyThreadId)
    } catch (e) {
      setFriendlyError(e)
    } finally {
      setBusy(false)
    }
  }

  const chatLocked = sessionFinalized || !!finalContent

  const draftFinal = useMemo(
    () => lastAssistantDraft(messages, streaming),
    [messages, streaming],
  )

  const canFinalize =
    !!sessionId && messages.length > 0 && !chatLocked && !streaming

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
        <header className="mb-10 text-center sm:mb-12">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Clarity
          </p>
          <h1 className="mx-auto max-w-lg text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl sm:leading-[1.15]">
            From recording to the document you want
          </h1>
          <p className="mx-auto mt-4 max-w-md text-pretty text-sm leading-relaxed text-zinc-400">
            Get a transcript, then describe how you want it changed — step by step. When
            you&apos;re happy, lock it in and copy or download.
          </p>
        </header>

        <main className="flex flex-1 flex-col gap-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={resetWorkspace}
              className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
            >
              New document
            </button>
          </div>

          {/* Audio */}
          <section className="rounded-[1.75rem] border border-white/[0.06] bg-zinc-900/35 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset] backdrop-blur-xl sm:p-8">
            <h2 className="text-sm font-semibold text-white">1 · Audio (optional)</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Turn a recording into text in the box below. Skip if you already have text.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/webm,.webm,.mp3,.wav,.m4a,.ogg"
              className="hidden"
              onChange={onPickFile}
            />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled={busy || recording}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] text-sm font-medium text-zinc-200 transition hover:border-white/[0.12] hover:bg-white/[0.07] disabled:opacity-40"
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
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] text-sm font-medium text-zinc-200 transition hover:bg-white/[0.07] disabled:opacity-40"
                >
                  <span className="flex size-2 rounded-full bg-emerald-400/90" aria-hidden />
                  Record with mic
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-500/90 text-sm font-semibold text-white shadow-lg"
                >
                  Stop recording
                </button>
              )}
            </div>
            {recording ? (
              <p className="mt-3 text-center text-sm text-zinc-400">We&apos;re listening…</p>
            ) : null}
            {recordedBlob && !recording ? (
              <div className="mt-4 rounded-2xl border border-white/[0.05] bg-black/20 p-4">
                <p className="text-center text-xs text-zinc-500">
                  {pickedLabel ? `“${pickedLabel}”` : 'Recording'} ready
                </p>
                {busy ? (
                  <p className="mt-3 flex justify-center gap-2 text-sm text-zinc-400">
                    <Spinner className="text-violet-400" /> Working…
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onTranscribeOnly(recordedBlob, audioFilename)}
                    className="mt-3 w-full rounded-xl bg-white py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100"
                  >
                    Add to transcript below
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRecordedBlob(null)
                    setPickedLabel(null)
                  }}
                  className="mt-2 w-full text-center text-xs text-zinc-600 hover:text-zinc-400"
                >
                  Remove audio
                </button>
              </div>
            ) : null}
          </section>

          {/* Transcript */}
          <section className="rounded-[1.75rem] border border-white/[0.06] bg-zinc-900/35 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset] backdrop-blur-xl sm:p-8">
            <h2 className="text-sm font-semibold text-white">2 · Your transcript</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {sessionId
                ? 'Locked while you chat — use “New document” to edit the source again.'
                : 'Paste or generate text. Fix any mistakes before you start chatting.'}
            </p>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              disabled={busy || !!sessionId}
              rows={8}
              placeholder="Your words appear here…"
              className="mt-3 w-full resize-y rounded-2xl border border-white/[0.06] bg-black/25 px-4 py-3.5 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-60"
            />
          </section>

          {/* Chat */}
          <section className="rounded-[1.75rem] border border-white/[0.06] bg-zinc-900/40 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset] backdrop-blur-xl sm:p-8">
            <h2 className="text-sm font-semibold text-white">3 · Tell the assistant what to do</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Examples: “Turn this into a formal legal memo,” “Short bullet summary,” “Fix
              speaker labels only.”
            </p>
            <div className="mt-4 max-h-[min(50vh,420px)] space-y-3 overflow-y-auto rounded-2xl border border-white/[0.05] bg-black/25 p-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === 'user'
                      ? 'ml-6 rounded-2xl border border-violet-500/20 bg-violet-950/30 px-4 py-3 text-sm text-zinc-100'
                      : 'mr-6 rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-sm text-zinc-200'
                  }
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    {m.role === 'user' ? 'You' : 'Assistant'}
                  </p>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {m.content}
                  </pre>
                </div>
              ))}
              {streaming ? (
                <div className="mr-6 rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase text-zinc-500">
                    Assistant
                  </p>
                  <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-200">
                    {streaming}
                  </pre>
                </div>
              ) : null}
              <div ref={chatEndRef} />
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (!busy && !chatLocked) void sendCommand()
                  }
                }}
                disabled={busy || chatLocked}
                placeholder={
                  chatLocked
                    ? 'Conversation finished'
                    : 'What should change? Press Enter to send'
                }
                className="h-12 flex-1 rounded-2xl border border-white/[0.08] bg-black/30 px-4 text-sm text-zinc-100 outline-none focus:border-violet-500/40 disabled:opacity-50"
              />
              <button
                type="button"
                disabled={busy || chatLocked || !command.trim()}
                onClick={() => void sendCommand()}
                className="h-12 rounded-2xl bg-white px-6 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-40"
              >
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="text-zinc-700" /> Sending
                  </span>
                ) : (
                  'Send'
                )}
              </button>
            </div>
            {draftFinal && !chatLocked ? (
              <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                <p className="text-center text-xs font-medium text-zinc-500">
                  Before you finalize — this is what will be saved (markdown)
                </p>
                <div
                  className="mt-3 flex justify-center gap-1 rounded-full border border-white/[0.06] bg-black/30 p-1"
                  role="tablist"
                  aria-label="Draft view"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={preFinalizeView === 'raw'}
                    onClick={() => setPreFinalizeView('raw')}
                    className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                      preFinalizeView === 'raw'
                        ? 'bg-white/[0.12] text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    Raw
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={preFinalizeView === 'preview'}
                    onClick={() => setPreFinalizeView('preview')}
                    className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                      preFinalizeView === 'preview'
                        ? 'bg-white/[0.12] text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    Preview
                  </button>
                </div>
                <div className="mt-3 max-h-[min(40vh,320px)] overflow-auto rounded-xl border border-white/[0.05] bg-black/30 p-4">
                  {preFinalizeView === 'raw' ? (
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">
                      {draftFinal}
                    </pre>
                  ) : (
                    <MarkdownPreview source={draftFinal} />
                  )}
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                disabled={busy || !canFinalize}
                onClick={() => void onFinalize()}
                className="rounded-full border border-emerald-500/30 bg-emerald-950/40 px-5 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-900/50 disabled:opacity-40"
              >
                I&apos;m done — finalize
              </button>
            </div>
          </section>

          {finalContent ? (
            <section className="rounded-[1.75rem] border border-emerald-500/20 bg-emerald-950/20 p-6 sm:p-8">
              <h2 className="text-center text-sm font-semibold text-emerald-100">
                Your final document
              </h2>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyFinal()}
                  className="rounded-full border border-white/10 bg-white/[0.08] px-5 py-2 text-sm font-medium text-white"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={downloadFinal}
                  className="rounded-full border border-white/10 bg-white/[0.08] px-5 py-2 text-sm font-medium text-white"
                >
                  Download .txt
                </button>
              </div>
              <div
                className="mx-auto mt-3 flex max-w-xs justify-center gap-1 rounded-full border border-white/[0.08] bg-black/25 p-1"
                role="tablist"
                aria-label="Final document view"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={finalDocView === 'raw'}
                  onClick={() => setFinalDocView('raw')}
                  className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                    finalDocView === 'raw'
                      ? 'bg-white/[0.12] text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Raw
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={finalDocView === 'preview'}
                  onClick={() => setFinalDocView('preview')}
                  className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                    finalDocView === 'preview'
                      ? 'bg-white/[0.12] text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Preview
                </button>
              </div>
              <div className="mt-3 max-h-[min(50vh,400px)] overflow-auto rounded-2xl border border-white/[0.06] bg-black/40 p-4">
                {finalDocView === 'raw' ? (
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200">
                    {finalContent}
                  </pre>
                ) : (
                  <MarkdownPreview source={finalContent} />
                )}
              </div>
            </section>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-2xl border border-rose-500/20 bg-rose-950/30 px-4 py-3 text-center text-sm text-rose-100/90"
            >
              {error}
            </div>
          ) : null}

          {/* Legacy quick pass */}
          <details
            className="rounded-2xl border border-white/[0.04] bg-black/20 p-4"
            open={showLegacy}
            onToggle={(e) => setShowLegacy((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer text-xs font-medium text-zinc-500">
              Quick pass (legacy automatic cleanup)
            </summary>
            <p className="mt-2 text-xs text-zinc-600">
              One-shot pipeline without chat. Uses the older two-step cleaner on the transcript
              above.
            </p>
            <button
              type="button"
              disabled={busy || !raw.trim()}
              onClick={() => void startLegacyRun()}
              className="mt-3 rounded-xl border border-white/10 px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.05] disabled:opacity-40"
            >
              Run quick pass
            </button>
            {legacyRun?.status === 'awaiting_human' ? (
              <div className="mt-4 space-y-2">
                <textarea
                  value={legacyEdit}
                  onChange={(e) => setLegacyEdit(e.target.value)}
                  rows={6}
                  className="w-full rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-zinc-200"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void resumeLegacy(legacyEdit)}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-zinc-900"
                  >
                    Continue with edits
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void resumeLegacy(null)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300"
                  >
                    As suggested
                  </button>
                </div>
              </div>
            ) : null}
            {legacyRun?.status === 'completed' &&
            typeof legacyRun.values.final_clean === 'string' ? (
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-zinc-300">
                {legacyRun.values.final_clean}
              </pre>
            ) : null}
            {legacyRun?.status === 'running' ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                <Spinner className="size-3" /> Running…
              </p>
            ) : null}
          </details>
        </main>

        <footer className="mt-auto pt-12 text-center text-[11px] text-zinc-600">
          Private to your browser session. Nothing here is legal advice.
        </footer>
      </div>
    </div>
  )
}
