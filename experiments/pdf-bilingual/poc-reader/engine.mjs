// The extension's own translation, for the reader: the background's chain — the engine the reader chose on the settings
// page, an LLM or Microsoft, with its fallbacks, its cache and its queues (DESIGN §8) — reached through the messages
// the HTML page's session sends (lib/axt/extension.mjs, built from src/shared/transport.ts). The chain decides the wire
// format (`format`: tags for an LLM, markers for Microsoft, runs for an engine that keeps no placeholder) and the
// target language; the reader serialises its units by the one and typesets for the other.
import { ABSTRACT_MAX_CHARS, createMessageTransport, isPermanentErrorKind, toBcp47 } from './lib/axt/extension.mjs'
import { plainSource } from './mt.mjs'

/** the paper's title and abstract for an LLM's prompt, the abstract cut as the HTML page cuts it (src/core/extractor/context.ts) */
export function paperContext(units) {
  const title = units.find(u => u.title)
  const abstract = units.filter(u => u.kind === 'abstract').map(plainSource).join(' ')
  const clip = s => (s.length <= ABSTRACT_MAX_CHARS ? s : `${s.slice(0, ABSTRACT_MAX_CHARS).replace(/\s+\S*$/, '')}...`)
  return { ...(title ? { paperTitle: plainSource(title) } : {}), ...(abstract ? { abstract: clip(abstract) } : {}) }
}

/**
 * Why the reader cannot translate: no engine on the chain can run, or one refused for good (no key, a key refused).
 * Or some texts did not come back for a reason not theirs — a network down, a timeout, a rate limit the background's
 * queue has already retried: then `partial` holds what did come back, `{ text, by }` as translate() gives it (null
 * elsewhere), and `lost` the indices of the texts that did not, which are not to be sent again piece by piece (Codex on
 * #296)
 */
export class EngineError extends Error {
  constructor(kind, message, { partial, lost } = {}) {
    super(message)
    this.name = 'EngineError'
    this.kind = kind
    if (partial) Object.assign(this, { partial, lost })
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
 * prompt. One scope for the whole paper, withdrawn by `close()` or when the page goes: an extension page is no tab the
 * background watches (shared/messages.ts), so the reader says when it is done
 */
export async function openEngine({ paper }) {
  const transport = createMessageTransport()
  const scope = `axt-pdf-${crypto.randomUUID()}`
  // withdrawn when the page goes, from before the status call that binds it: an extension page is no tab the background
  // watches, and a page closed while that call was out left its scope bound (Devin and Codex on #296)
  const withdraw = () => void transport.cancel(scope)
  addEventListener('pagehide', withdraw, { once: true })
  const status = await transport.status(scope, { fresh: true })
  if (!status.available && !status.fallback) {
    // the status call bound the scope; nothing withdraws it but us (Codex on #296)
    removeEventListener('pagehide', withdraw)
    await transport.cancel(scope)
    throw new EngineError('unavailable', `the chosen service (${status.chosen}) cannot translate now: see the extension's settings`)
  }
  // the service that answers: the chosen one, its fallback while it cannot, and after a hand-over the one that took
  // over, as each answer names it (Codex on #296)
  let serving = status.available ? (status.model ? `${status.providerId} (${status.model})` : status.providerId) : status.fallback.id
  const target = status.targetLanguage
  const cache = { paper, renderPath: status.renderPath }
  /**
   * Texts in the chain's wire format → their translations, `{ text, by }` with `by` the identity that translated the
   * text (the background's TranslatedSegment.identity), null where one did not come back: a text the engine could not
   * take. A failure not of the texts' making is thrown once every batch has answered (EngineError's `lost`)
   */
  async function translate(texts, context = {}) {
    // an empty context is left out, not sent as {}: it enters the cache key (src/core/run/call.ts)
    const withContext = Object.keys(context).length ? { context } : {}
    const out = new Array(texts.length).fill(null), lost = new Set()
    let failure = null
    const call = async idx => {
      const segments = idx.map(i => ({ id: String(i), text: texts[i] }))
      const res = await transport.translate({ request: { segments, source: 'en', target, ...withContext }, cache, scope })
      for (const s of res.ok ? res.result.segments : (res.partial ?? [])) out[Number(s.id)] = { text: s.text, by: s.identity ?? null }
      if (res.ok) { serving = res.result.model ? `${res.result.provider} (${res.result.model})` : res.result.provider; return }
      if (isPermanentErrorKind(res.error.kind)) throw new EngineError(res.error.kind, res.error.message)
      // one text the engine cannot take must not sink its batch: halves, as the HTML page's session splits (run.ts)
      const left = idx.filter(i => out[i] == null)
      if (res.error.isolatable) { if (left.length > 1) await Promise.all([call(left.slice(0, left.length >> 1)), call(left.slice(left.length >> 1))]); return }
      // a failure of the service, not of these texts: split or sent again it fails the same way, as many times over
      for (const i of left) lost.add(i)
      failure = res.error
    }
    await Promise.all(chunks(texts, status.maxBatchChars, status.maxBatchItems).map(call))
    if (failure) throw new EngineError(failure.kind, failure.message, { partial: out, lost })
    return out
  }
  return {
    lang: toBcp47(target),
    format: status.renderPath,
    get engine() { return serving },
    /** the identity of the engine that answers, as the status said when the paper opened */
    identity: status.identity,
    /** the identity that would answer now, from a fresh status: what a run's result is judged against when it ends */
    now: async () => (await transport.status(scope, { fresh: true })).identity,
    translate,
    close: () => { removeEventListener('pagehide', withdraw); return transport.cancel(scope) },
  }
}
