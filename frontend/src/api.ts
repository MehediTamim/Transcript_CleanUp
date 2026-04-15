const apiBase = (): string => {
  const ai = (import.meta.env.AI_BASE_URL as string | undefined)?.replace(
    /\/$/,
    '',
  )
  if (ai) return ai
  return (
    (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ??
    ''
  )
}

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const b = apiBase()
  return b ? `${b}${p}` : p
}

export async function apiJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = (await res.json()) as { detail?: unknown }
      if (typeof j.detail === 'string') detail = j.detail
      else if (Array.isArray(j.detail) && j.detail.length > 0) {
        const row = j.detail[0] as { msg?: unknown }
        if (typeof row?.msg === 'string') detail = row.msg
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

export async function apiFormJson<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(apiUrl(path), { method: 'POST', body: form })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = (await res.json()) as { detail?: unknown }
      if (typeof j.detail === 'string') detail = j.detail
      else if (Array.isArray(j.detail) && j.detail.length > 0) {
        const row = j.detail[0] as { msg?: unknown }
        if (typeof row?.msg === 'string') detail = row.msg
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

/** POST SSE stream: `data: {"delta":"..."}\n\n` then `data: {"done":true}\n\n` or `error`. */
export async function postSessionChatStream(
  sessionId: string,
  content: string,
  onDelta: (chunk: string) => void,
): Promise<{ error?: string }> {
  const res = await fetch(apiUrl(`/api/sessions/${sessionId}/messages`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = (await res.json()) as { detail?: unknown }
      if (typeof j.detail === 'string') detail = j.detail
      else if (Array.isArray(j.detail) && j.detail.length > 0) {
        const row = j.detail[0] as { msg?: unknown }
        if (typeof row?.msg === 'string') detail = row.msg
      }
    } catch {
      /* ignore */
    }
    return { error: detail || `HTTP ${res.status}` }
  }
  const reader = res.body?.getReader()
  if (!reader) return { error: 'No response body' }

  const dec = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += dec.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.replace(/^data:\s?/, '').trim()
        if (!payload) continue
        try {
          const data = JSON.parse(payload) as {
            delta?: string
            done?: boolean
            error?: string
          }
          if (typeof data.delta === 'string' && data.delta) onDelta(data.delta)
          if (data.done) return {}
          if (typeof data.error === 'string') return { error: data.error }
        } catch {
          /* ignore malformed chunk */
        }
      }
    }
  }
  return {}
}
