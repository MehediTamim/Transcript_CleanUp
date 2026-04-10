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
