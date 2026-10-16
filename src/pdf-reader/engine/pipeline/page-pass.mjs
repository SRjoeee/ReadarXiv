// The page pass (E2b, the prepare-pipeline design §2.2 steps T and 3 to 8): a paper's layer (bundle 4) made from the marked
// original's marks and arXiv's PDF, and told a part at a time to its host: the left (anchorUnits under the unit marks, leftSideOf),
// the layout file (makeLayout, its operator lists read once for the add-on's plans too), the add-on chained over the parts
// (layout/chain.mjs chainedAddon over the host's remover), and the cut (layer-proto/cut.mjs partCutter, cutBundle's own), each
// part judged as it is cut: the carry's share of the lines of its marked pages (CARRY_MIN) and its own reader's reading of it
// (readPart), a part refused either way the same pages with no layout. Under today's rules the frame, the column edges and the
// far-push columns read the whole document, so every part is cut once the whole is known (stage 1: one flush at the end); the
// parts are then cutBundle's of the same whole, byte for byte, wherever no verdict refuses one.
//
// An original module (no port statement). It imports the engine's own modules alone, by relative path.
import { BundleRefusal } from '../layer-proto/bundle.mjs'
import { wholeCutter } from '../layer-proto/cut.mjs'
import { indexOf, readHead, readPart, readUnitsChunk, TOKEN_LIMIT } from '../layer-proto/format.mjs'
import { bundleUnitsOf } from '../layer-proto/units.mjs'
import { readArxivText } from '../layout/arxiv.mjs'
import { chainedAddon } from '../layout/chain.mjs'
import { CARRY_MIN, makeLayout } from '../layout/make.mjs'
import { displayEdges, unitText } from '../translate/mt.mjs'
import { anchorUnits, boundsFromMarks, floatMatches, pageFrame } from './anchors.mjs'
import { leftSideOf } from './left-side.mjs'
import { isMemoryError } from './memory.mjs'

/** units TeX sets away from where the source has them (anchors.mjs `floating`), as the maker and the web's left take them */
const FLOATING = new Set(['caption', 'footnote', 'cell', 'figure'])
const why = e => String(e?.message ?? e).slice(0, 200)
/** a value a left part's wire carries: finite, within ±TOKEN_LIMIT */
const fits = v => Number.isFinite(v) && v >= -TOKEN_LIMIT && v <= TOKEN_LIMIT

/**
 * arXiv's tokens the left is anchored on: step T's, less any token a left part's wire cannot carry (a field not finite or past
 * ±TOKEN_LIMIT: a crafted transform's), each kept token's ink edges with it. Where none is dropped (every paper of the corpus),
 * step T's own arrays
 */
function fitted(text) {
  const { tokens, edges, spans } = text
  const keep = []
  for (let k = 0; k < tokens.length; k++) {
    const w = tokens[k]
    const x0 = Number.isFinite(spans.x0[k]) ? spans.x0[k] : w.x, x1 = Number.isFinite(spans.x1[k]) ? spans.x1[k] : x0
    if (fits(x0) && fits(x1) && fits(w.x) && fits(w.x + w.w) && (w.sym == null || fits(w.sym)) && fits(w.y) && fits(w.h) && fits(w.top) && fits(w.bottom)) keep.push(k)
  }
  if (keep.length === tokens.length) return { tokens, edges }
  return { tokens: keep.map(k => tokens[k]), edges: { l: Float64Array.from(keep, k => edges.l[k]), r: Float64Array.from(keep, k => edges.r[k]) } }
}

/**
 * A paper's layer made and told part by part. `paper` { id, version }; `source` openPaper's paper (its units, ids their
 * indices); `marks` layout/paper.mjs layoutMarksOfPaper's result ({ marks, unitMarks }, or { refused }: no layout, the left by
 * the units' text alone); `arxiv` { doc, text? }: a PDF.js document of arXiv's PDF (the caller's to open and destroy) and its
 * text as readArxivText read it (step T), else read here; `OPS` PDF.js's operator codes; `pdfjs` its version; `base` { bytes,
 * sha256, xref } of arXiv's PDF (the head's); `image` the compiler image's name; `remove({ from, to, plans })` the remover's
 * transport (chain.mjs), null for none (no part has an add-on, M20). `frame`: the frame's rule both anchorings are placed
 * under (anchors.mjs pageFrame, today's); `columns`: the left's far-push columns' rule (view/highlight.mjs, today's).
 * `verdicts` (default on): each part judged as it is cut, the carry's share of its marked pages' lines at least CARRY_MIN
 * (the last part's to the marked original's end) and its reader taking it; off, the parts are cutBundle's of the same whole.
 *
 * Told in order: `onHead(head, units)` (the head and the units' chunks), then for each part its left parts (`onLeft(written)`,
 * each page's once) and the part (`onPart(written, note)`), each awaited. `note`: { pages, layout: 'kept' | 'none' |
 * { refused, ... }, lines: [carried, total] of its marked pages }. Returns { through, count, stats: { left, layout, plans,
 * addon } }, or { refused: 'anchors', why } before anything is told (arXiv's PDF read for no unit, or not read). A failed
 * allocation is thrown; a throw of the maker's is the layout's (none, `stats.layout`), never the paper's
 */
