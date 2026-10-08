// src/pdf-reader/engine/layer-proto/check.mjs
// Ported from the private prototype (readarxiv-web, exp/instant-layer at 9e56fca,
// web/prototypes/instant-layer/check.js), 2026-10-06, as the instant layer's v0: the prototype's completeness checker
// (iteration 3). Our own code, so no licence applies; the provenance is kept so that every number the prototype was
// approved on traces back to it. Unchanged in behaviour: the changes are the module paths, CJK characters written as \u
// escapes (the English gate), imports nothing uses left out, and what is named below. The prototype's own description
// follows.
//
// v0's change here: an equation number on a line with a character outside the Basic Multilingual Plane before it is
// left out where the prototype threw (checkAll, part d).
//
// The completeness checker: does the layer show everything the original shows, once? Run in the page after every unit
// is painted (main.js check=1, which score.mjs sets), from the original page's canvas, the layer's canvas (the copy,
// erased, with its crops) and what unitOps recorded (each erased box, each crop drawn), with the units' alignments
// (layer2.js prepareUnit). Four classes, each a count:
//
// (a) ink lost: the original's ink inside an erased box that the layer no longer shows (white on its canvas), and that
//     is neither the unit's own translated text (its source's words and punctuation), nor a placeholder's rendering
//     drawn elsewhere (a crop's source, an orig-text's characters), nor another painted unit's. Connected into regions,
//     each with its page, box (PDF points), the page's characters there and the unit that erased it. A kept rendering
//     (a displayed formula, a label) that was erased is lost ink by this rule.
//     (a2, reported with it) ink under text: original ink the layer still shows under its own translated text.
// (b) placeholders: each placeholder that renders something must be drawn exactly once: missing (no crop, no text, a
//     kept rendering erased, a rendering never found), duplicated (a crop drawn twice; a character of the page carried
//     by two placeholders; a placeholder drawn from its source while another's crop or text already shows it), and
//     doubled brackets (a reference's "(1)" inside the translation's own "\uFF08…\uFF09").
// (c) literal duplications: two equal runs of Latin, digits or math next to each other in a unit's drawn reading order
//     ("i.e., i.e.", "σ(y)\uFF0Cσ(y)"), each marked by whether a placeholder made it (the layer's) or the translation has it.
// (d) equation numbers: each displayed equation's number on the original page ("(1)" at its column's right edge, far
//     from the text before it) shown exactly once: in place (not erased), or in a crop, or as a placeholder's text.
import { charKey, displayTouched, nearIn } from './layer2.mjs'
import { norm, texToText } from './layer1.mjs'

const VISIBLE = new Set(['cite', 'num', 'other', 'macro', 'display', 'symbol'])
const normU = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const CJK_RE = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/

/** a PDF box [x0, y0, x1, y1] (y up) on a page's canvas, in device pixels [x0, y0, x1, y1] (y down) */
const devBox = (px, b) => {
  const [ax, ay] = px(b[0], b[3]), [bx, by] = px(b[2], b[1])
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]
}
const charBox = (c, dx = 0, dy = 0) => [c.x0 - dx, c.yb - 0.3 * c.size - dy, c.x1 + dx, c.yb + 0.85 * c.size + dy]
const fill = (mask, W, H, b, v = 1) => {
  const x0 = Math.max(0, Math.floor(b[0])), x1 = Math.min(W, Math.ceil(b[2])), y0 = Math.max(0, Math.floor(b[1])), y1 = Math.min(H, Math.ceil(b[3]))
  for (let y = y0; y < y1; y++) mask.fill(v, y * W + x0, y * W + x1)
}
const r1 = x => Math.round(x * 10) / 10

/**
 * The whole check. `placed`: main.js's placed units (each with prep, tokens, layout, blocks); `rows`: each page's
 * { left (original canvas), right (layer canvas) }; `pxOf(pg)`: PDF to device pixels; `toPdf(pg, x, y)` back;
 * `chars2`: each page's characters; `audit`: unitOps' records; `cols(pg)`: the page's columns [[x0, x1]…];
 * `cellRects(pg)`: table cells' rectangles (no equation number there). `named`: the babel names drawn in the target's
 * words (run.mjs paintNames), whose characters are their own text, accounted as a unit's.
 */
