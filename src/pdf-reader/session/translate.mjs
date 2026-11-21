// The extension's own translation, for the reader: the background's chain — the engine the reader chose on the settings
// page, an LLM or Microsoft, with its fallbacks, its cache and its queues (DESIGN §8) — reached through the messages
// the HTML page's session sends (src/shared/transport.ts). The chain decides the wire
// format (`format`: tags for an LLM, markers for Microsoft, runs for an engine that keeps no placeholder) and the
// target language; the reader serialises its units by the one and typesets for the other.
import { toBcp47 } from '@/config/languages'
import { isBuiltInService } from '@/config/services'
import { ABSTRACT_MAX_CHARS } from '@/core/extractor/context'
import { isPermanentErrorKind } from '@/providers/types'
import { alignmentOf, unitOfWire, wholeAlignment, wireOfContent } from '@/core/protector/units'
import { createMessageTransport } from '@/shared/transport'
import { plainSource } from '../engine/translate/mt.mjs'

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
 * elsewhere), and `lost` the indices of the texts that did not, which are not to be sent again piece by piece
 * (PDF-READER §10.3)
 */
export class EngineError extends Error {
  constructor(kind, message, { partial, lost } = {}) {
    super(message)
    this.name = 'EngineError'
    this.kind = kind
    if (partial) Object.assign(this, { partial, lost })
  }
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
  // watches, and a page closed while that call was out left its scope bound (PDF-READER §10.4)
  const withdraw = () => void transport.cancel(scope)
  addEventListener('pagehide', withdraw, { once: true })
  const status = await transport.status(scope, { fresh: true })
  if (!status.available && !status.fallback) {
    // the status call bound the scope; nothing withdraws it but us
    removeEventListener('pagehide', withdraw)
    await transport.cancel(scope)
    // why, as the chain's error kinds, so that the reader words it as the popup does: the reason it was put aside; a
    // service of the reader's own that cannot run has no key (an LLM runs once it has one); a built-in engine, unknown
    const kind = status.demotions?.find(d => d.id === status.providerId)?.kind ?? (isBuiltInService(status.chosen) ? 'unknown' : 'no-key')
    throw new EngineError(kind, `the chosen service (${status.chosen}) cannot translate now: see the extension's settings`)
  }
  // the service that answers: the chosen one, its fallback while it cannot, and after a hand-over the one that took
  // over, as each answer names it
  let serving = status.available ? (status.model ? `${status.providerId} (${status.model})` : status.providerId) : status.fallback.id
  const target = status.targetLanguage
  /**
   * Texts in the chain's wire format → their translations, `{ text, by, alignment? }` with `by` the identity of the
   * translator that answered (the chain's result's `by`) and `alignment` the engine's sentence lengths
   * where it reported them, null where one did not come back: a text the engine could not
   * take. A failure not of the texts' making is thrown once every batch has answered (EngineError's `lost`)
   */
  async function translate(texts, context = {}, cuts) {
    // (stage 4b: the background's one chain takes units, not wires. Until the reader's own units reach it (stage 5a),
    // each text the engine wrote in the chain's format is read as a unit by the HTML page's shim, and a result written
    // back as such a text: the engine reads it as it read a translator's reply. The chain cuts its own requests, asks a
    // refused unit again and falls through per unit, so no chunking or halving is left here)
    const format = status.renderPath
    const read = texts.map((text, i) => unitOfWire(String(i), text, format, { sentences: format === 'markers' || (cuts?.[i]?.length ?? 0) > 0 }))
    // an empty context is left out, not sent as {}
    const res = await transport.translate({ units: read.map(r => r.unit), target, ...(Object.keys(context).length ? { context } : {}), scope })
    if (!res.ok) {
      if (isPermanentErrorKind(res.error.kind)) throw new EngineError(res.error.kind, res.error.message)
      throw new EngineError(res.error.kind, res.error.message, { partial: texts.map(() => null), lost: new Set(texts.map((_, i) => i)) })
    }
    const out = new Array(texts.length).fill(null), lost = new Set()
    let failure = null
    for (const r of res.results) {
      const i = Number(r.id), from = read[i]
      if (!from) continue
      if (r.ok) {
        const back = wireOfContent(r.content, from)
        const alignment = cuts?.[i]?.length === 0 ? wholeAlignment(texts[i], back.wire) : alignmentOf(r.sentences, from, texts[i], back)
        out[i] = { text: back.wire, by: r.by, ...(alignment ? { alignment } : {}) }
        if (r.engine) serving = r.engine === status.providerId && status.model ? `${r.engine} (${status.model})` : r.engine
        continue
      }
      if (isPermanentErrorKind(r.error.kind)) throw new EngineError(r.error.kind, r.error.message)
      // refused: a text the engine could not take (null); a failure not of the text's making: lost, not to be sent again
      // piece by piece (PDF-READER §10.3)
      if (r.why.kind !== 'refused') {
        lost.add(i)
        failure = r.error
      }
    }
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
