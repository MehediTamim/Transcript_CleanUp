// 2026-05-01 — Microphone capture hook shared by EditorPage and HearingPage.
// Encapsulates getUserMedia + MediaRecorder lifecycle so pages don't reimplement
// it. The hook returns the current state plus stable callbacks. It also
// gracefully picks the best supported MIME type (webm/opus is preferred since
// OpenAI Whisper handles it well; falls back to plain webm or browser default).
// Stops all media tracks on stop and on unmount to avoid hanging mic indicators.

import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderState = 'idle' | 'recording'

export type UseAudioRecorder = {
  state: RecorderState
  recording: boolean
  blob: Blob | null
  error: string | null
  start: () => Promise<void>
  stop: () => void
  reset: () => void
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
    return 'audio/webm;codecs=opus'
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
  return ''
}

export function useAudioRecorder(): UseAudioRecorder {
  const [state, setState] = useState<RecorderState>('idle')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setBlob(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = pickMimeType()
      const mr = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      mr.onstop = () => {
        cleanupStream()
        const finalBlob = new Blob(chunksRef.current, {
          type: mr.mimeType || 'audio/webm',
        })
        setBlob(finalBlob)
        recorderRef.current = null
        setState('idle')
      }
      // Time-slice at 250ms so we can resume mid-recording in the future.
      mr.start(250)
      recorderRef.current = mr
      setState('recording')
    } catch (e) {
      cleanupStream()
      setError(e instanceof Error ? e.message : String(e))
      setState('idle')
    }
  }, [cleanupStream])

  const stop = useCallback(() => {
    const mr = recorderRef.current
    if (mr && mr.state !== 'inactive') {
      mr.stop()
    } else {
      cleanupStream()
      setState('idle')
    }
  }, [cleanupStream])

  const reset = useCallback(() => {
    setBlob(null)
    setError(null)
  }, [])

  // Safety net: tear down the mic if the component using us unmounts mid-record.
  useEffect(() => {
    return () => {
      const mr = recorderRef.current
      if (mr && mr.state !== 'inactive') mr.stop()
      cleanupStream()
    }
  }, [cleanupStream])

  return {
    state,
    recording: state === 'recording',
    blob,
    error,
    start,
    stop,
    reset,
  }
}