export function checkAll({ N, placed, rows, pxOf, toPdf, chars2, audit, cols, cellRects, named = [] }) {
  const units = placed.filter(p => p.prep && p.layout)
  const crops = audit.filter(a => a.what === 'crop')
  const erases = audit.filter(a => a.what === 'erase')
  const keyOf = (pg, c) => `${pg}|${c.item}|${c.k}`
  const charByKey = new Map()
  for (let pg = 1; pg <= N; pg++) for (const c of chars2[pg - 1] ?? []) charByKey.set(keyOf(pg, c), { ...c, page: pg })
  // the page characters inside a crop's source box (what the crop shows)
  const charsInBox = (pg, b) => (chars2[pg - 1] ?? []).filter(c => /\S/.test(c.ch) && (c.x0 + c.x1) / 2 >= b[0] && (c.x0 + c.x1) / 2 <= b[2] && c.yb + 0.3 * c.size >= b[1] && c.yb + 0.3 * c.size <= b[3]).map(c => ({ ...c, page: pg }))

  // ---- each unit's placeholders and characters
  const cat = new Map() // char key -> 'acc' | 'keep' | 'orphan' | 'undrawn'
  const rank = { keep: 3, acc: 2, undrawn: 1, orphan: 0 }
  const setCat = (key, v) => { const o = cat.get(key); if (o === undefined || rank[v] > rank[o]) cat.set(key, v) }
  const carriers = new Map() // char key -> [carrier]
  const carry = (key, who) => { if (!carriers.has(key)) carriers.set(key, []); carriers.get(key).push(who) }
  const kept = [] // { unit, k, chars } a rendering that must stay as the original's
  const B = { missing: [], duplicated: [], brackets: [], unlocated: [], clipped: [] }
  const C = []
  for (const p of units) {
    const prep = p.prep
    const drawnTok = new Set(p.layout.lines.flatMap(l => l.items.map(it => it.t)))
    const res = [...prep.values()].filter(r => r && r.k !== undefined)
    const gapRes = new Map()
    for (const r of res) if (r.gap) gapRes.set(r.gap, r)
    const cropsOf = r => crops.filter(a => a.unit === p.id && a.k === r.k)
    const tokOf = r => p.tokens.filter(t => t.k === r.k && (t.s || t.crop))
    const drawnOf = r => (r.mode === 'crop' ? cropsOf(r).length : tokOf(r).some(t => drawnTok.has(t)) ? 1 : 0)
    // the characters of the unit, each by what became of it, by the checker's own rules (not the layer's account of
    // itself): its text (the source's words, punctuation, a gap's piece that is the source's or the translation's own
    // text or that a drawn placeholder shows), a placeholder's rendering drawn elsewhere (only where it was drawn), kept
    // (a kept line, a label, a kept placeholder's rendering), or an orphan (a rendering no placeholder took)
    const usedBy = new Map()
    for (const r of res) if (r.gap) for (const c of r.gap.chars) if (!c.sep && !c.space) usedBy.set(charKey(c), r)
    for (const [key, v0] of categoriesOf(prep, p.unit, chars2)) {
      let v = v0
      const r = usedBy.get(key)
      if (v === 'acc' && r && (r.mode === 'crop' || r.mode === 'orig-text') && !drawnOf(r)) v = 'undrawn'
      setCat(key, v)
    }
    // (a label set in the target's name is drawn, its ink the unit's text, wherever its characters stand — a layout
    // file's label box may lie before the unit's lines: run.mjs labelInTarget)
    if (prep.label?.drawn) for (const c of prep.label.chars) setCat(charKey(c), 'acc')
    else if (prep.label?.chars?.length) kept.push({ unit: p.id, k: 'label', chars: prep.label.chars })
    // what each placeholder draws, once
    for (const r of res) {
      if (!VISIBLE.has(r.cls)) continue
      const where = { unit: p.id, kind: p.unit.kind, k: r.k, src: r.src.slice(0, 80), mode: r.mode, page: p.pages[0] }
      if (r.mode === 'none') {
        // a rendering never found on the page: a display there may still stand outside the unit's lines, untouched
        if (r.cls === 'display') B.unlocated.push(where)
        else if (r.text !== ' ') B.missing.push({ ...where, why: 'not found, nothing drawn' })
        continue
      }
      if (r.mode === 'kept') {
        if (r.gap) kept.push({ unit: p.id, k: r.k, chars: r.gap.chars.filter(c => !c.sep && !c.space), where })
        else if (r.cls === 'symbol') {
          // a leading mark kept outside the unit: shown by the original, before the first line
        }
        continue
      }
      const n = drawnOf(r)
      // a citation not found, drawn as its stand-in: its numbers are lost
      if (r.cls === 'cite' && r.mode === 'source') B.missing.push({ ...where, why: 'citation not found: drawn as [·]' })
      // not drawn because the unit's text overflowed its lines (the fixed box's clipping, scored as clipped characters) is
      // counted apart from what the layer lost
      if (n === 0 && (r.text ?? '') !== '' || n === 0 && r.mode === 'crop') (p.layout.clipped ? B.clipped : B.missing).push({ ...where, why: r.mode === 'crop' ? 'crop not drawn (clipped)' : 'text not drawn (clipped)', cut: !!p.cut })
      else if (n === 0) B.missing.push({ ...where, why: 'nothing drawn: no text, rendering not found' })
      if (r.mode === 'crop' && n > 1) B.duplicated.push({ ...where, why: `crop drawn ${n} times` })
      if (r.mode === 'crop') for (const a of cropsOf(r)) for (const c of charsInBox(a.srcPage, a.src)) carry(keyOf(a.srcPage, c), { unit: p.id, k: r.k, mode: 'crop', text: '' })
      if (r.mode === 'orig-text' && n) for (const c of r.gap.chars) if (!c.sep && !c.space && /\S/.test(c.ch)) carry(charKey(c), { unit: p.id, k: r.k, mode: 'orig-text' })
    }
    // a placeholder drawn from its source, whose rendering another placeholder's crop or text already shows
    const shownBy = r => (r.mode === 'crop' ? cropsOf(r).flatMap(a => charsInBox(a.srcPage, a.src)) : r.mode === 'orig-text' && r.gap ? r.gap.chars.filter(c => !c.sep) : []).sort((a, b) => a.yb !== b.yb ? b.yb - a.yb : a.x0 - b.x0).map(c => c.ch).join('')
    for (const r of res) {
      if (!VISIBLE.has(r.cls) || (r.mode !== 'source' && r.mode !== 'symbol') || !drawnOf(r)) continue
      const mine = normU(r.text ?? texToText(r.src))
      if (mine.length < 2) continue
      for (const q of res) {
        if (q === r || (q.mode !== 'crop' && q.mode !== 'orig-text')) continue
        const shown = normU(shownBy(q))
        if (shown.includes(mine) && !normU(texToText(q.src)).includes(mine)) B.duplicated.push({ unit: p.id, kind: p.unit.kind, k: r.k, src: r.src.slice(0, 80), mode: r.mode, page: p.pages[0], why: `drawn from its source while ${q.mode} ${q.k} (${q.src.slice(0, 40)}) shows "${shownBy(q)}"` })
      }
    }
    // the unit's drawn reading order: its text, each crop as the page's characters it shows, each placeholder's text
    const seq = []
    for (const l of p.layout.lines) for (const it of l.items) {
      const t = it.t
      if (t.space) seq.push({ s: ' ', ph: false })
      else if (t.crop) {
        const a = crops.find(a => a.unit === p.id && a.k === t.crop.k)
        const s = a ? charsInBox(a.srcPage, a.src).sort((x, y) => x.x0 - y.x0).map(c => c.ch).join('') : (t.crop.text ?? '')
        seq.push({ s, ph: true, k: t.crop.k, crop: true })
      } else if (t.s) seq.push({ s: t.s, ph: t.k !== undefined, k: t.k })
    }
    // doubled brackets: a placeholder's own "(…)" inside the translation's brackets
    seq.forEach((x, i) => {
      if (!x.ph || !/^\s*[([]/.test(x.s)) return
      const prev = seq.slice(0, i).reverse().find(y => /\S/.test(y.s) && y.k !== x.k)
      const next = seq.slice(i + 1).find(y => /\S/.test(y.s) && y.k !== x.k)
      const own = seq.filter(y => y.k === x.k).map(y => y.s).join('')
      // brackets of a kind: round in round, square in square ("\uFF08[32]\uFF09" is a citation in the translation's brackets, as
      // the compiled version sets it too)
      const kind = /^\s*\(/.test(x.s) ? 'round' : 'square'
      const opens = kind === 'round' ? /[\uFF08(]\s*$/ : /[\uFF3B[]\s*$/, closes = kind === 'round' ? /^\s*[\uFF09)]/ : /^\s*[\uFF3D\]]/
      if (prev && !prev.ph && opens.test(prev.s) && /[)\]]\s*$/.test(own) && next && !next.ph && closes.test(next.s)) {
        const r = res.find(r => r.k === x.k)
        if (!B.brackets.some(b => b.unit === p.id && b.k === x.k)) B.brackets.push({ unit: p.id, kind: p.unit.kind, k: x.k, src: r?.src.slice(0, 60), mode: r?.mode, page: p.pages[0], shown: `${prev.s.slice(-2)}${own}${next.s.slice(0, 2)}` })
      }
    })
    // literal duplications: runs of Latin, digits or math, compared with the next such run when only spaces or
    // punctuation stand between them
    const runs = []
    let cur = null
    seq.forEach((x, i) => {
      for (const ch of x.s) {
        const sep = /\s/.test(ch) || CJK_RE.test(ch)
        if (sep) { if (cur) { runs.push(cur); cur = null } ; if (CJK_RE.test(ch) && !/[\uFF0C\u3001\u3002\uFF1B\uFF1A\uFF08\uFF09,;:]/.test(ch)) runs.push({ cjk: true }) ; continue }
        if (!cur) cur = { s: '', ph: false, at: i }
        cur.s += ch
        cur.ph ||= x.ph
      }
      if (x.crop && cur) { runs.push(cur); cur = null }
    })
    if (cur) runs.push(cur)
    for (let i = 0; i + 1 < runs.length; i++) {
      const a = runs[i], b = runs[i + 1]
      if (a.cjk || b.cjk) continue
      const na = normU(a.s.replace(/^[(\uFF08[]+|[)\uFF09\],.;:\uFF0C\u3002]+$/g, '')), nb = normU(b.s.replace(/^[(\uFF08[]+|[)\uFF09\],.;:\uFF0C\u3002]+$/g, ''))
      if (na.length < 2 || na !== nb) continue
      // the original's own ("to d_k, d_k and d_v dimensions"), the translation's (a placeholder it repeats), or the
      // layer's (a rendering drawn twice)
      const pageText = normU((prep.uc ?? []).filter(c => !c.sep).map(c => c.ch).join(''))
      const srcOf = run => seq[run.at]?.k !== undefined ? res.find(r => r.k === seq[run.at].k)?.src : undefined
      const by = !(a.ph || b.ph) ? 'translation' : pageText.includes(na + na) ? 'original' : a.ph && b.ph && srcOf(a) !== undefined && srcOf(a) === srcOf(b) ? 'translation' : 'layer'
      C.push({ unit: p.id, kind: p.unit.kind, page: p.pages[0], text: `${a.s} ${b.s}`, by })
    }
  }
  // (a babel name drawn in the target's word: its characters its own text, wherever they stand)
  for (const n of named) for (const c of n.chars) setCat(keyOf(n.page, c), 'acc')
  // a page character carried by two placeholders' drawings is drawn twice
  const seen = new Set()
  for (const [key, who] of carriers) {
    if (who.length < 2) continue
    const id = who.map(w => `${w.unit}:${w.k}`).sort().join(',')
    if (seen.has(id)) continue
    seen.add(id)
    const c = charByKey.get(key)
    B.duplicated.push({ unit: who[0].unit, k: who.map(w => w.k).join('+'), page: c?.page, mode: who.map(w => w.mode).join('+'), why: `a page character ("${c?.ch}") carried by ${who.map(w => `${w.unit}:${w.k} ${w.mode}`).join(' and ')}` })
  }

  // ---- the pixels, page by page
  const A = { regions: [], px: 0 }, A2 = { regions: [], px: 0 }, A3 = { regions: [] }, D = { found: 0, ok: 0, issues: [] }
  for (let pg = 1; pg <= N; pg++) {
    const row = rows[pg - 1]
    if (!row?.base) continue
    const W = row.left.width, H = row.left.height
    const px = pxOf(pg)
    const O = row.left.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data
    const Ly = row.right.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data
    const ink = i => O[i * 4] + O[i * 4 + 1] + O[i * 4 + 2] < 540
    const white = i => Ly[i * 4] + Ly[i * 4 + 1] + Ly[i * 4 + 2] > 700
    const layerInk = i => Ly[i * 4] + Ly[i * 4 + 1] + Ly[i * 4 + 2] < 540
    const erased = new Uint8Array(W * H)
    const pageErases = erases.filter(e => e.page === pg)
    for (const e of pageErases) fill(erased, W, H, e.box)
    const acc = new Uint8Array(W * H)
    // the accounted characters' boxes. A character's place inside its item is an estimate (the item's width shared in
    // Times' proportions), so an item whose characters are all accounted is accounted whole (its width is exact), and
    // a space between two accounted characters of an item is accounted with them
    const items = new Map()
    for (const c of chars2[pg - 1] ?? []) { if (!items.has(c.item)) items.set(c.item, []); items.get(c.item).push(c) }
    for (const cs of items.values()) {
      const vis = cs.filter(c => /\S/.test(c.ch))
      const cats = vis.map(c => cat.get(keyOf(pg, c)))
      if (vis.length && cats.every(v => v === 'acc')) {
        const size = Math.max(...cs.map(c => c.size))
        fill(acc, W, H, devBox(px, [cs[0].x0 - 0.8, cs[0].yb - 0.3 * size - 0.5, cs.at(-1).x1 + 0.8, cs[0].yb + 0.85 * size + 0.5]))
        continue
      }
      cs.forEach((c, i) => {
        const v = cat.get(keyOf(pg, c))
        const bridged = !/\S/.test(c.ch) && cat.get(keyOf(pg, cs[i - 1] ?? {})) === 'acc' && cat.get(keyOf(pg, cs[i + 1] ?? {})) === 'acc'
        if (v === 'acc' || bridged) fill(acc, W, H, devBox(px, charBox(c, 0.8, 0.5)))
      })
    }
    for (const a of crops) if (a.srcPage === pg) fill(acc, W, H, devBox(px, [a.src[0] - 0.3, a.src[1] - 0.3, a.src[2] + 0.3, a.src[3] + 0.3]))
    // crops drawn on this page: their ink is the layer's own
    const cropDst = new Uint8Array(W * H)
    for (const a of crops) if (a.page === pg) fill(cropDst, W, H, a.dst)
    // (a) lost: original ink, erased, white on the layer, not accounted for
    const lost = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) if (erased[i] && !acc[i] && ink(i) && white(i)) lost[i] = 1
    const pageChars = (chars2[pg - 1] ?? []).map(c => ({ ...c, page: pg }))
    const describe = (rg, why) => {
      // back to PDF points
      const [ax, ay] = toPdf(pg, rg.x0, rg.y1), [bx, by] = toPdf(pg, rg.x1, rg.y0)
      const box = [r1(Math.min(ax, bx)), r1(Math.min(ay, by)), r1(Math.max(ax, bx)), r1(Math.max(ay, by))]
      const inside = pageChars.filter(c => /\S/.test(c.ch) && c.x1 > box[0] && c.x0 < box[2] && c.yb + 0.85 * c.size > box[1] && c.yb - 0.3 * c.size < box[3]).sort((a, b) => b.yb - a.yb || a.x0 - b.x0)
      const cats = {}
      for (const c of inside) { const v = cat.get(keyOf(pg, c)) ?? 'none'; cats[v] = (cats[v] ?? 0) + 1 }
      const cx = (rg.x0 + rg.x1) / 2, cy = (rg.y0 + rg.y1) / 2
      const by2 = [...new Set(pageErases.filter(e => e.box[0] <= cx && e.box[2] >= cx && e.box[1] <= cy && e.box[3] >= cy).map(e => e.unit))]
      return { page: pg, box, px: rg.n, text: inside.map(c => c.ch).join('').slice(0, 60), cats, erasedBy: by2, why }
    }
    for (const rg of regionsOf(lost, W, H, 3, 12)) { A.regions.push(describe(rg)); A.px += rg.n }
    // (a3) the original's ink still shown inside erased boxes (kept or put back): a kept formula or label, as meant; a
    // remnant where it is the translated text's own (punctuation, a word the alignment left)
    const shownIn = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) if (erased[i] && !cropDst[i] && ink(i) && layerInk(i)) shownIn[i] = 1
    for (const rg of regionsOf(shownIn, W, H, 3, 6)) {
      const d = describe(rg)
      if (!d.cats.keep || Object.keys(d.cats).length > 1) A3.regions.push(d)
    }
    // (a2) ink under the translation's text: the layer's own canvas ink inside its text's boxes (not a crop's)
    const under = new Uint8Array(W * H)
    for (const p of units) for (const l of p.layout.lines) {
      if (l.page !== pg) continue
      const f = p.layout.f
      for (const it of l.items) {
        if (it.t.crop || it.t.space || !it.t.s) continue
        const b = devBox(px, [it.x + 0.3, l.baseline - 0.15 * f, it.x + it.w - 0.3, l.baseline + 0.7 * f])
        const x0 = Math.max(0, Math.floor(b[0])), x1 = Math.min(W, Math.ceil(b[2])), y0 = Math.max(0, Math.floor(b[1])), y1 = Math.min(H, Math.ceil(b[3]))
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x; if (!cropDst[i] && layerInk(i)) under[i] = 1 }
      }
    }
    for (const rg of regionsOf(under, W, H, 3, 12)) { A2.regions.push(describe(rg)); A2.px += rg.n }
    // (b) a kept rendering must still show: most of its original ink present on the layer
    for (const kp of kept.filter(x => x.chars.some(c => c.page === pg))) {
      let total = 0, shown = 0
      for (const c of kp.chars) {
        if (c.page !== pg) continue
        const b = devBox(px, charBox(c))
        for (let y = Math.max(0, Math.floor(b[1])); y < Math.min(H, Math.ceil(b[3])); y++) for (let x = Math.max(0, Math.floor(b[0])); x < Math.min(W, Math.ceil(b[2])); x++) {
          const i = y * W + x
          if (!ink(i)) continue
          total++
          if (layerInk(i)) shown++
        }
      }
      if (total && shown < 0.5 * total) B.missing.push({ ...(kp.where ?? { unit: kp.unit, k: kp.k, mode: 'label' }), page: pg, why: `kept rendering erased (${shown}/${total} ink px shown)`, text: kp.chars.map(c => c.ch).join('').slice(0, 40) })
    }
    // (d) displayed equations' numbers
    const C2 = cols(pg) ?? []
    const cells = cellRects(pg) ?? []
    const lines = []
    for (const c of pageChars.filter(c => /\S/.test(c.ch)).sort((a, b) => a.x0 - b.x0)) {
      const l = lines.find(l => Math.abs(l.yb - c.yb) < 0.3 * Math.max(l.size, c.size))
      if (l) l.chars.push(c)
      else lines.push({ yb: c.yb, size: c.size, chars: [c] })
    }
    for (const l of lines) {
      const cs = l.chars.sort((a, b) => a.x0 - b.x0)
      const s = cs.map(c => c.ch).join('')
      for (const m of s.matchAll(/\((\d{1,3}(?:\.\d{1,3})?[a-z]?)\)/g)) {
        const run = cs.slice(m.index, m.index + m[0].length)
        // (v0: a line with a character outside the Basic Multilingual Plane before it puts the match's string offset past
        // its characters; the prototype threw there, 2307.16209 page 10, and such a number is left out)
        if (run.map(c => c.ch).join('') !== m[0]) continue
        const x0 = run[0].x0, x1 = run.at(-1).x1
        const col = C2.find(([a, z]) => x1 <= z + 6 && x1 >= a)
        if (!col || Math.abs(col[1] - x1) > 6) continue
        const before = cs.slice(0, m.index).filter(c => c.x1 > col[0] - 1)
        if (before.length && x0 - before.at(-1).x1 < 8) continue
        if (cells.some(r => x0 >= r[1] - 1 && x1 <= r[3] + 1 && l.yb >= r[2] - 1 && l.yb <= r[4] + 1)) continue
        D.found++
        const box = [x0, l.yb - 0.25 * l.size, x1, l.yb + 0.8 * l.size]
        const db = devBox(px, box)
        let total = 0, shown = 0, er = 0
        for (let y = Math.max(0, Math.floor(db[1])); y < Math.min(H, Math.ceil(db[3])); y++) for (let x = Math.max(0, Math.floor(db[0])); x < Math.min(W, Math.ceil(db[2])); x++) {
          const i = y * W + x
          if (!ink(i)) continue
          total++
          if (layerInk(i) && !cropDst[i]) shown++
          if (erased[i]) er++
        }
        const inPlace = total && shown >= 0.6 * total ? 1 : 0
        const cx = (x0 + x1) / 2, cy = l.yb + 0.3 * l.size
        const inCrops = crops.filter(a => a.srcPage === pg && a.src[0] <= cx && a.src[2] >= cx && a.src[1] <= cy && a.src[3] >= cy).length
        const keys = run.map(c => keyOf(pg, c))
        const asText = new Set(keys.flatMap(key => (carriers.get(key) ?? []).filter(w => w.mode === 'orig-text').map(w => `${w.unit}:${w.k}`))).size
        const n = inPlace + inCrops + asText
        if (n === 1) D.ok++
        else D.issues.push({ page: pg, number: m[0], at: [r1(x0), r1(l.yb)], shown: n, inPlace, inCrops, asText, erasedPx: er, inkPx: total })
      }
    }
  }
  return {
    a: { regions: A.regions.length, px: A.px, list: A.regions },
    a2: { regions: A2.regions.length, px: A2.px, list: A2.regions },
    a3: { regions: A3.regions.length, list: A3.regions },
    b: { missing: B.missing.length, duplicated: B.duplicated.length, brackets: B.brackets.length, unlocated: B.unlocated.length, clipped: B.clipped.length, list: B },
    c: { total: C.length, layer: C.filter(x => x.by === 'layer').length, translation: C.filter(x => x.by === 'translation').length, original: C.filter(x => x.by === 'original').length, list: C },
    d: { found: D.found, ok: D.ok, wrong: D.issues.length, list: D.issues },
  }
}

