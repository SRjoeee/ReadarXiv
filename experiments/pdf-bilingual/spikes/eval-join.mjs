// How a figure's boxes are best sent to an engine that takes each text on its own (Microsoft's free endpoint): one by
// one, as the extension does now, or joined into one text a figure and split back — by one marker repeated between
// boxes (the reader's first version), by numbered markers (the extension's markers wire format, `@a#`, `@b#`, …, each
// id checked once and in order), or by line breaks. The boxes are the extension's own (linesToBoxes over the figure's
// lines), over every vector figure of the corpus (out/eval-labels.json). Per way: how many chunks split back, and on
// the boxes that did, the signs of a split in the wrong place — a marker's remains in a box, a box's digits missing
// from its translation, a box repeating its neighbour. Writes out/eval-join-<lang>.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isName, translateTexts } from '../../../src/pdf-reader/engine/mt.mjs'
import { linesToBoxes } from '../../../src/core/image/boxes.ts'
const root = new URL('..', import.meta.url).pathname
const lang = process.argv[2] ?? 'zh'
const CHUNK = Number(process.env.CHUNK ?? 40)
const papers = JSON.parse(readFileSync(join(root, 'out/eval-labels.json'), 'utf8'))

const toAlpha = id => { let n = id, out = ''; while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(97 + r) + out; n = (n - 1 - r) / 26 } return out }
const fromAlpha = s => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 96, 0)
const esc = s => s.replace(/@/g, '@@').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/@@/g, '@')

const WAYS = {
  uniform: {
    wire: texts => texts.map(esc).join(' @a# '),
    split(text, n) { const parts = text.split(/\s*@a#?\s*(?![a-z])/).map(t => unesc(t).trim()); return parts.length === n && parts.every(Boolean) ? parts : null },
  },
  numbered: {
    wire: texts => texts.map((t, i) => (i ? ` @${toAlpha(i)}# ` : '') + esc(t)).join(''),
    // every id from 1 to n − 1 exactly once and in order; the text between them is the boxes. `@@` is a literal @
    split(text, n, tolerant = false) {
      const re = tolerant ? /@@|@([a-z]{1,3})#|@([a-z]{1,3})(?![a-z#])/g : /@@|@([a-z]+)#/g
      const parts = []; let last = 0, buf = '', expect = 1, m
      while ((m = re.exec(text))) {
        buf += text.slice(last, m.index); last = re.lastIndex
        if (m[0] === '@@') { buf += '@@'; continue }
        if (fromAlpha(m[1] ?? m[2]) !== expect++) return null
        parts.push(buf); buf = ''
      }
      parts.push(buf + text.slice(last))
      const out = parts.map(t => unesc(t).trim())
      return out.length === n && out.every(Boolean) ? out : null
    },
  },
  newline: {
    wire: texts => texts.map(esc).join('\n'),
    split(text, n) { const parts = text.split(/\n/).map(t => unesc(t).trim()); return parts.length === n && parts.every(Boolean) ? parts : null },
  },
}

const figures = []
for (const p of papers) for (const f of p.figures) {
  const boxes = linesToBoxes(f.lines)
  if (boxes.length) figures.push({ id: p.id, figure: f.figure, prose: p.prose, texts: boxes.map(b => b.text) })
}
const distinct = [...new Set(figures.flatMap(f => f.texts))]
const aloneOut = await translateTexts(distinct.map(esc), lang)
const alone = new Map(distinct.map((t, i) => [t, aloneOut[i] == null ? null : unesc(aloneOut[i])]))

const chunks = []
for (const f of figures) for (let k = 0; k < f.texts.length; k += CHUNK) { const texts = f.texts.slice(k, k + CHUNK); if (texts.length > 1) chunks.push({ f, texts }) }
const results = {}
for (const [way, { wire, split }] of Object.entries(WAYS)) {
  const out = await translateTexts(chunks.map(c => wire(c.texts)), lang)
  results[way] = chunks.map((c, j) => {
    const strict = out[j] != null ? split(out[j], c.texts.length) : null
    const loose = !strict && out[j] != null && way === 'numbered' ? split(out[j], c.texts.length, true) : null
    return { raw: out[j], parts: strict ?? loose, tolerant: !!loose }
  })
}

const digits = s => (s.match(/\d+(?:\.\d+)?/g) ?? []).join(' ')
const stats = { figures: figures.length, boxes: figures.reduce((n, f) => n + f.texts.length, 0), chunks: chunks.length, chunkBoxes: chunks.reduce((n, c) => n + c.texts.length, 0) }
const rows = []
for (const way of Object.keys(WAYS)) {
  let split = 0, tolerant = 0, boxes = 0, remains = 0, digitBoxes = 0, digitLost = 0, repeats = 0
  results[way].forEach((r, j) => {
    const c = chunks[j]
    if (!r.parts) return
    split++; if (r.tolerant) tolerant++
    boxes += c.texts.length
    r.parts.forEach((t, i) => {
      const s = c.texts[i]
      if (/[@#]/.test(t) && !/[@#]/.test(s)) remains++
      if (digits(s)) { digitBoxes++; if (digits(t) !== digits(s)) digitLost++ }
      if (i && t === r.parts[i - 1] && s !== c.texts[i - 1]) repeats++
      if (way === 'numbered') rows.push({ id: c.f.id, figure: c.f.figure, text: s, name: isName(s, c.f.prose), alone: alone.get(s), together: t })
    })
  })
  // the same digit test on the boxes translated one by one, for a baseline
  stats[way] = { split, tolerant, boxes, remains, digitBoxes, digitLost, repeats }
}
{
  let digitBoxes = 0, digitLost = 0
  for (const c of chunks) for (const s of c.texts) { const t = alone.get(s); if (t != null && digits(s)) { digitBoxes++; if (digits(t) !== digits(s)) digitLost++ } }
  stats.alone = { digitBoxes, digitLost }
}
writeFileSync(join(root, `out/eval-join-${lang}${CHUNK === 40 ? '' : `-${CHUNK}`}.json`), JSON.stringify({ stats, rows, raw: Object.fromEntries(Object.entries(results).map(([w, r]) => [w, r.map(x => x.raw)])), chunks: chunks.map(c => ({ id: c.f.id, figure: c.f.figure, texts: c.texts })) }, null, 1))
console.log(JSON.stringify(stats, null, 1))
