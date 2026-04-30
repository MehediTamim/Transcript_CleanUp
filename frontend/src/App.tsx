// 2026-05-01 — EditorPage (`/`). Two-pane workspace inspired by ChatGPT Canvas
// / Claude Artifacts / Cursor's editor+chat: SourcePane on the left, ChatRail
// on the right. State stays here in the page; presentation lives in the
// extracted components. Streaming updates a single state slice and never
// pushes layout around.
//
// Mobile (< lg): a segmented tab control (Source | Chat | Final) replaces the
// side-by-side grid so the user can focus on one column at a time without the
// composer being pushed offscreen.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFormJson, apiJson, postSessionChatStream } from './api'
import { ChatRail } from './components/ChatRail'
import { LegacyQuickPass } from './components/LegacyQuickPass'
import { SegmentedTabs } from './components/SegmentedTabs'
import { SourcePane, type SourcePaneStage } from './components/SourcePane'
import { TopBar, type WorkspaceStatus } from './components/TopBar'
import { WorkspaceShell } from './components/WorkspaceShell'
import { friendlyMessage } from './lib/errors'
import type {
  ChatMessageItem,
  FinalizeResponse,
  SessionCreateResponse,
  SessionDetailResponse,
  TranscribeResponse,
} from './types'

type MobileTab = 'source' | 'chat' | 'final'