const normU2 = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
/** the checker's account of a unit's characters (by charKey): 'acc', 'keep' or 'orphan' (see checkAll) */
function categoriesOf(prep, unit, chars2) {
  const uc = prep.uc ?? []
  const cat = new Map()
  const res = [...prep.values()].filter(r => r && r.k !== undefined)
  const used = new Map()
  for (const r of res) if (r.gap) for (const c of r.gap.chars) if (!c.sep && !c.space) used.set(charKey(c), r)
  const keepSet = new Set(prep.keep ?? [])
  const label = new Set((prep.label && !prep.label.drawn ? prep.label.chars : []).map(charKey))
  const inGap = new Set()
  for (const g of prep.gaps ?? []) for (const c of g.chars) if (!c.sep && !c.space) inGap.add(charKey(c))
  const srcLetters = norm(unit.src ?? '')
  const trLetters = norm((unit.pieces ?? []).filter(p => p.t === 'text').map(p => p.s).join(' ') + ' ' + res.map(r => r.text ?? '').join(' '))
  const drawn = `|${res.map(r => {
    if (r.mode === 'crop') {
      const [x0, y0, x1, y1] = r.crop
      return normU2((chars2[r.page - 1] ?? []).filter(c => (c.x0 + c.x1) / 2 >= x0 && (c.x0 + c.x1) / 2 <= x1 && c.yb >= y0 && c.yb <= y1).map(c => c.ch).join('')) + '|' + normU2(r.text)
    }
    return normU2(r.text)
  }).join('|')}|`
  const left = []
  let run = null
  for (const c of uc) {
    const k = c.sep || c.space ? null : charKey(c)
    if (k && inGap.has(k) && !used.has(k) && /\S/.test(c.ch)) { if (!run) { run = []; left.push(run) } run.push(c) }
    else if (k || c.sep) run = null
  }
  const missed = new Set()
  for (const piece of left) {
    const text = piece.map(c => c.ch).join('')
    const letters = norm(text), shown = normU2(text)
    const long = letters.replace(/\d/g, '').length >= 4
    if (!/[\p{L}\p{N}]/u.test(text) || (long && (nearIn(letters, srcLetters, unit.src ?? '') || trLetters.includes(letters))) || (shown && drawn.includes(shown))) for (const c of piece) missed.add(charKey(c))
  }
  // a located displayed formula's lines are kept, whatever the alignment says of their words (a word the source has
  // too, aligned to the formula, is still the formula's glyph)
  const display = displayTouched(prep, uc)
  for (const c of uc) {
    if (c.sep || c.space || !/\S/.test(c.ch)) continue
    const k = charKey(c)
    if (keepSet.has(`${c.page}|${c.rect.join()}`) || label.has(k) || display.has(`${c.page}|${c.rect.join()}`)) cat.set(k, 'keep')
    else if (used.has(k)) cat.set(k, used.get(k).mode === 'kept' ? 'keep' : used.get(k).mode === 'crop' || used.get(k).mode === 'orig-text' ? 'acc' : 'orphan')
    else if (inGap.has(k)) cat.set(k, missed.has(k) ? 'acc' : 'orphan')
    else cat.set(k, 'acc')
  }
  return cat
}

