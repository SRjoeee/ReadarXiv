// TRANSITION CODE (the rebuild's stage 1a; stage 1c deletes it with today's front end): the one adapter from today's front end,
// marks and compile outputs to the prepare's seam, the Instrument (packages/engine/src/instrument.ts). The only code that knows
// today's shapes on the back half's side. What it reads is what wrapFinal reads before it wraps (layout/wrap-final.mjs): our
// marked final pass B read once by the engine package's readPdf (pageInk with the wrap's options: the same pages wrapFinal
// reads), each glyph's and rule's owner by today's ownership (own.mjs by the marks' points, figure-text.mjs's figure units,
// the ledger's ink units and kept blocks, ink-units.mjs), and TeX's statements in the marked compile's log (the units'
// alignments, \lineskip). It writes nothing and wraps nothing: the back half carries the ownership onto arXiv's page.
//
// The units, in today's bundle's order, so that a unit's index is today's id: the paper's source units, its names (cleveref's
// and the counters' words, kind `name`), the ink units and the kept blocks (their ids from the bundle's length on), the
// figure units; then one unit for each babel name's key that occurs (kind `name`, `name` its key: drawn in the target's word,
// never translated). Each unit's content is today's pieces typed: a text, an element (`el`, its kind marks.mjs classOf's,
// `other` for an invisible one), a group's open and close as a span (its style read off its command, a link's `must`), a nested
// unit; strings as Unicode (today's engine holds them as UTF-8 bytes read latin1), its id format's unitId.
import { ownersOf, readPdf, ROLE, unitId } from '@readarxiv/engine'
import { figureUnitsOf } from '../layout/figure-text.mjs'
import { claimInk, inkUnitsOf, keptUnitsOf } from '../layout/ink-units.mjs'
import { ledgerOf } from '../layout/ledger.mjs'
import { classOf, followsOf, readAlign, readSkipProbe } from '../layout/marks.mjs'
import { ownOf } from '../layout/own.mjs'
import { bundleUnitsOf } from '../layer-proto/units.mjs'

const UTF8 = new TextDecoder('utf-8')
/** a string as today's engine holds it (UTF-8 bytes read latin1) as Unicode; a string that is already wide as it is */
export function unicodeOf(s) {
  if (typeof s !== 'string') return ''
  let ascii = true
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c > 0xff) return s
    if (c > 0x7f) ascii = false
  }
  if (ascii) return s
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i)
  return UTF8.decode(b)
}

/** a group's style, read off its command: what today's front end leaves to the reader's regex tables (transition) */
const SPAN_STYLES = [
  [/^\\(?:textbf|bfseries|bf|mathbf|boldsymbol)\b/, 'bold'],
  [/^\\(?:textit|itshape|it|emph|em|textsl|slshape|sl)\b/, 'italic'],
  [/^\\(?:texttt|ttfamily|tt|verb|lstinline)\b/, 'mono'],
  [/^\\(?:textsc|scshape)\b/, 'sc'],
  [/^\\(?:href|url|hyperlink|hyperref)\b/, 'link'],
  [/^\\(?:textcolor|color|colorbox)\b/, 'colour'],
  [/^\\(?:underline|uline)\b/, 'underline'],
]
const styleOf = src => SPAN_STYLES.find(([re]) => re.test((src ?? '').trimStart()))?.[1] ?? 'other'

/** today's flat pieces ([open … close] pairs) as nested ones: an open starts a span, a close ends the innermost; a close with no
 *  open wraps what came before it at its level (the group began before the unit), an open left at the end has no close */
export function contentOf(pieces, { kindOf = () => 'other', idOfNested = () => null } = {}) {
  let level = []
  const stack = []
  pieces.forEach((p, k) => {
    const id = String(k)
    switch (p.t) {
      case 'text': level.push({ t: 'text', s: unicodeOf(p.s) }); break
      case 'ph': level.push({ t: 'el', id, kind: kindOf(p) ?? 'other', src: unicodeOf(p.src) }); break
      case 'nested': level.push({ t: 'unit', id, unit: idOfNested(p.unit) ?? '0'.repeat(64), pre: unicodeOf(p.pre), post: unicodeOf(p.post) }); break
      case 'open': {
        const style = styleOf(unicodeOf(p.src))
        const span = { t: 'span', id, style, ...(style === 'link' ? { must: 1 } : {}), open: unicodeOf(p.src), content: [] }
        level.push(span)
        stack.push({ outer: level, span })
        level = span.content
        break
      }
      case 'close': {
        const top = stack.pop()
        if (top) { top.span.close = unicodeOf(p.src); level = top.outer } else level = [{ t: 'span', id, style: 'other', close: unicodeOf(p.src), content: level }]
        break
      }
      default: throw new Error(`a piece the front end does not make (${String(p.t).slice(0, 20)})`)
    }
  })
  return stack.length ? stack[0].outer : level
}

