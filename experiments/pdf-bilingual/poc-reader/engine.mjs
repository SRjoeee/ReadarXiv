// The extension's own translation, for the reader: the background's chain — the engine the reader chose on the settings
// page, an LLM or Microsoft, with its fallbacks, its cache and its queues (DESIGN §8) — reached through the messages
// the HTML page's session sends (lib/axt/translate.mjs, built from src/shared/transport.ts). The chain decides the wire
// format (`format`: tags for an LLM, markers for Microsoft, runs for an engine that keeps no placeholder) and the
// target language; the reader serialises its units by the one and typesets for the other.
import { ABSTRACT_MAX_CHARS, createMessageTransport, isPermanentErrorKind, toBcp47 } from './lib/axt/translate.mjs'
import { plainSource } from './mt.mjs'

/** the paper's title and abstract for an LLM's prompt, the abstract cut as the HTML page cuts it (src/core/extractor/context.ts) */
export function paperContext(units) {
  const title = units.find(u => u.title)
  const abstract = units.filter(u => u.kind === 'abstract').map(plainSource).join(' ')
  const clip = s => (s.length <= ABSTRACT_MAX_CHARS ? s : `${s.slice(0, ABSTRACT_MAX_CHARS).replace(/\s+\S*$/, '')}...`)
  return { ...(title ? { paperTitle: plainSource(title) } : {}), ...(abstract ? { abstract: clip(abstract) } : {}) }
}

/** Why the reader cannot translate: no engine on the chain can run, or one refused for good (no key, a key refused) */
export class EngineError extends Error {
  constructor(kind, message) {
    super(message)
    this.name = 'EngineError'
    this.kind = kind
  }
}

/** the texts' indices in calls of at most `chars` characters and `items` texts, as one of the engine's batches holds */
function chunks(texts, chars, items) {
  const out = []
  let cur = [], n = 0
  texts.forEach((t, i) => {
    if (cur.length && (n + t.length > chars || cur.length >= items)) { out.push(cur); cur = []; n = 0 }
    cur.push(i); n += t.length
  })
  if (cur.length) out.push(cur)
  return out
}

/**
 * The chain as the reader uses it for one paper: `paper` names the cache's entries; `translate(texts, context)` sends
 * the paper's title and abstract ({ paperTitle, abstract }) with every batch, as the HTML page does, for an LLM's
 * prompt. One scope for the whole paper, withdrawn by `close()`: an extension page is no tab the background watches
 * (shared/messages.ts), so the reader says when it is done
 */
export async function openEngine({ paper }) {
  const transport = createMessageTransport()
  const scope = `axt-pdf-${crypto.randomUUID()}`
  const status = await transport.status(scope, { fresh: true })
  if (!status.available && !status.fallback) throw new EngineError('unavailable', `the chosen service (${status.chosen}) cannot translate now: see the extension's settings`)
  const target = status.targetLanguage
  const cache = { paper, renderPath: status.renderPath }
  /** texts in the chain's wire format → their translations, null where one did not come back */
  async function translate(texts, context = {}) {
    // an empty context is left out, not sent as {}: it enters the cache key (src/core/run/call.ts)
    const withContext = Object.keys(context).length ? { context } : {}
    const out = new Array(texts.length).fill(null)
    const call = async idx => {
      const segments = idx.map(i => ({ id: String(i), text: texts[i] }))
      const res = await transport.translate({ request: { segments, source: 'en', target, ...withContext }, cache, scope })
      for (const s of res.ok ? res.result.segments : (res.partial ?? [])) out[Number(s.id)] = s.text
      if (res.ok) return
      if (isPermanentErrorKind(res.error.kind)) throw new EngineError(res.error.kind, res.error.message)
      // one text the engine cannot take must not sink its batch: halves, as the HTML page's session splits (run.ts)
      const left = idx.filter(i => out[i] == null)
      if (res.error.isolatable && left.length > 1) await Promise.all([call(left.slice(0, left.length >> 1)), call(left.slice(left.length >> 1))])
    }
    await Promise.all(chunks(texts, status.maxBatchChars, status.maxBatchItems).map(call))
    return out
  }
  return {
    lang: toBcp47(target),
    format: status.renderPath,
    engine: status.model ? `${status.providerId} (${status.model})` : status.providerId,
    translate,
    close: () => transport.cancel(scope),
  }
}
