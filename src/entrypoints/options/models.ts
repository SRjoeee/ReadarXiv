// The endpoint's models, for the model field's list (the redesign's design, §6.3): the OpenAI-compatible `GET /models`,
// asked from this page — an extension page with the endpoint's origin granted is not held to CORS. Only for an origin
// already granted: asking for one takes a gesture (permissions.request), which the form's own presses give
export interface ModelOption { id: string; name?: string }

export async function listModels(baseURL: string, apiKey: string, signal: AbortSignal): Promise<ModelOption[]> {
  const res = await fetch(`${baseURL.replace(/\/+$/, '')}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, signal })
  if (!res.ok) throw new Error(`the model list answered ${res.status}`)
  const body = (await res.json()) as { data?: unknown }
  if (!Array.isArray(body.data)) throw new Error('the model list holds no list')
  const seen = new Set<string>()
  const out: ModelOption[] = []
  for (const entry of body.data as { id?: unknown; name?: unknown }[]) {
    if (typeof entry?.id !== 'string' || !entry.id || seen.has(entry.id)) continue
    seen.add(entry.id)
    out.push(typeof entry.name === 'string' && entry.name && entry.name !== entry.id ? { id: entry.id, name: entry.name } : { id: entry.id })
  }
  return out
}
