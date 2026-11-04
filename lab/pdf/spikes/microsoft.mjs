// lab/pdf/spikes/microsoft.mjs
// The lab's client of Microsoft's free endpoint, as the extension calls it (src/providers/microsoft.ts): the fixture maker's
// (layer-fixtures.mjs), the figure gate's `--mt-fetch` and the pack's recut ask it for what a fixture lacks. It was the engine's
// own (translate/mt.mjs) until 2026-11-04 (the rules audit's T8): no reader of the engine calls it, the web and the extension
// each having their own chain. The requests are the lab's; translate/mt.mjs translateUnits reads the answers as any reader does.

/** Microsoft's codes for the targets the lab asks, where they are not the language's own */
export const MICROSOFT_LANG = Object.freeze({ zh: 'zh-Hans', ja: 'ja', de: 'de', 'zh-TW': 'zh-Hant' })
/** the User-Agent of every request the lab makes */
const UA = 'ReadarXiv/0.1 (+https://readarxiv.org; research)'

/** one request: texts → translations (null where the engine returned nothing) */
export async function translateMicrosoft(texts, to) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`https://edge.microsoft.com/translate/translatetext?${new URLSearchParams({ from: '', to: MICROSOFT_LANG[to] ?? to, isEnterpriseClient: 'false' })}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify(texts) })
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return json.map(item => item?.translations?.[0]?.text ?? null)
    } catch (e) { if (attempt === 3) throw e; await new Promise(r => setTimeout(r, 1500 * (attempt + 1))) }
  }
}
/** texts in requests of at most 2000 characters or 100 texts, `parallel` requests at a time (`send`: one request) */
export async function translateTexts(texts, to, { parallel = 4, send = translateMicrosoft } = {}) {
  const batches = []
  let cur = [], chars = 0
  for (const [i, w] of texts.entries()) { if (cur.length && (chars + w.length > 2000 || cur.length >= 100)) { batches.push(cur); cur = []; chars = 0 } cur.push(i); chars += w.length }
  if (cur.length) batches.push(cur)
  const out = new Array(texts.length).fill(null)
  let next = 0
  await Promise.all(Array.from({ length: parallel }, async () => {
    while (next < batches.length) {
      const b = batches[next++]
      const got = await send(b.map(i => texts[i]), to).catch(() => b.map(() => null))
      b.forEach((i, k) => { out[i] = got[k] ?? null })
    }
  }))
  return out
}
