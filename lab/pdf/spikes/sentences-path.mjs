// The highlight's sentences as the reader comes by them, from Microsoft answers kept on this machine (the review of B3,
// I2: the gates read sentence files made once and so tested no change to the path that makes them): each answer
// through the extension's Microsoft provider (src/providers/microsoft.ts: its `sentLen` read and verified), the
// service's check again (translate-service.ts, verifyAlignment), the reader's engine (engine.mjs translate, which keeps
// the alignment) and its translation (mt.mjs translateUnits: the wire read back strictly or tolerantly, sentencesOf).
// Only the network and the extension's messages are stood in for: the endpoint by the kept answers, the background by
// a function that hands the engine's batches to the provider. No request is made; a wire with no kept answer gets none.
//   sentencesThroughEngine({ units, cache, keep }) → { [unit index]: { src, tr } }
//   `units` the paper's units sent (openPaper's, the kept ones left out); `cache` wire → { text, src, tgt } (the
//   Microsoft answers spikes/highlight-sentences.mjs keeps, `src` and `tgt` its sentence lengths); `keep(i, pieces)`
//   whether unit i's translation is the one its run typeset (its sentences are kept only then)
import { verifyAlignment } from '../../../src/providers/alignment'
import { createMicrosoftProvider } from '../../../src/providers/microsoft'

/** the background's answer to the reader's messages: its status, and each batch through the provider */
let answer = null
// the reader's engine reaches the background through the extension's messages (wxt/browser: globalThis.chrome), and
// withdraws its scope when the page goes (addEventListener): both stood in for before engine.mjs is loaded
globalThis.chrome ??= { runtime: { id: 'sentences-path', sendMessage: async message => answer(message) } }
globalThis.addEventListener ??= () => {}
globalThis.removeEventListener ??= () => {}
const { openEngine } = await import('../../../src/pdf-reader/session/translate.mjs')
const { translateUnits } = await import('../../../src/pdf-reader/engine/translate/mt.mjs')

const STATUS = { available: true, providerId: 'microsoft', chosen: 'microsoft', targetLanguage: 'cmn', renderPath: 'markers', maxBatchChars: 2000, maxBatchItems: 100, identity: 'microsoft' }

export async function sentencesThroughEngine({ units, cache, keep }) {
  // the endpoint: each text's kept answer, its sentence lengths as Microsoft gives them
  const fetch = async (_url, init) => new Response(JSON.stringify(JSON.parse(init.body).map(w => {
    const a = cache.get(w)
    return { translations: [{ text: a.text, ...(a.src && a.tgt ? { sentLen: { srcSentLen: a.src, transSentLen: a.tgt } } : {}) }] }
  })))
  const provider = createMicrosoftProvider(STATUS.targetLanguage, { fetch })
  answer = async message => {
    if (message.type === 'axt:provider-status') return STATUS
    if (message.type === 'axt:cancel-scope') return { cancelled: 0 }
    if (message.type !== 'axt:translate') throw new Error(`no answer to ${message.type}`)
    // the texts with a kept answer, through the provider; the rest come back as none (the engine's null)
    const { request } = message, segments = request.segments.filter(s => cache.has(s.text))
    const result = segments.length ? await provider.translate({ ...request, segments }) : { segments: [], provider: 'microsoft' }
    const sources = new Map(segments.map(s => [s.id, s.text]))
    return { ok: true, result: { ...result, segments: result.segments.map(s => ({ ...s, identity: 'microsoft', alignment: verifyAlignment(s.alignment, sources.get(s.id), s.text) })) } }
  }
  const engine = await openEngine({ paper: 'sentences-path' })
  const { results } = await translateUnits(units.map(({ u }) => u), texts => engine.translate(texts), 'markers')
  await engine.close()
  const out = {}
  for (const { u, i } of units) {
    const r = results.get(u)
    if (r?.sentences && r.state === 'whole' && keep(i, r.pieces)) out[i] = r.sentences
  }
  return out
}
