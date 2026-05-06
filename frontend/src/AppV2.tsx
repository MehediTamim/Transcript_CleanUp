import { useCallback, useState } from 'react'
import { postChunkedAudioStream } from './api'
import { AudioCapture } from './components/AudioCapture'
import { ErrorBanner } from './components/ErrorBanner'
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

type StepState = 'idle' | 'active' | 'done'

function StepRow({
  step,
  label,
  state,
}: {
  step: number
  label: string
  state: StepState
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={[
          'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors',
          state === 'done'
            ? 'bg-emerald-500/20 text-emerald-400'
            : state === 'active'
              ? 'bg-violet-500/20 text-violet-400'
              : 'bg-white/[0.04] text-zinc-600',
        ].join(' ')}
      >
        {state === 'done' ? '✓' : step}
      </span>
      <span
        className={[
          'flex-1 text-xs font-medium transition-colors',
          state === 'done'
            ? 'text-emerald-400'
            : state === 'active'
              ? 'text-violet-300'
              : 'text-zinc-600',
        ].join(' ')}
      >
        {label}
      </span>
      {state === 'active' ? <Spinner className="text-violet-400" /> : null}
    </div>
  )
}

export default function AppV2() {
  const [pipelineStage, setPipelineStage] = useState<string | null>(null)
  const [transcribeDone, setTranscribeDone] = useState(false)
  const [output, setOutput] = useState('')
  const [streamFinished, setStreamFinished] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [languageHint, setLanguageHint] = useState('')
  const [copied, setCopied] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [totalChunks, setTotalChunks] = useState<number | null>(null)
  const [doneChunks, setDoneChunks] = useState(0)

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
      setTranscribeDone(false)
      setTotalChunks(null)
      setDoneChunks(0)

      const fd = new FormData()
      fd.append('file', blob, filename)

      const lang = languageHint.trim() || null
      const err = await postChunkedAudioStream(
        fd,
        {
          onStage: (s) => {
            setPipelineStage(s)
            if (s === 'formatting') {
              setTranscribeDone(true)
              setOutput('')
            }
          },
          onTotalChunks: (n) => {
            setTotalChunks(n)
            setPipelineStage('transcribing')
          },
          onChunkDone: (_idx, _total, text) => {
            if (text) setOutput((prev) => prev ? prev + '\n\n' + text : text)
            setDoneChunks((n) => n + 1)
          },
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

  const onCopy = async () => {
    if (!output) return
    await navigator.clipboard.writeText(output)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const onDownload = () => {
    if (!output) return
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'court-transcript.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const status: WorkspaceStatus = error
    ? { kind: 'error' }
    : pipelineStage === 'splitting'
      ? { kind: 'streaming', label: 'Splitting' }
      : pipelineStage === 'transcribing'
        ? { kind: 'transcribing' }
        : pipelineStage === 'formatting'
          ? { kind: 'streaming', label: 'Formatting' }
          : busy
            ? { kind: 'streaming', label: 'Starting' }
            : streamFinished
              ? { kind: 'finalized' }
              : { kind: 'idle' }

  // Step states derived from pipeline progress
  const step1: StepState =
    pipelineStage === 'splitting' || pipelineStage === 'transcribing'
      ? 'active'
      : transcribeDone || streamFinished
        ? 'done'
        : 'idle'

  const step2: StepState =
    pipelineStage === 'formatting'
      ? 'active'
      : streamFinished
        ? 'done'
        : 'idle'

  const step1Label =
    pipelineStage === 'splitting'
      ? 'Splitting audio into chunks…'
      : totalChunks !== null
        ? `Transcribing — ${doneChunks} / ${totalChunks} chunks done`
        : 'Transcribing audio'

  const showSteps = busy || streamFinished

  return (
    <WorkspaceShell wide header={<TopBar status={status} />}>
      <section className="mb-5 shrink-0">
        <p className={`${eyebrow} mb-2`}>Hearing pipeline</p>
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Audio to court transcript
        </h1>
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-zinc-400">
          Upload or record on the left. The Veritext-formatted transcript streams on the right — scroll to read the full document.
        </p>
      </section>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-2 lg:gap-8">
        {/* Left: audio input */}
        <section className={`flex flex-col ${panelSurface} ${panelPad}`}>
          <h2 className={sectionTitle}>Audio</h2>
          <p className={sectionHelp}>
            Upload a file or use your microphone, then run the pipeline.
          </p>

          <div className="mt-4">
            <AudioCapture
              disabled={busy}
              primaryLabel="Transcribe & format"
              primaryBusyLabel="Running…"
              primaryBusy={busy}
              onPrimary={(blob, filename) => void runPipeline(blob, filename)}
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

          <div className="mt-6">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        </section>

        {/* Right: step tracker + streamed Veritext transcript */}
        <section className={`flex min-h-0 flex-col ${panelSurface} ${panelPad}`}>

          {/* Panel header */}
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <h2 className={sectionTitle}>Court transcript</h2>
              <p className={sectionHelp}>
                {streamFinished
                  ? 'Complete — scroll to read the full Veritext document.'
                  : 'Pipeline progress and formatted output appear here.'}
              </p>
            </div>
            {streamFinished && output.trim() ? (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  className="rounded-full border border-violet-500/30 bg-violet-950/40 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-900/50"
                >
                  View full transcript
                </button>
                <button
                  type="button"
                  onClick={() => void onCopy()}
                  className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08]"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={onDownload}
                  className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08]"
                >
                  Download
                </button>
              </div>
            ) : null}
          </div>

          {/* Step tracker — only shown once the pipeline has started */}
          {showSteps ? (
            <div className="mt-4 shrink-0 space-y-2.5 rounded-xl border border-white/[0.05] bg-black/20 px-4 py-3">
              <StepRow step={1} label={step1Label} state={step1} />
              <StepRow step={2} label="Formatting as Veritext court transcript" state={step2} />
            </div>
          ) : null}

          {/* Scrollable transcript box */}
          <div
            className={`mt-4 min-h-0 flex-1 overflow-y-auto ${innerSurface} p-4`}
            aria-live="polite"
          >
            {output ? (
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-200">
                {output}
              </pre>
            ) : !busy ? (
              <p className="flex h-full items-center justify-center text-sm text-zinc-600">
                Output will appear here after you run the pipeline.
              </p>
            ) : null}
          </div>

        </section>
      </div>

      {/* Full transcript modal */}
      {showModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-white/[0.08] bg-zinc-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-6 py-4">
              <h2 className="text-sm font-semibold text-white">Full court transcript</h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex size-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Modal body — full scrollable transcript */}
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-200">
                {output}
              </pre>
            </div>

            {/* Modal footer */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-3">
              <button
                type="button"
                onClick={() => void onCopy()}
                className="rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08]"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={onDownload}
                className="rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08]"
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-zinc-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </WorkspaceShell>
  )
}
