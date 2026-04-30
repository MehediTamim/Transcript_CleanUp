// 2026-05-01 — Right-rail assistant for the editor workspace.
//
// 2026-05-01 — UX fixes after review:
//   * Assistant bubble now renders Markdown directly via MarkdownPreview
//     (was: raw <pre> text). Long structured replies (memos, bullet lists,
//     tables) look like proper documents inside the chat itself.
//   * Removed the redundant "Latest draft preview" section that duplicated
//     the same content under the chat. The bubble IS the preview.
//   * The messages scroller is the only flex-1 region in the rail, so the
//     pane never grows — it scrolls internally regardless of reply length.
//
// Layout (top to bottom):
//   - small header (title + helper text) — fixed height
//   - examples panel (only when there are no messages — coaches the user)
//   - scrollable messages list (flex-1, the only growth region)
//   - sticky composer (textarea, Enter-to-send, Shift+Enter newline)
//   - finalize CTA
//   - error banner

import { useEffect, useRef, useState } from 'react'
import { MarkdownPreview } from '../MarkdownPreview'
import { ErrorBanner } from './ErrorBanner'
import { Spinner } from './Spinner'
import {
  btnPrimary,
  btnSuccess,
  eyebrow,
  panelPad,
  panelSurface,
  sectionHelp,
  sectionTitle,
} from '../lib/tokens'
import type { ChatMessageItem } from '../types'

const PROMPT_EXAMPLES: ReadonlyArray<string> = [
  'Turn this into a formal legal memo.',
  'Give me a short bullet summary.',
  'Fix the speaker labels only — keep wording verbatim.',
  'Make it sound more professional and remove filler words.',
]

type Props = {
  messages: ChatMessageItem[]
  streaming: string
  // Disable composer + finalize (e.g. before transcript exists).
  inputDisabled?: boolean
  // True after finalize — composer + finalize button locked.
  locked?: boolean
  busy?: boolean
  canFinalize?: boolean
  hasTranscript?: boolean
  // Send a chat command. ChatRail owns the textarea so the parent only handles
  // the network call. The textarea is cleared synchronously before the call.
  onSend: (text: string) => Promise<void> | void
  onFinalize: () => void
  // Optional secondary action shown in the empty state (e.g. quick-pass).
  secondaryAction?: {
    label: string
    onClick: () => void
    helpText?: string
  }
  error?: string | null
  onDismissError?: () => void
}