/** the piece of each `.p` glyph (and rule): the innermost placeholder point `p<u>.<k>a` of its unit open before it on its page,
 *  else the last one opened (spike S1's rule), by the glyphs' (or boxes') counts the points carry */
function piecesByPoints(points, count, groupAt, by) {
  const out = new Int32Array(count).fill(-1)
  const open = new Map(), last = new Map()
  let q = 0
  for (let j = 0; j <= count; j++) {
    while (q < points.length && points[q][by] <= j) {
      const m = /^[pn](\d+)\.(\d+)([ab])$/.exec(points[q].name)
      if (m) {
        const u = Number(m[1]), k = Number(m[2])
        const st = open.get(u) ?? []
        if (m[3] === 'a') { st.push(k); open.set(u, st); last.set(u, k) } else { const x = st.lastIndexOf(k); if (x >= 0) st.splice(x, 1) }
      }
      q++
    }
    if (j === count) break
    const g = groupAt(j)
    if (!g || !g.endsWith('.p')) continue
    const u = Number(/^u(\d+)/.exec(g)?.[1])
    const st = open.get(u)
    out[j] = st?.length ? st.at(-1) : last.get(u) ?? -1
  }
  return out
}

/**
 * The Instrument of today's marked compile. `paper` live.mjs openPaper's (its bibliography made); `finalPdf` our marked final
 * pass's bytes; `options` the marks file's (`texts`, `inkless`); `log` the marked compile's last pass's log; `pdfjs` { getDocument,
 * OPS } and `documentOptions` the host's (the same as wrapFinal is given, so that the pages read are its); `made` { compiler,
 * tree, front }. Returns the Instrument, and `today` (the ownership's own records, for the lab's checks)
 */