export default function App() {
  const [raw, setRaw] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [streaming, setStreaming] = useState('')
  const [busy, setBusy] = useState(false)
  const [audioBusy, setAudioBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finalContent, setFinalContent] = useState<string | null>(null)
  const [sessionFinalized, setSessionFinalized] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('source')
  const [showLegacy, setShowLegacy] = useState(false)

  const setFriendlyError = useCallback((e: unknown) => {
    setError(friendlyMessage(e))
  }, [])

  // Stage drives what the SourcePane renders. We compute it from atomic state
  // rather than tracking a separate enum, so impossible states are unreachable.
  const stage: SourcePaneStage = useMemo(() => {
    if (sessionFinalized && finalContent) return 'finalized'
    if (sessionId) return 'transcript-locked'
    if (raw.trim()) return 'transcript-draft'
    return 'empty'
  }, [sessionId, sessionFinalized, finalContent, raw])

  // When the workspace transitions to 'finalized' (the chat is locked and the
  // user is reading the document) we auto-show the Final tab on mobile so they
  // don't have to hunt for it.
  useEffect(() => {
    if (stage === 'finalized') setMobileTab('final')
    else if (stage === 'empty' || stage === 'transcript-draft') setMobileTab('source')
  }, [stage])

  const loadSession = useCallback(async (sid: string) => {
    const data = await apiJson<SessionDetailResponse>(`/api/sessions/${sid}`)
    setMessages(data.messages)
    setSessionFinalized(data.status === 'finalized')
    if (data.finalized_content) setFinalContent(data.finalized_content)
  }, [])

  const resetWorkspace = () => {
    setSessionId(null)
    setMessages([])
    setStreaming('')
    setFinalContent(null)
    setSessionFinalized(false)
    setError(null)
    setRaw('')
    setMobileTab('source')
  }

  // Wraps /api/transcribe/ — produces text from a recorded blob or uploaded file.
  // Falls back to concatenated segments if the top-level transcript is empty
  // (older Whisper responses behave that way).
  const transcribeAudio = useCallback(
    async (blob: Blob, filename: string) => {
      setError(null)
      setAudioBusy(true)
      try {
        const fd = new FormData()
        fd.append('file', blob, filename)
        const data = await apiFormJson<TranscribeResponse>('/api/transcribe/', fd)
        const direct = (data.transcript ?? '').trim()
        const text =
          direct ||
          (data.segments ?? [])
            .map((s) => s.text.trim())
            .filter(Boolean)
            .join(' ')
            .trim()
        if (!text) {
          setError(friendlyMessage('empty speech'))
          return
        }
        setRaw(text)
      } catch (e) {
        setFriendlyError(e)
      } finally {
        setAudioBusy(false)
      }
    },
    [setFriendlyError],
  )

  // Send a chat instruction. On the first send we lazily create a session
  // bound to the current transcript; subsequent sends reuse it. The streamed
  // assistant reply is rendered in place inside the ChatRail; we only persist
  // it into `messages` when the stream completes via loadSession().
  const sendCommand = useCallback(
    async (text: string) => {
      const base = raw.trim()
      if (!base) {
        setError('Add a transcript first (audio, mic, or paste).')
        return
      }
      setError(null)
      setBusy(true)
      setStreaming('')
      // Optimistic user message. We tag it with a local id so we can roll it
      // back if the stream errors before the server persists anything.
      const userMsg: ChatMessageItem = {
        id: `local-${Date.now()}`,
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
      }
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
        setMessages((m) => [...m, userMsg])

        let acc = ''
        const err = await postSessionChatStream(sid, text, (delta) => {
          acc += delta
          setStreaming(acc)
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
        setMessages((m) => m.filter((x) => x.id !== userMsg.id))
      } finally {
        setBusy(false)
      }
    },
    [raw, sessionId, loadSession, setFriendlyError],
  )

  const onFinalize = useCallback(async () => {
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
  }, [sessionId, loadSession, setFriendlyError])

  const chatLocked = sessionFinalized || !!finalContent
  const canFinalize =
    !!sessionId && messages.length > 0 && !chatLocked && !streaming && !busy
  const hasTranscript = !!raw.trim()

  const status: WorkspaceStatus = error
    ? { kind: 'error' }
    : audioBusy
      ? { kind: 'transcribing' }
      : streaming || busy
        ? { kind: 'streaming', label: streaming ? 'Streaming' : 'Working' }
        : sessionFinalized
          ? { kind: 'finalized' }
          : { kind: 'idle' }

  // Render-functions for the two columns so we can swap between mobile tabs
  // without duplicating prop-passing.
  const sourceNode = (
    <SourcePane
      stage={stage}
      rawTranscript={raw}
      onChangeTranscript={setRaw}
      busy={busy}
      audioBusy={audioBusy}
      onTranscribeAudio={(blob, filename) => void transcribeAudio(blob, filename)}
      onAudioError={(m) => setError(m)}
      finalContent={finalContent}
      onNewDocument={resetWorkspace}
    />
  )

  const chatNode = (
    <ChatRail
      messages={messages}
      streaming={streaming}
      inputDisabled={!hasTranscript}
      locked={chatLocked}
      busy={busy}
      canFinalize={canFinalize}
      hasTranscript={hasTranscript}
      onSend={sendCommand}
      onFinalize={() => void onFinalize()}
      secondaryAction={{
        label: 'Or run a one-shot auto-clean (no chat)',
        helpText:
          'The legacy two-step pipeline runs Research → human review → Cleanup on the transcript.',
        onClick: () => setShowLegacy(true),
      }}
      error={error}
      onDismissError={() => setError(null)}
    />
  )

  return (
    <WorkspaceShell
      wide
      header={
        <TopBar
          status={status}
          actions={
            sessionId || finalContent ? (
              <button
                type="button"
                onClick={resetWorkspace}
                className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08]"
              >
                New document
              </button>
            ) : null
          }
        />
      }
    >
      {/* 2026-05-01 — Title is shrink-0 so it stays compact and the grid below
          can claim every remaining pixel. */}
      <section className="mb-5 shrink-0">
        <h1 className="text-balance text-xl font-semibold tracking-tight text-white sm:text-[1.6rem]">
          From recording to the document you want
        </h1>
        <p className="mt-1.5 max-w-2xl text-pretty text-xs leading-relaxed text-zinc-400 sm:text-sm">
          Capture or paste a transcript on the left. Iterate with the assistant on the right.
          Long replies scroll inside their pane — the layout never expands.
        </p>
      </section>

      {/* Mobile tab switcher (hidden on lg+) */}
      <div className="mb-4 shrink-0 lg:hidden">
        <SegmentedTabs
          options={[
            { id: 'source', label: 'Source' },
            { id: 'chat', label: 'Assistant' },
            ...(stage === 'finalized'
              ? ([{ id: 'final', label: 'Final' }] as const)
              : []),
          ]}
          value={mobileTab}
          onChange={setMobileTab}
          ariaLabel="Workspace section"
          fullWidth
          size="md"
        />
      </div>

      {/* 2026-05-01 — flex-1 + min-h-0 makes the grid absorb exactly the leftover
          vertical space inside <main> on desktop. Each grid cell is a flex
          column with min-h-0 so the panes' internal scroll regions activate
          instead of stretching the row. On mobile we keep a sensible min so
          the active tab still feels substantial. */}
      <div className="grid min-h-[560px] flex-1 gap-5 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
        <div
          className={`flex min-h-0 flex-col ${mobileTab === 'source' ? '' : 'hidden'} lg:flex`}
        >
          {sourceNode}
        </div>
        <div
          className={`flex min-h-0 flex-col ${mobileTab === 'chat' ? '' : 'hidden'} lg:flex`}
        >
          {chatNode}
        </div>
      </div>

      {/* Legacy quick-pass — opens as a side drawer when invoked from ChatRail */}
      <LegacyQuickPass
        open={showLegacy}
        onClose={() => setShowLegacy(false)}
        rawTranscript={raw}
        onError={setFriendlyError}
      />
    </WorkspaceShell>
  )
}
