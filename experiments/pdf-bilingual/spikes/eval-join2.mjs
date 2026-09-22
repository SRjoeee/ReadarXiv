// Numbered markers only (eval-join.mjs settled that line breaks give no context — 96% of their boxes come back as the
// one-by-one translation — and that one repeated marker cannot tell a dropped box from a moved one), in variants: how
// many boxes a text, and whether a figure's repeated labels (a panel grid's "Normalized counts" ×30) go once. The check
// a split has to pass is the one the extension could afford: every id once and in order, no box empty, no marker's
// remains (`@`, `#`) in a box whose source has none, no box over four times its source's length. Against the one-by-one
// translations, which production would not have, the boxes that passed are scored for a split in the wrong place: a
// box closer to its neighbour's translation than to its own. Writes out/eval-join2-<lang>.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isName, translateTexts } from '../poc-reader/mt.mjs'
import { linesToBoxes } from '../poc-reader/lib/axt/figures.mjs'
const root = new URL('..', import.meta.url).pathname
const lang = process.argv[2] ?? 'zh'
const papers = JSON.parse(readFileSync(join(root, 'out/eval-labels.json'), 'utf8'))
const toAlpha = id => { let n = id, out = ''; while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(97 + r) + out; n = (n - 1 - r) / 26 } return out }
const fromAlpha = s => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 96, 0)
const esc = s => s.replace(/@/g, '@@').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/@@/g, '@')
const wire = texts => texts.map((t, i) => (i ? ` @${toAlpha(i)}# ` : '') + esc(t)).join('')
const why = new Map()
const fail = reason => { why.set(reason, (why.get(reason) ?? 0) + 1); return null }
function split(text, sources) {
  const re = /@@|@([a-z]+)#/g, parts = []
  let last = 0, buf = '', expect = 1, m
  while ((m = re.exec(text))) {
    buf += text.slice(last, m.index); last = re.lastIndex
    if (m[0] === '@@') { buf += '@@'; continue }
    if (fromAlpha(m[1]) !== expect++) return fail('order')
    parts.push(buf); buf = ''
  }
  parts.push(buf + text.slice(last))
  if (parts.length !== sources.length) return fail(parts.length < sources.length ? 'lost' : 'extra')
  const out = parts.map(t => unesc(t).trim())
  for (const [i, t] of out.entries()) {
    const s = sources[i]
    if (!t) return fail('empty')
    if (/[@#]/.test(t) && !/[@#]/.test(s)) return fail('remains')
    if (t.length > 4 * s.length + 8) return fail('long')
  }
  return out
}
const bigrams = s => { const t = s.replace(/\s+/g, ''), out = new Map(); for (let i = 0; i < t.length - 1; i++) out.set(t.slice(i, i + 2), (out.get(t.slice(i, i + 2)) ?? 0) + 1); if (t.length === 1) out.set(t, 1); return out }
const dice = (a, b) => { const A = bigrams(a), B = bigrams(b); let n = 0, na = 0, nb = 0; for (const v of A.values()) na += v; for (const v of B.values()) nb += v; for (const [k, v] of A) n += Math.min(v, B.get(k) ?? 0); return na + nb ? (2 * n) / (na + nb) : 1 }

const figures = []
for (const p of papers) for (const f of p.figures) {
  const boxes = linesToBoxes(f.lines)
  if (boxes.length) figures.push({ id: p.id, figure: f.figure, prose: p.prose, texts: boxes.map(b => b.text) })
}
const distinct = [...new Set(figures.flatMap(f => f.texts))]
const aloneOut = await translateTexts(distinct.map(esc), lang)
const alone = new Map(distinct.map((t, i) => [t, aloneOut[i] == null ? null : unesc(aloneOut[i])]))

const VARIANTS = (process.env.VARIANTS ?? "40,40d,20d,10d").split(",").map(v => ({ chunk: Number(v.replace("d", "")), dedupe: v.endsWith("d") }))
const report = {}, allRows = {}, failures = {}
for (const v of VARIANTS) {
  const key = `${v.chunk}${v.dedupe ? '-dedupe' : ''}`
  const chunks = []
  for (const f of figures) {
    const texts = v.dedupe ? [...new Set(f.texts)] : f.texts
    for (let k = 0; k < texts.length; k += v.chunk) { const part = texts.slice(k, k + v.chunk); if (part.length > 1) chunks.push({ f, texts: part }) }
  }
  const out = await translateTexts(chunks.map(c => wire(c.texts)), lang)
  let split_ = 0, boxes = 0, moved = 0, chars = 0
  const rows = []
  chunks.forEach((c, j) => {
    chars += wire(c.texts).length
    const parts = out[j] != null ? split(out[j], c.texts) : null
    if (!parts) return
    split_++; boxes += c.texts.length
    parts.forEach((t, i) => {
      const own = alone.get(c.texts[i]) ?? ''
      const near = [c.texts[i - 1], c.texts[i + 1]].filter(s => s != null && s !== c.texts[i]).map(s => alone.get(s) ?? '')
      const best = Math.max(0, ...near.map(n => dice(t, n)))
      const isMoved = best > dice(t, own) + 0.3 && best > 0.5
      if (isMoved) moved++
      rows.push({ id: c.f.id, figure: c.f.figure, text: c.texts[i], name: isName(c.texts[i], c.f.prose), alone: own, together: t, moved: isMoved })
    })
  })
  const boxesAll = chunks.reduce((n, c) => n + c.texts.length, 0)
  report[key] = { chunks: chunks.length, split: split_, boxesAll, boxes, moved, chars, why: Object.fromEntries(why) }
  why.clear()
  failures[key] = chunks.map((c, j) => ({ texts: c.texts, out: out[j] })).filter((x, j) => out[j] != null && !split(out[j], chunks[j].texts)).slice(0, 40)
  why.clear()
  allRows[key] = rows
}
writeFileSync(join(root, `out/eval-join2-${lang}.json`), JSON.stringify({ report, rows: allRows, failures }, null, 1))
console.log(JSON.stringify(report, null, 1))
