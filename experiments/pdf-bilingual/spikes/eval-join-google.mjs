// The joined figure (eval-join2.mjs) on Google's free endpoint as the extension calls it (translateHtml, the tags
// wire format: a box's text escaped `& < >`, void placeholders `<x id="N"/>` between boxes). Boxes one by one against
// 20 a text with a figure's repeats once; the same split check as eval-join2 (every id once and in order, no box empty,
// no placeholder's remains, no box over four times its source). Writes out/eval-join-google-<lang>.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isName, translateTexts } from '../../../src/pdf-reader/engine/mt.mjs'
import { linesToBoxes } from '../../../src/core/image/boxes.ts'
const root = new URL('..', import.meta.url).pathname
const lang = process.argv[2] ?? 'zh'
const GOOGLE_LANG = { zh: 'zh', ja: 'ja', de: 'de' }
// the public constant of Google Translate's web app, as src/providers/google-web.ts sends it (not a credential)
const KEY = 'AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520'
async function sendGoogle(items, to) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch('https://translate-pa.googleapis.com/v1/translateHtml', { method: 'POST', headers: { 'Content-Type': 'application/json+protobuf', 'X-Goog-API-Key': KEY }, body: JSON.stringify([[items, 'en', GOOGLE_LANG[to] ?? to], 'wt_lib']) })
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return json[0]
    } catch (e) { if (attempt === 3) throw e; await new Promise(r => setTimeout(r, 1500 * (attempt + 1))) }
  }
}
const send = (texts, to) => sendGoogle(texts, to)
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, b) => b[0] === '#' ? String.fromCodePoint(b[1].toLowerCase() === 'x' ? parseInt(b.slice(2), 16) : parseInt(b.slice(1), 10)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[b.toLowerCase()])
const wire = texts => texts.map((t, i) => (i ? ` <x id="${i}"/> ` : '') + esc(t)).join('')
const TAG = /<x\s+id\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))\s*(?:\/>|>\s*<\/x\s*>)/g
function split(text, sources) {
  const parts = []
  let last = 0, expect = 1, m
  TAG.lastIndex = 0
  while ((m = TAG.exec(text))) {
    if (Number(m[1] ?? m[2] ?? m[3]) !== expect++) return null
    parts.push(text.slice(last, m.index)); last = TAG.lastIndex
  }
  parts.push(text.slice(last))
  if (parts.length !== sources.length) return null
  const out = parts.map(t => decode(t).trim())
  for (const [i, t] of out.entries()) { const s = sources[i]; if (!t || (/<\/?x\b|id=/.test(t)) || t.length > 4 * s.length + 8) return null }
  return out
}
const papers = JSON.parse(readFileSync(join(root, 'out/eval-labels.json'), 'utf8'))
const figures = []
for (const p of papers) for (const f of p.figures) { const boxes = linesToBoxes(f.lines); if (boxes.length) figures.push({ id: p.id, figure: f.figure, prose: p.prose, texts: [...new Set(boxes.map(b => b.text))] }) }
const distinct = [...new Set(figures.flatMap(f => f.texts))]
const aloneOut = await translateTexts(distinct.map(esc), lang, { send, parallel: 2 })
const alone = new Map(distinct.map((t, i) => [t, aloneOut[i] == null ? null : decode(aloneOut[i])]))
const chunks = []
for (const f of figures) for (let k = 0; k < f.texts.length; k += 20) { const part = f.texts.slice(k, k + 20); if (part.length > 1) chunks.push({ f, texts: part }) }
const out = await translateTexts(chunks.map(c => wire(c.texts)), lang, { send, parallel: 2 })
let split_ = 0, boxes = 0
const rows = []
chunks.forEach((c, j) => {
  const parts = out[j] != null ? split(out[j], c.texts) : null
  if (!parts) return
  split_++; boxes += c.texts.length
  parts.forEach((t, i) => rows.push({ id: c.f.id, figure: c.f.figure, text: c.texts[i], name: isName(c.texts[i], c.f.prose), alone: alone.get(c.texts[i]), together: t }))
})
const norm = s => (s ?? '').replace(/\s+/g, '').replace(/[，,。.、：:;；（）()]/g, '').toLowerCase()
const same = (a, b) => norm(a) === norm(b)
const names = rows.filter(r => r.name), words = rows.filter(r => !r.name)
const stats = { chunks: chunks.length, split: split_, boxesAll: chunks.reduce((n, c) => n + c.texts.length, 0), boxes,
  names: names.length, namesChangedAlone: names.filter(r => !same(r.alone, r.text)).length, namesChangedTogether: names.filter(r => !same(r.together, r.text)).length,
  words: words.length, wordsKeptAlone: words.filter(r => same(r.alone, r.text)).length, wordsKeptTogether: words.filter(r => same(r.together, r.text)).length, wordsDiffer: words.filter(r => !same(r.alone, r.together)).length }
writeFileSync(join(root, `out/eval-join-google-${lang}.json`), JSON.stringify({ stats, rows, raw: out, chunks: chunks.map(c => c.texts) }, null, 1))
console.log(stats)