export async function instrumentOf({ paper, finalPdf, options = {}, log = '', pdfjs, documentOptions = {}, made = {} }) {
  const units = paper.units
  const bundle = bundleUnitsOf(paper)
  const inkBase = bundle.length
  const read = await readPdf(pdfjs, finalPdf, { options: documentOptions, turned: true })
  const lower = x => (/[A-Z]/.test(x.name) ? { ...x, name: x.name.toLowerCase() } : x)
  // (each page as wrapFinal hands it to the ownership: layout/wrap-final.mjs)
  const pages = read.pages.map(({ raw, page }) => {
    if (!raw) return { glyphs: [], turned: [], shapes: new Map(), pictures: [], figures: new Map(), boxes: [], paths: [], points: [], boxAt: [], regions: [], view: [...page.view] }
    return { regions: raw.regions, glyphs: raw.glyphs.map(g => ({ n: g.n, k: g.k, u: g.u, x0: g.x0, x1: g.x1, ix0: g.ix0, ix1: g.ix1, y: g.y, size: g.size, top: g.top, bottom: g.bottom, font: g.font, fill: g.fill, ...(g.blank ? { blank: true } : {}), ...(g.form ? { form: true } : {}), ...(g.clipped ? { clipped: true } : {}), ...(g.unseen ? { unseen: true } : {}), ...(g.fid ? { fid: g.fid } : {}), ...(g.pid ? { pid: g.pid } : {}) })), turned: raw.turned, shapes: raw.shapes, pictures: raw.pictures, figures: raw.figures, unseen: raw.unseen, cut: raw.cut, boxes: raw.boxes, paths: raw.paths, points: raw.points.map(lower), paras: raw.paras ?? [], paraEnds: raw.paraEnds ?? [], boxAt: raw.boxAt, view: [...page.view] }
  })
  const texts = options.texts, inkless = options.inkless ?? null
  const shown = texts instanceof Map ? texts : Array.isArray(texts) ? new Map(Array.from({ length: Math.floor(texts.length / 2) }, (_, j) => [texts[2 * j], texts[2 * j + 1]]).filter(([a, b]) => typeof a === 'string' && typeof b === 'string')) : null
  const names = new Set(pages.flatMap(pg => pg.points.map(x => x.name)))
  const follows = followsOf(units, names, shown, inkless)
  const own = ownOf(pages, { units, follows, texts: shown, inkless: inkless === null ? null : new Set(inkless), names: paper.theoremNames ?? null })
  const fig = figureUnitsOf(pages, own)
  const withFigures = all => own.glyphs.map((row, i) => { const m = fig.glyphs[i]; if (!m?.size) return row; const out = Array.from(row); for (const [g, k] of m) if (all || !fig.units[k].why) out[g] = fig.units[k].group; return out })
  const withLeads = rows => rows.map((row, i) => { const m = own.leads?.[i]; if (!m?.size) return row; const out = Array.from(row); for (const [g, group] of m) out[g] ??= group; return out })
  const classed = ledgerOf(pages, { ...own, glyphs: withLeads(withFigures(true)) }, { units })
  const ink = inkUnitsOf(pages, classed, { units, from: inkBase })
  claimInk(own, ink, pages)
  const kept = keptUnitsOf(pages, classed, (p, g) => own.glyphs[p - 1]?.[g] ?? (fig.glyphs[p - 1]?.has(g) ? 'f' : null) ?? own.leads?.[p - 1]?.get(g) ?? null, { from: inkBase + ink.length })

  // ---- the units
  const align = new Map(readAlign(log))
  const ids = []
  const out = []
  const kindOf = p => classOf(p) ?? 'other'
  units.forEach((u, i) => {
    const content = contentOf(u.pieces, { kindOf, idOfNested: x => ids[units.indexOf(x)] ?? null })
    const id = unitId(u.kind, content)
    ids[i] = id
    const unhidden = own.units.get(i)?.unhidden
    out.push({ id, kind: u.kind, content, ...(Number.isInteger(u.depth) ? { depth: u.depth } : {}), ...(paper.kept?.has(u) ? { kept: true } : {}), ...(u.cell ? { cell: { table: u.cell.table, row: u.cell.row, col: u.cell.col, ...(u.cell.span ? { span: u.cell.span } : {}), ...(u.cell.head ? { head: true } : {}) } } : {}), ...(align.has(i) ? { align: align.get(i) } : {}), ...(unhidden === 'marks' ? { why: 'marks' } : {}) })
  })
  for (let i = units.length; i < inkBase; i++) {
    const content = contentOf(bundle[i][5].map(p => ({ t: 'text', s: p[1] })))
    out.push({ id: unitId(bundle[i][0], content), kind: bundle[i][0], content })
  }
  for (const u of [...ink, ...kept]) {
    const content = contentOf(u.pieces ?? [], { kindOf })
    out.push({ id: unitId(u.kind, content), kind: u.kind, content, ...(u.kept ? { kept: true, fixed: true } : {}), ...(Number.isInteger(u.echo) ? { echo: u.echo } : {}) })
  }
  const figBase = out.length
  // (the figure units in today's bundle's order: those it draws first, in their order, then those whose ink stays, crowded or
  // without a Unicode a reader can trust, as the bundle lists the units it does not hold after the ones it does)
  const figOrder = [...fig.units.keys()].sort((a, b) => (fig.units[a].why ? 1 : 0) - (fig.units[b].why ? 1 : 0) || a - b)
  const figAt = new Map(figOrder.map((k, q) => [k, figBase + q]))
  figOrder.map(k => fig.units[k]).forEach(f => {
    const content = [{ t: 'text', s: f.text ?? '' }]
    const dir = Math.abs((f.ux ?? 1) - 1) > 1e-6 || Math.abs(f.uy ?? 0) > 1e-6 ? [Math.round((f.ux ?? 1) * 1e4) / 1e4, Math.round((f.uy ?? 0) * 1e4) / 1e4] : undefined
    out.push({ id: unitId('inkfigures', content), kind: 'inkfigures', content, figure: { set: f.set ?? f.k, ...(dir ? { dir } : {}) }, ...(f.why ? { why: `figure: ${f.why}`, fixed: true } : {}) })
  })
  // a babel name's every key that occurs: a unit whose occurrences are its own (drawn in the target's word)
  const keyUnit = new Map()
  const keyOf = new Map()
  for (const pg of pages) for (const pt of pg.points) { const m = /^n(\d+)\.([a-z]{1,16})\.s$/.exec(pt.name); if (m) keyOf.set(`n${m[1]}`, m[2]) }
  const babel = key => { if (!keyUnit.has(key)) { keyUnit.set(key, out.length); const content = [{ t: 'text', s: key }]; out.push({ id: unitId('name', content), kind: 'name', content, name: key, kept: true }) } return keyUnit.get(key) }

  // ---- the owners of B's glyphs and boxes
  const glyphs = [], boxes = [], turnedOwners = []
  const kept0 = inkBase + ink.length
  pages.forEach((pg, i) => {
    const G = ownersOf(pg.glyphs.length), X = ownersOf(pg.boxes.length / 4)
    const row = own.glyphs[i] ?? [], brow = own.boxes[i] ?? []
    const pieceG = piecesByPoints(pg.points, pg.glyphs.length, j => row[j], 'glyph')
    const pieceX = piecesByPoints(pg.points, pg.boxes.length / 4, j => brow[j], 'box')
    const set = (O, j, g, piece) => {
      let m = /^u(\d+)(\.[pl])?$/.exec(g ?? '')
      if (m) { O.unit[j] = Number(m[1]); O.role[j] = m[2] === '.p' ? ROLE.element : m[2] === '.l' ? ROLE.label : ROLE.text; if (m[2] === '.p') O.piece[j] = piece[j]; return }
      m = /^n(\d+)$/.exec(g ?? '')
      if (m && keyOf.has(g)) { O.unit[j] = babel(keyOf.get(g)); O.role[j] = ROLE.name }
    }
    for (let j = 0; j < pg.glyphs.length; j++) set(G, j, row[j], pieceG)
    for (let j = 0; j < pg.boxes.length / 4; j++) set(X, j, brow[j], pieceX)
    // an ink unit's `.p` glyphs: its pieces' elements in their order (no points of its own)
    for (const [g, k] of fig.glyphs[i] ?? []) { if (G.unit[g] < 0) { G.unit[g] = figAt.get(k); G.role[g] = ROLE.text } }
    glyphs.push(G)
    boxes.push(X)
    // (a figure unit's turned glyphs: a y-axis title)
    const T = ownersOf(pg.turned?.length ?? 0)
    for (const [j, k] of fig.turned[i] ?? []) { T.unit[j] = figAt.get(k); T.role[j] = ROLE.text }
    turnedOwners.push(T)
  })
  // (the kept blocks' glyphs, which no group holds: their units' own, fixed)
  kept.forEach((u, q) => { for (const [p, g] of u.glyphs?.text ?? []) { const G = glyphs[p - 1]; if (G && G.unit[g] < 0) { G.unit[g] = kept0 + q; G.role[g] = ROLE.text } } })
  // (an ink unit's placeholder glyphs: its first element's, there being no points to tell them apart)
  ink.forEach(u => {
    const el = (u.pieces ?? []).findIndex(p => p.t === 'ph')
    if (el < 0) return
    for (const [p, g] of u.glyphs?.ph ?? []) { const G = glyphs[p - 1]; if (G && G.unit[g] === u.id && G.role[g] === ROLE.element && G.piece[g] < 0) G.piece[g] = el }
  })
  const lineskip = readSkipProbe(log)
  // (TeX's paragraph ends, its `qe<n><code>` points, where the marked compile set them: a paragraph ends before that glyph)
  const paragraphEnds = read.pages.map(({ raw }) => (raw?.paraEnds ?? []).map(x => x.glyph))
  // (each placeholder's two points `p<u>.<k>a` and `p<u>.<k>b`, u today's unit index, k its piece's: where the element begins
  // and ends in B's stream)
  const places = []
  pages.forEach((pg, i) => { for (const pt of pg.points) { const m = /^p(\d+)\.(\d+)([ab])$/.exec(pt.name); if (m && Number(m[1]) < units.length) places.push({ unit: Number(m[1]), piece: m[2], page: i + 1, glyph: pt.glyph, end: m[3] === 'b' }) } })
  return {
    instrument: { ink: read.doc, units: out, glyphs, boxes, turned: turnedOwners, places, tex: { ...(lineskip ? { lineskip } : {}), paragraphEnds }, made: { compiler: made.compiler ?? 'pdflatex', tree: made.tree ?? '', front: made.front ?? '' } },
    today: { own, fig, ink, kept, inkBase, figBase },
  }
}
