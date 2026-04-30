// 2026-05-01 — Hearing pipeline page (`/v2`). Rewritten to use the shared
// WorkspaceShell + TopBar + AudioCapture + MarkdownDocCard so it visually
// matches the redesigned EditorPage. The pipeline itself is unchanged: upload
// or record audio on the left, watch the formatted court transcript stream on
// the right, then preview / copy / download.

import { useCallback, useState } from 'react'
import { postV2AudioToCourtStream } from './api'
import { AudioCapture } from './components/AudioCapture'
import { ErrorBanner } from './components/ErrorBanner'
import { MarkdownDocCard } from './components/MarkdownDocCard'
import { Spinner } from './components/Spinner'
import { TopBar, type WorkspaceStatus } from './components/TopBar'
import { WorkspaceShell } from './components/WorkspaceShell'
import { friendlyMessage } from './lib/errors'
import {
  eyebrow,
  inputBase,
  innerSurface,
  panelPad,
  panelSurface,
  sectionHelp,
  sectionTitle,
} from './lib/tokens'

export default function AppV2() {
  const [pipelineStage, setPipelineStage] = useState<string | null>(null)
  const [output, setOutput] = useState('')
  const [streamFinished, setStreamFinished] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [languageHint, setLanguageHint] = useState('')

  const setFriendlyError = useCallback((e: unknown) => {
    setError(friendlyMessage(e))
  }, [])

  const runPipeline = useCallback(
    async (blob: Blob, filename: string) => {
      setError(null)
      setBusy(true)
      setOutput('')
      setStreamFinished(false)
      setPipelineStage(null)

      const fd = new FormData()
      fd.append('file', blob, filename)

      const lang = languageHint.trim() || null
      const err = await postV2AudioToCourtStream(
        fd,
        {
          onStage: (s) => setPipelineStage(s),
          onDelta: (d) => setOutput((prev) => prev + d),
        },
        lang,
      )
      setBusy(false)
      setPipelineStage(null)
      if (err.error) {
        setFriendlyError(new Error(err.error))
        return
      }
      setStreamFinished(true)
    },
    [languageHint, setFriendlyError],
  )

  const status: WorkspaceStatus = error
    ? { kind: 'error' }
    : pipelineStage === 'transcribing'
      ? { kind: 'transcribing' }
      : pipelineStage === 'formatting'
        ? { kind: 'streaming', label: 'Formatting' }
        : busy
          ? { kind: 'streaming', label: 'Starting' }
          : streamFinished
            ? { kind: 'finalized' }
            : { kind: 'idle' }

  const statusLabel =
    pipelineStage === 'transcribing'
      ? 'Transcribing audio…'
      : pipelineStage === 'formatting'
        ? 'Formatting as court transcript…'
        : busy
          ? 'Starting…'
          : null

  return (
    <WorkspaceShell header={<TopBar status={status} />}>
      <section className="mb-6 sm:mb-8">
        <p className={`${eyebrow} mb-2`}>Hearing mode · v2</p>
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Audio to court transcript
        </h1>
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-zinc-400">
          Upload or record on the left. The formatted hearing-style transcript streams on the
          right — then preview or download. One-shot pipeline, no chat.
        </p>
      </section>

      <div className="grid flex-1 gap-6 lg:grid-cols-2 lg:gap-8">
        {/* Left: audio input */}
        <section className={`flex flex-col ${panelSurface} ${panelPad}`}>
          <h2 className={sectionTitle}>Audio</h2>
          <p className={sectionHelp}>
            Upload a file or use your microphone, then start the pipeline.
          </p>

          <div className="mt-4">
            <AudioCapture
              disabled={busy}
              primaryLabel="Run — transcribe & format"
              primaryBusyLabel="Running…"
              primaryBusy={busy}
              onPrimary={(blob, filename) => void runPipeline(blob, filename)}
              onError={(m) => setError(m)}
            />
          </div>

          <label className="mt-5 block">
            <span className="text-xs font-medium text-zinc-500">
              Optional language hint (ISO-639-1, e.g. en)
            </span>
            <input
              type="text"
              value={languageHint}
              onChange={(e) => setLanguageHint(e.target.value)}
              disabled={busy}
              placeholder="en"
              className={`${inputBase} mt-1.5 h-10 py-2`}
            />
          </label>
        </section>

        {/* Right: streamed output */}
        <section className={`flex flex-col ${panelSurface} ${panelPad}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className={sectionTitle}>Court transcript</h2>
              <p className={sectionHelp}>
                Live stream while formatting; then preview or download.
              </p>
            </div>
            {statusLabel ? (
              <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
                <Spinner className="text-violet-400" />
                {statusLabel}
              </span>
            ) : null}
          </div>

          <div
            className={`mt-4 min-h-[220px] flex-1 overflow-auto ${innerSurface} p-4`}
            aria-live="polite"
          >
            {output ? (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200">
                {output}
              </pre>
            ) : !busy && !statusLabel ? (
              <p className="text-center text-sm text-zinc-600">
                Output will appear here after you run the pipeline.
              </p>
            ) : null}
          </div>

          {streamFinished && output.trim() ? (
            <div className="mt-4">
              <MarkdownDocCard
                source={output}
                downloadFilename="court-transcript.txt"
                showActions
                tone="primary"
                maxHeightClass="max-h-[min(45vh,420px)]"
              />
            </div>
          ) : null}
        </section>
      </div>

      <div className="mt-6">
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      </div>
    </WorkspaceShell>
  )
}
