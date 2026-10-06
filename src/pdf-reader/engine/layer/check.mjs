// The instant layer's completeness checker (Plan 8b, Task 12; the instant layer's spec §5): what the gate asks of every
// page the layer draws. A unit the layer draws must show everything the original showed there, once. This module checks it
// from the outside, over what was drawn, independently of the net that kept the layer from drawing a failing unit
// (net.mjs): the pixels the copy lost (lostInk), and the laid units' data (checkPage).
//
// The gate and its test load it; the reader never does (tests/pdf-reader/layer-entry.test.ts walks the entry's imports).
// It imports nothing, so that the gate can measure any branch's engine with this one checker: the placeholder flags it
// reads are the layout file's (layout/file.mjs PH_FLAG), written again here. Pure: no DOM, no clock. An original module
// (no port statement).

/** ink: a luminance below this, over white; paper: one of PAPER or more (a grey between is a trace, neither) */
export const INK = 160
export const PAPER = 232
// layout/file.mjs PH_FLAG's
const NUMBERED = 2, EMPTY = 16, LOST = 32
/** an erase may meet a kept rendering by this much, in PDF units, across and up (net.mjs ERASE_SLACK) */
const SLACK = 0.5
/** of a line's size: what a character may stand past its slot (a closing mark's blank half hangs in the margin) */
const PAST = 0.5
/** the longest run, in atoms, a duplication is looked for at */
const RUN_MAX = 4

const OPENS = new Map([['(', 'round'], ['（', 'round'], ['[', 'square'], ['［', 'square']])
const CLOSES = new Map([[')', 'round'], ['）', 'round'], [']', 'square'], ['］', 'square']])
/** a run of Latin letters or digits: an atom of a duplication (a crop is an atom of its own) */
const ATOM = /[\p{Script=Latin}\p{Nd}]+/gu

/** a pixel's luminance, over white where it is not opaque */
function lum(a, i) {
  const l = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2], alpha = a[i + 3]
  return alpha === 255 ? l : 255 - (alpha / 255) * (255 - l)
}

/**
 * The original's ink the copy shows as paper where no drawn unit accounts for it: 8-connected regions of more than `min`
 * pixels, the largest first, each with its box (x0, y0, x1, y1 in device pixels, the end exclusive)
 */
export function lostInk({ w, h, orig, copy, accounted, min, page = 0 }) {
  const n = w * h
  const m = new Uint8Array(n)
  let any = false
  for (let i = 0; i < n; i++) {
    if (accounted[i] || lum(orig, 4 * i) >= INK || lum(copy, 4 * i) < PAPER) continue
    m[i] = 1
    any = true
  }
  if (!any) return []
  const out = []
  const stack = new Int32Array(n)
  for (let s = 0; s < n; s++) {
    if (m[s] !== 1) continue
    let top = 0, px = 0, x0 = w, y0 = h, x1 = -1, y1 = -1
    stack[top++] = s
    m[s] = 2
    while (top) {
      const i = stack[--top], x = i % w, y = (i - x) / w
      px++
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          const j = yy * w + xx
          if (m[j] === 1) { m[j] = 2; stack[top++] = j }
        }
      }
    }
    if (px > min) out.push({ page, box: [x0, y0, x1 + 1, y1 + 1], px })
  }
  return out.sort((a, b) => b.px - a.px || a.box[1] - b.box[1] || a.box[0] - b.box[0])
}

const visible = row => (row.flags & (EMPTY | LOST)) === 0
/** whether every segment of a placeholder's row is on the page */
function allOn(row, page) {
  const s = row?.segs
  if (!s || s.length < 6) return false
  for (let o = 0; o + 5 < s.length; o += 6) if (s[o] !== page) return false
  return true
}
/** the unit's erase rectangles on the page, as drawUnit gives them (x0, y0, x1, y1, stride 4) */
function eraseOn(unit, page) {
  const out = []
  for (let i = 0; i < unit.erase.length; i++) if (unit.lines[8 * i] === page) for (const v of unit.erase[i]) out.push(v)
  return out
}
/** a rendering's own text where it can be known: page text's, else the layout's own (Task 6b), else an equation
 *  reference's '(…)' (amsmath's \eqref), else null */