/** a mask's connected regions on a grid of `cell` device pixels (cells within two of each other join), each
 *  { x0, y0, x1, y1, n } in device pixels with n set pixels; those under `min` pixels left out */
function regionsOf(mask, W, H, cell, min) {
  const gw = Math.ceil(W / cell), gh = Math.ceil(H / cell)
  const cnt = new Uint32Array(gw * gh)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) cnt[Math.floor(y / cell) * gw + Math.floor(x / cell)]++
  const lab = new Int32Array(gw * gh).fill(-1)
  const out = []
  for (let i = 0; i < gw * gh; i++) {
    if (!cnt[i] || lab[i] >= 0) continue
    const rg = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, n: 0 }
    const stack = [i]
    lab[i] = out.length
    while (stack.length) {
      const j = stack.pop()
      const gx = j % gw, gy = Math.floor(j / gw)
      rg.n += cnt[j]
      rg.x0 = Math.min(rg.x0, gx * cell); rg.y0 = Math.min(rg.y0, gy * cell); rg.x1 = Math.max(rg.x1, (gx + 1) * cell); rg.y1 = Math.max(rg.y1, (gy + 1) * cell)
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = gx + dx, ny = gy + dy
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
        const q = ny * gw + nx
        if (cnt[q] && lab[q] < 0) { lab[q] = out.length; stack.push(q) }
      }
    }
    out.push(rg)
  }
  return out.filter(r => r.n >= min)
}
