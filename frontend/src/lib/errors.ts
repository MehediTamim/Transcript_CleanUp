// 2026-05-01 — Friendly error message mapper shared by every page.
// Centralised so we add new mappings in exactly one place. The function takes
// any unknown thrown value (Error, string, etc.) and always returns a short,
// user-facing sentence — never a stack trace and never a raw HTTP body.

export function humanizeError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('503') || m.includes('unavailable'))
    return "We're having trouble right now. Please try again in a moment."
  if (m.includes('microphone') || m.includes('denied') || m.includes('notallowed'))
    return 'Your browser blocked the microphone. Allow access in settings, then try again.'
  if (m.includes('no speech') || (m.includes('empty') && m.includes('speech')))
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
    return 'That file type is not supported. Please upload MP3, WAV, M4A, WebM, OGG, FLAC, or AAC.'
  return "Something didn't work. Please try again."
}

export function friendlyMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return humanizeError(raw)
}