function renderingOf(it, row) {
  if (it.kind === 'page-text') return it.text ?? null
  if (typeof row?.text === 'string' && row.text.length) return row.text
  return row?.kind === 'eqref' ? '(…)' : null
}
const atomsOf = s => (typeof s === 'string' ? s.normalize('NFKC').match(ATOM) ?? [] : [])
/** each run of up to RUN_MAX atoms followed at once by itself, counted by the run */
function doubledRuns(atoms) {
  const out = new Map()
  for (let L = 1; L <= RUN_MAX; L++) {
    for (let i = 0; i + 2 * L <= atoms.length; i++) {
      let same = true
      for (let q = 0; same && q < L; q++) same = atoms[i + q] === atoms[i + L + q]
      if (!same) continue
      const key = `${L}\u0000${atoms.slice(i, i + L).join('\u0000')}`
      out.set(key, (out.get(key) ?? 0) + 1)
    }
  }
  return out
}

/** the data-level checks of spec §5 over a page's laid units (check.d.mts) */
export function checkPage(file, page, laid, tr) {
  const out = { missing: [], twice: [], brackets: [], duplicated: [], numbers: { shown: 0, total: 0 }, clipped: 0 }
  const drawn = laid.filter(u => u?.fit)
  const byId = new Map(drawn.map(u => [u.id, u]))
  const view = file.view(page)
  const erased = []
  for (const u of drawn) {
    const unit = file.unit(u.id)
    if (!unit) continue
    erased.push(...eraseOn(unit, page))

    // every visible placeholder whose ink starts on the page, drawn exactly once
    const times = new Map()
    for (const line of u.lines) for (const it of line.items) {
      if (it.kind === 'text' || it.ph === undefined) continue
      if (it.kind === 'crop' && !allOn(unit.ph.get(it.ph), line.page)) continue
      times.set(it.ph, (times.get(it.ph) ?? 0) + 1)
    }
    for (const [k, mode] of u.drawn ?? []) if (mode === 'kept') times.set(k, (times.get(k) ?? 0) + 1)
    for (const [k, row] of unit.ph) {
      if (!visible(row) || row.segs.length < 6 || row.segs[0] !== page) continue
      const n = times.get(k) ?? 0
      if (n === 0) out.missing.push(k)
      else if (n > 1) out.twice.push(k)
    }

    // the unit's drawn order: each item's text (a crop's rendering where it is known), its place on this page
    const seq = []
    for (const line of u.lines) for (const it of line.items) {
      const row = it.ph === undefined ? null : unit.ph.get(it.ph)
      const text = it.kind === 'crop' ? renderingOf(it, row) : it.text ?? ''
      seq.push({ it, row, text, here: line.page === page, line })
    }
    // the translation's own brackets as drawn (its text items'; a rendering's brackets are its own and pair with none),
    // each with its partner: a close pairs with the innermost open where that is of its kind, else with none
    const chars = []
    seq.forEach((e, q) => { if (e.it.kind === 'text') for (const ch of e.text) if (!/\s/.test(ch)) chars.push({ q, ch }) })
    const partner = new Map(), stack = []
    chars.forEach((c, j) => {
      if (OPENS.has(c.ch)) { stack.push(j); partner.set(j, null) }
      else if (CLOSES.has(c.ch)) {
        const top = stack[stack.length - 1]
        if (top !== undefined && OPENS.get(chars[top].ch) === CLOSES.get(c.ch)) { stack.pop(); partner.set(j, top); partner.set(top, j) }
        else partner.set(j, null)
      }
    })
    /** the drawn character next to an item, white space aside (its index in chars), or null where none, or where another
     *  rendering stands between */
    const nearest = (q, dir) => {
      for (let p = q + dir; p >= 0 && p < seq.length; p += dir) {
        if (seq[p].it.kind !== 'text') return null
        if (!/\S/.test(seq[p].text)) continue
        return dir < 0 ? chars.findLastIndex(c => c.q === p) : chars.findIndex(c => c.q === p)
      }
      return null
    }
    // a rendering's own bracket repeated by the translation's beside it, where the translation leaves that one unmatched or
    // pairs it with one right on the rendering's other side (a pair of its own around the rendering alone); one the
    // translation matches further off is nesting: '(or (3.1))'
    const alone = (x, y) => partner.get(x) === null || (y !== null && partner.get(x) === y)
    seq.forEach((e, q) => {
      if (!e.here || e.it.ph === undefined || e.it.kind === 'text') return
      const r = renderingOf(e.it, e.row)
      if (!r) return
      const b = nearest(q, -1), a = nearest(q, 1)
      const open = b !== null && OPENS.get(chars[b].ch), close = a !== null && CLOSES.get(chars[a].ch)
      if ((open && open === OPENS.get(r[0]) && alone(b, a)) || (close && close === CLOSES.get(r[r.length - 1]) && alone(a, b))) out.brackets.push(e.it.ph)
    })

    // runs drawn twice in a row that the translation does not write twice in a row
    const drawnAtoms = []
    for (const e of seq) {
      if (!e.here) continue
      if (e.it.kind === 'crop') drawnAtoms.push(`\u0001${e.it.ph}`)
      else drawnAtoms.push(...atomsOf(e.it.text))
    }
    const pageTextOf = new Map()
    for (const e of seq) if (e.it.kind === 'page-text' && !pageTextOf.has(e.it.ph)) pageTextOf.set(e.it.ph, e.it.text)
    const trAtoms = []
    for (const p of tr.get(u.id)?.pieces ?? []) {
      if (p[0] === 0) trAtoms.push(...atomsOf(p[1]))
      else if (p[0] === 1) {
        const mode = u.drawn?.get(p[1])
        if (mode === 'crop') trAtoms.push(`\u0001${p[1]}`)
        else if (mode === 'page-text') trAtoms.push(...atomsOf(pageTextOf.get(p[1])))
      }
    }
    const own = doubledRuns(trAtoms)
    for (const [key, n] of doubledRuns(drawnAtoms)) for (let q = 0; q < n - (own.get(key) ?? 0); q++) out.duplicated.push(u.id)

    // characters past their line's slot, or off the page
    for (const line of u.lines) {
      if (line.page !== page) continue
      const past = PAST * line.size
      const off = line.baseline < view[1] || line.baseline > view[3]
      for (const it of line.items) {
        if (!off && it.x >= line.x0 - past && it.x + it.w <= line.x1 + past && it.x >= view[0] && it.x + it.w <= view[2]) continue
        out.clipped += it.kind === 'crop' ? 1 : [...(it.text ?? '')].filter(c => /\S/.test(c)).length
      }
    }
  }

  // equation numbers: every numbered display of a located unit on the page, shown once in place
  const meets = s => {
    for (let e = 0; e + 3 < erased.length; e += 4) {
      const w = Math.min(erased[e + 2], s[2]) - Math.max(erased[e], s[0]), h = Math.min(erased[e + 3], s[3]) - Math.max(erased[e + 1], s[1])
      if (w > SLACK && h > SLACK) return true
    }
    return false
  }
  for (const id of file.onPage(page)) {
    const unit = file.unit(id)
    if (!unit) continue
    for (const [k, row] of unit.ph) {
      if (row.kind !== 'display' || !(row.flags & NUMBERED) || !visible(row)) continue
      const segs = []
      for (let o = 0; o + 5 < row.segs.length; o += 6) if (row.segs[o] === page) segs.push([row.segs[o + 1], row.segs[o + 5], row.segs[o + 3], row.segs[o + 4]])
      if (!segs.length) continue
      out.numbers.total++
      const u = byId.get(id)
      const inPlace = !u || (u.drawn?.get(k) === 'kept' && !u.lines.some(l => l.items.some(it => it.ph === k)))
      if (inPlace && !segs.some(meets)) out.numbers.shown++
    }
  }
  return out
}
