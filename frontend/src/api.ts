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