export function ChatRail({
  messages,
  streaming,
  inputDisabled = false,
  locked = false,
  busy = false,
  canFinalize = false,
  hasTranscript = false,
  onSend,
  onFinalize,
  secondaryAction,
  error,
  onDismissError,
}: Props) {
  const [draft, setDraft] = useState('')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  // Keep the chat scrolled to the bottom on new messages / streaming chunks.
  // Stick-to-bottom only when the user is already near the bottom — this
  // prevents the scroller hijacking the user's read position when they've
  // intentionally scrolled up to inspect an earlier reply.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 160) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, streaming])

  // Cmd/Ctrl+K focuses the composer from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        composerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const send = async () => {
    const text = draft.trim()
    if (!text || inputDisabled || locked || busy) return
    setDraft('')
    await onSend(text)
  }

  const onComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    } else if (e.key === 'Escape') {
      setDraft('')
    }
  }

  const placeholder = locked
    ? 'Conversation finished — start a new document'
    : !hasTranscript
      ? 'Add a transcript first'
      : 'What should change? Press Enter to send (Shift+Enter for newline)'

  const showExamples = messages.length === 0 && !streaming

  return (
    <section
      className={`flex h-full min-h-0 flex-col ${panelSurface} ${panelPad}`}
      aria-label="Assistant chat"
    >
      <div className="shrink-0">
        <p className={`${eyebrow} mb-1`}>Right side · Assistant</p>
        <h2 className={sectionTitle}>Tell the assistant what to do</h2>
        <p className={sectionHelp}>
          Each reply rewrites your transcript. Iterate until you&apos;re happy, then finalise.
        </p>
      </div>

      {/* 2026-05-01 — The single flex-1 region in the rail. min-h-0 is critical
          so this child can shrink below its content size and become a real
          scroll container instead of stretching the rail. */}
      <div
        ref={scrollerRef}
        aria-live="polite"
        aria-busy={busy}
        className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border border-white/[0.05] bg-black/25 p-4"
      >
        {showExamples ? (
          <div className="space-y-3">
            <p className="text-xs font-medium text-zinc-400">
              Try one of these to get started:
            </p>
            <div className="flex flex-wrap gap-2">
              {PROMPT_EXAMPLES.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={inputDisabled || locked}
                  onClick={() => {
                    setDraft(p)
                    composerRef.current?.focus()
                  }}
                  className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-left text-xs text-zinc-300 transition hover:border-violet-400/30 hover:bg-violet-500/10 hover:text-zinc-100 disabled:opacity-40"
                >
                  {p}
                </button>
              ))}
            </div>
            {secondaryAction ? (
              <div className="mt-4 rounded-xl border border-white/[0.05] bg-black/30 p-3">
                {secondaryAction.helpText ? (
                  <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">
                    {secondaryAction.helpText}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={secondaryAction.onClick}
                  disabled={inputDisabled}
                  className="text-xs font-medium text-violet-300 underline-offset-2 hover:text-violet-200 hover:underline disabled:opacity-40"
                >
                  {secondaryAction.label} →
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {messages.map((m) => (
          <ChatBubble key={m.id} role={m.role} content={m.content} />
        ))}

        {streaming ? (
          <ChatBubble role="assistant" content={streaming} streaming />
        ) : null}
      </div>

      {/* Composer */}
      <div className="mt-3 flex shrink-0 flex-col gap-2 rounded-2xl border border-white/[0.07] bg-black/30 p-2 transition focus-within:border-violet-500/40 focus-within:ring-2 focus-within:ring-violet-500/20">
        <textarea
          ref={composerRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onComposerKey}
          disabled={inputDisabled || locked || busy}
          rows={2}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-2 pl-2">
          <span className="hidden text-[10px] uppercase tracking-wider text-zinc-600 sm:inline">
            Enter to send · Shift+Enter newline · ⌘/Ctrl K focuses
          </span>
          <button
            type="button"
            disabled={inputDisabled || locked || busy || !draft.trim()}
            onClick={() => void send()}
            className={`${btnPrimary} ml-auto h-9`}
          >
            {busy ? (
              <>
                <Spinner className="text-zinc-700" /> Sending
              </>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </div>

      {/* Finalize */}
      <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-zinc-500">
          {locked
            ? 'Finalised. Use “New document” on the left to start over.'
            : canFinalize
              ? 'Happy with the latest draft? Lock it in.'
              : 'Send at least one instruction to enable Finalise.'}
        </p>
        <button
          type="button"
          disabled={!canFinalize || busy}
          onClick={onFinalize}
          className={btnSuccess}
        >
          Finalise document
        </button>
      </div>

      {error ? (
        <div className="mt-3 shrink-0">
          <ErrorBanner message={error} onDismiss={onDismissError} />
        </div>
      ) : null}
    </section>
  )
}

// 2026-05-01 — Assistant bubbles render Markdown so structured replies (memos,
// bullets, tables) appear formatted in chat instead of as raw text. User
// bubbles stay as plain text since user prompts aren't formatted.
// A pulsing caret is appended while streaming so partial content reads as
// "still being written" without flickering.
function ChatBubble({
  role,
  content,
  streaming = false,
}: {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}) {
  const isUser = role === 'user'
  return (
    <div
      className={
        isUser
          ? 'self-end max-w-[88%] rounded-2xl rounded-br-md border border-violet-500/25 bg-violet-950/40 px-4 py-2.5 text-sm text-zinc-100 shadow-[0_0_0_1px_rgba(139,92,246,0.06)_inset]'
          : 'self-start w-full max-w-full rounded-2xl rounded-bl-md border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-sm text-zinc-100'
      }
    >
      <p className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {isUser ? 'You' : 'Assistant'}
        {streaming ? (
          <span className="inline-flex size-1.5 animate-pulse rounded-full bg-violet-400" />
        ) : null}
      </p>
      {isUser ? (
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
          {content}
        </pre>
      ) : (
        <div className="relative">
          <MarkdownPreview source={content} />
          {streaming ? (
            <span
              className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-violet-300/80 align-baseline"
              aria-hidden
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
