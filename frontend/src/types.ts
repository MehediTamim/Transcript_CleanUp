export type RunStatus =
  | 'awaiting_human'
  | 'running'
  | 'completed'
  | 'not_found'

export type InterruptPayload = {
  stage: string
  research_enriched: string
}

export type RunStateResponse = {
  thread_id: string
  status: RunStatus
  values: Record<string, unknown>
  interrupt: InterruptPayload | null
}

export type RunCreateResponse = {
  thread_id: string
  status: RunStatus
  interrupt: InterruptPayload | null
}

export type TranscriptionSegment = {
  start: number
  end: number
  text: string
}

export type TranscribeResponse = {
  transcript: string
  segments: TranscriptionSegment[]
}

export type ChatMessageItem = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export type SessionDetailResponse = {
  session_id: string
  status: string
  initial_transcript: string
  finalized_content: string | null
  created_at: string
  messages: ChatMessageItem[]
}

export type SessionCreateResponse = {
  session_id: string
}

export type FinalizeResponse = {
  final_content: string
}
