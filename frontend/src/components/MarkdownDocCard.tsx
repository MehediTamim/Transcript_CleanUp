// 2026-05-01 — Canonical Markdown viewer used everywhere a finished or in-flight
// assistant document is shown. Holds Raw / Preview tabs, optional Copy +
// Download actions, and a configurable max-height scroll region. Replaces the
// duplicated preview blocks the old App.tsx had under the chat AND under the
// final document section.

import { useState } from 'react'
import { MarkdownPreview } from '../MarkdownPreview'
import { SegmentedTabs } from './SegmentedTabs'

export type MarkdownDocCardProps = {
  source: string
  // Filename used when the user clicks Download.
  downloadFilename?: string
  // Show Copy + Download buttons. Defaults to false (preview-only inline use).
  showActions?: boolean
  // Visual emphasis: "muted" (live draft inside chat) vs "primary" (final doc).
  tone?: 'muted' | 'primary'
  // Max scroll height for the body.
  maxHeightClass?: string
  // Optional small label rendered above the tabs.
  caption?: string
  // Optional default view (preview by default).
  defaultView?: 'raw' | 'preview'
}

export function MarkdownDocCard({
  source,
  downloadFilename = 'document.txt',
  showActions = false,
  tone = 'muted',
  maxHeightClass = 'max-h-[min(40vh,360px)]',
  caption,
  defaultView = 'preview',
}: MarkdownDocCardProps) {
  const [view, setView] = useState<'raw' | 'preview'>(defaultView)
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    if (!source) return
    await navigator.clipboard.writeText(source)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const onDownload = () => {
    if (!source) return
    const blob = new Blob([source], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = downloadFilename
    a.click()
    URL.revokeObjectURL(url)
  }

  const containerClass =
    tone === 'primary'
      ? 'rounded-2xl border border-emerald-500/20 bg-emerald-950/15 p-4'
      : 'rounded-2xl border border-white/[0.05] bg-black/20 p-3.5'

  return (
    <div className={containerClass}>
      {caption ? (
        <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {caption}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedTabs
          options={[
            { id: 'preview', label: 'Preview' },
            { id: 'raw', label: 'Raw' },
          ]}
          value={view}
          onChange={setView}
          ariaLabel="Document view"
        />
        {showActions ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void onCopy()}
              className="rounded-full border border-white/[0.08] bg-white/[0.05] px-4 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/[0.1]"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={onDownload}
              className="rounded-full border border-white/[0.08] bg-white/[0.05] px-4 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/[0.1]"
            >
              Download
            </button>
          </div>
        ) : null}
      </div>

      <div
        className={`mt-3 ${maxHeightClass} overflow-auto rounded-xl border border-white/[0.05] bg-black/30 p-4`}
      >
        {view === 'raw' ? (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">
            {source}
          </pre>
        ) : (
          <MarkdownPreview source={source} />
        )}
      </div>
    </div>
  )
}
