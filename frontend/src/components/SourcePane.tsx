// 2026-05-01 — State-aware left pane of the editor workspace. Renders ONE of:
//   1. Empty intake: AudioCapture + paste textarea (no transcript yet)
//   2. Draft transcript: editable textarea (transcript present, no session)
//   3. Locked transcript: read-only view (session active — chat in progress)
//   4. Final document: post-finalize view with Copy / Download
// Keeping every state in one component prevents the layout shift the old
// design suffered (sections appearing and disappearing). Only the inner panel
// content swaps; the panel chrome stays still.

import { useState } from 'react'
import { AudioCapture } from './AudioCapture'
import { MarkdownDocCard } from './MarkdownDocCard'
import { SegmentedTabs } from './SegmentedTabs'
import {
  eyebrow,
  panelPad,
  panelSurface,
  sectionHelp,
  sectionTitle,
  textareaBase,
} from '../lib/tokens'

export type SourcePaneStage =
  | 'empty'
  | 'transcript-draft'
  | 'transcript-locked'
  | 'finalized'

const finalViewOptions = [
  { id: 'final' as const, label: 'Final document' },
  { id: 'source' as const, label: 'Original transcript' },
] as const

type FinalView = (typeof finalViewOptions)[number]['id']

type Props = {
  stage: SourcePaneStage
  rawTranscript: string
  onChangeTranscript: (next: string) => void
  // True while transcribing audio or when an upstream action is busy.
  busy?: boolean
  // Audio capture wiring (only used in 'empty' stage).
  audioBusy?: boolean
  onTranscribeAudio: (blob: Blob, filename: string) => void
  // Final document content; only used in 'finalized' stage.
  finalContent?: string | null
  onNewDocument: () => void
}

export function SourcePane({
  stage,
  rawTranscript,
  onChangeTranscript,
  busy = false,
  audioBusy = false,
  onTranscribeAudio,
  finalContent,
  onNewDocument,
}: Props) {
  // Toggle between Final and the original Source transcript once finalized so
  // users can compare the assistant's output against what they started with.
  const [activeFinalView, setActiveFinalView] = useState<FinalView>('final')

  let title = 'Source'
  let help = 'Add a recording or paste text to begin.'
  if (stage === 'transcript-draft') {
    title = 'Transcript'
    help = 'Fix any mistakes here, then start chatting on the right.'
  } else if (stage === 'transcript-locked') {
    title = 'Transcript'
    help = 'Locked while you chat. Click "New document" to edit the source.'
  } else if (stage === 'finalized') {
    title = 'Document'
    help = 'Your finalised document. Copy, download, or start a new one.'
  }

  return (
    <section className={`flex h-full min-h-0 flex-col ${panelSurface} ${panelPad}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`${eyebrow} mb-1`}>Left side</p>
          <h2 className={sectionTitle}>{title}</h2>
          <p className={sectionHelp}>{help}</p>
        </div>
        {stage === 'finalized' ? (
          <button
            type="button"
            onClick={onNewDocument}
            className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08]"
          >
            New document
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        {stage === 'empty' ? (
          <div className="flex flex-1 flex-col gap-5">
            <div>
              <p className={`${eyebrow} mb-2`}>Step 1 · Audio (optional)</p>
              <AudioCapture
                disabled={busy}
                primaryLabel="Add to transcript"
                primaryBusyLabel="Transcribing…"
                primaryBusy={audioBusy}
                onPrimary={onTranscribeAudio}
              />
            </div>
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-zinc-600">
              <span className="h-px flex-1 bg-white/[0.06]" />
              or paste text
              <span className="h-px flex-1 bg-white/[0.06]" />
            </div>
            <div>
              <p className={`${eyebrow} mb-2`}>Step 2 · Transcript</p>
              <textarea
                value={rawTranscript}
                onChange={(e) => onChangeTranscript(e.target.value)}
                disabled={busy}
                rows={10}
                placeholder="Paste your text here, or transcribe audio above…"
                className={`${textareaBase} min-h-[220px]`}
              />
            </div>
          </div>
        ) : null}

        {stage === 'transcript-draft' ? (
          <textarea
            value={rawTranscript}
            onChange={(e) => onChangeTranscript(e.target.value)}
            disabled={busy}
            placeholder="Your words appear here…"
            className={`${textareaBase} flex-1 min-h-[280px]`}
          />
        ) : null}

        {stage === 'transcript-locked' ? (
          <div className="flex-1 overflow-auto rounded-xl border border-white/[0.05] bg-black/25 p-4">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200">
              {rawTranscript}
            </pre>
          </div>
        ) : null}

        {stage === 'finalized' && finalContent ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <SegmentedTabs
              options={finalViewOptions}
              value={activeFinalView}
              onChange={setActiveFinalView}
              ariaLabel="Final document or original source"
            />
            {activeFinalView === 'final' ? (
              <MarkdownDocCard
                source={finalContent}
                downloadFilename="document.txt"
                showActions
                tone="primary"
                maxHeightClass="flex-1 max-h-none"
              />
            ) : (
              <div className="flex-1 overflow-auto rounded-xl border border-white/[0.05] bg-black/25 p-4">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">
                  {rawTranscript || '(empty)'}
                </pre>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