export async function layerOfPaper({ paper, source, marks, arxiv, OPS, pdfjs, base, image, remove = null, onHead = null, onLeft, onPart, verdicts = true, frame = pageFrame, columns = undefined }) {
  if (typeof onLeft !== 'function' || typeof onPart !== 'function') throw new TypeError('onLeft, onPart: the host\'s sinks')
  if (!Number.isInteger(base?.bytes) || typeof base?.sha256 !== 'string' || !Number.isInteger(base?.xref)) throw new TypeError('base: arXiv\'s PDF\'s bytes, digest and startxref')
  const { doc } = arxiv
  const N = doc.numPages
  const text = arxiv.text ?? await readArxivText(doc)
  if (text.pages !== N) throw new TypeError(`arXiv's text is of ${text.pages} pages, its document of ${N}`)
  const units = source.units
  const texts = units.map((u, i) => ({ id: i, ...unitText(u.pieces), ...displayEdges(u) }))
  const floating = id => FLOATING.has(units[id]?.kind ?? '')
  const unitMarks = marks && 'marks' in marks ? marks.unitMarks : null

  // the left: anchored on arXiv's tokens the wire carries, under the unit marks (none: the units' text alone)
  const unread = text.views.findIndex((v, i) => v == null || !text.ok[i])
  if (unread >= 0) return { refused: 'anchors', why: `arXiv's PDF could not be read for the left: page ${unread + 1}` }
  const left = fitted(text)
  const leftFloats = left.tokens === text.tokens ? floatMatches(text.tokens, texts, floating) : floatMatches(left.tokens, texts, floating)
  const anchors = anchorUnits(left.tokens, texts, { ...(unitMarks ? { bounds: boundsFromMarks(left.tokens, unitMarks) } : {}), floating, floatMatch: leftFloats, frame })
  const side = leftSideOf({ doc: left.tokens, views: text.views, anchors, edges: left.edges, ...(columns ? { columns } : {}) })
  if (side.units.length === 0) return { refused: 'anchors', why: 'the anchors located no unit on arXiv\'s PDF' }

  // the layout, of the marks and arXiv's PDF (its operator lists read once, for the plans too); its refusal, or the maker's
  // throw, the layout's alone
  let layout = null, plans = null, lines = new Map(), made = null
  if (marks && 'marks' in marks) {
    const floatMatch = left.tokens === text.tokens ? leftFloats : floatMatches(text.tokens, texts, floating)
    try {
      const r = await makeLayout({ units, marks: marks.marks, arxiv: doc, OPS, paper, left: '', pdfjs, text, floatMatch, frame, plans: true, parts: true })
      if ('file' in r) {
        layout = r.file
        plans = r.plans ?? null
        lines = r.lines ?? lines
        made = { stats: r.stats, ...(r.plansFailed ? { plansFailed: r.plansFailed } : {}) }
      } else made = { refused: r.refused, stats: r.stats }
    } catch (e) {
      if (isMemoryError(e)) throw e
      made = { refused: 'failed', why: why(e) }
    }
  } else made = { refused: marks?.refused ?? 'marks' }

  // the add-on chained over the parts, its plans the maker's
  const hooks = layout && remove ? chainedAddon({ N, views: side.pages, base: { bytes: base.bytes, xref: base.xref }, planOf: p => plans?.get(p) ?? null, pdfjs, remove }) : null
  /** the carry's share of the lines of marked pages a to b (to the marked original's end with the paper's last) */
  const linesOf = (a, b) => {
    let carried = 0, total = 0
    for (const [p, [c, t]] of lines) if (p >= a && (b === N || p <= b)) { carried += c; total += t }
    return [carried, total]
  }
  // each part as its reader reads it, after the parts before it (`chain`); the index of the head and chunks told
  let index = null, chain = null, read = null
  const verdict = verdicts ? async ({ pages: [a, b], written }) => {
    const [carried, total] = linesOf(a, b)
    if (total > 0 && carried < CARRY_MIN * total) return { refused: 'carry', lines: [carried, total] }
    try { read = await readPart(written.bytes, { ref: written.ref, index, chain }) } catch (e) {
      if (isMemoryError(e) || !(e instanceof BundleRefusal)) throw e
      return { refused: 'read', why: why(e) }
    }
    return null
  } : null

  const whole = { paper: { ...paper, pages: N }, base, versions: { image }, units: bundleUnitsOf(source), left: { pages: side.pages, units: side.units }, layout }
  const { units: chunks, head, cutter, known } = await wholeCutter(whole, { leftPages: side.leftPages, base, image, ...(hooks ? { chainAddon: hooks.chainAddon, acceptAddon: hooks.acceptAddon } : {}), verdict })
  if (verdicts) {
    const told = []
    for (const c of chunks) told.push(await readUnitsChunk(c.bytes, { ref: c.ref, before: told.at(-1) ?? null }))
    index = indexOf(await readHead(head.bytes, { ref: head.ref }), told)
  }
  if (onHead) await onHead(head, chunks)
  for (;;) {
    read = null
    const part = await cutter.next(known)
    if (part === null) break
    const i = cutter.parts.length - 1, refused = cutter.verdicts[i]
    if (verdicts) {
      // (a part the verdict refused is cut again with no layout: its reader must take that one, or the cut is wrong)
      if (read?.sha256 !== part.sha256) {
        try { read = await readPart(part.bytes, { ref: part.ref, index, chain }) } catch (e) {
          if (isMemoryError(e)) throw e
          throw new Error(`part ${i} (pages ${part.from} to ${part.to}) is refused by its own reader: ${why(e)}`)
        }
      }
      chain = read.chain
    }
    for (const l of part.leftParts) await onLeft(l)
    await onPart(part, { pages: [part.from, part.to], layout: refused ?? (layout ? 'kept' : 'none'), lines: linesOf(part.from, part.to) })
  }
  return { through: N, count: cutter.parts.length, stats: { left: side.stats, layout: made, plans: plans ? { pages: plans.size, dirty: [...plans.values()].filter(p => p.remove).length } : null, addon: hooks ? hooks.state() : null } }
}
