// The highlight gate's floats (plans/2026-10-01-pdf-highlight.md, B4; highlight-gate.mjs imports it): on each side,
// each page's floats as the reader makes them on the page's first drawing (src/pdf-reader/engine/floats.mjs, from the
// page's operator list), measured against the source's floats:
//  - found: per paper, side and float environment (figure, table, algorithm; a caption in none is `other`), the
//    captions anchored there and those with a float; on both sides; the floats whose kind is not their environment's (a
//    figure found as a table: washed, not outlined)
//  - holes: points on a grid inside each float's painted shapes (pad 3 px at 100 %) where the pointer's hit test
//    (hitOf, then floatHitOf, as the session's pointer frame) lights nothing; points where a smaller unit's block wins
//    are counted apart
//  - running text inside a float: a token of a running-text unit (not a caption, a cell or a drawing's text) or of
//    another caption whose ink's centre lies inside a float's extent
//  - floats overlapping: two floats on a page whose extents overlap, or a rule inside both (round 1's table I took the
//    next column's algorithm's rule and reached into its title: the bounded case); their painted shapes meeting by their
//    pads (two floats set closer than their half leadings) are counted apart
//  - cells: each cell a float holds lights the float at its words' centre
//  - running text keeps its own: points of a running-text unit's block where hitOf finds that unit but a float takes
//    the point (a float's shape winning over the unit's block)
//  - each float's kind and extent, by its caption, held to the baseline exactly (a change meant is recorded again)
//  - cost: a page's floats made from its operator list (pathsOf and pageFloats), the main thread's part of the page's
//    first drawing, median of the gate's rounds
// It fails on a hole, running text inside a float, floats overlapping, a held cell lighting anything but its float, a
// point of running text taken by a float, and against the baseline on fewer floats found (per paper, side and
// environment, and on both sides), more kinds mismatched, or any float's kind or extent moved.
import { floatHitOf, floatShapes, pageFloats, pathsOf, wantsFloats } from '../../../src/pdf-reader/engine/floats.mjs'
import { figureRegions } from '../../../src/pdf-reader/engine/figures.mjs'
import { blockOf, hitOf, pageGeometry, runsOf } from '../../../src/pdf-reader/engine/highlight.mjs'

const ENVS = /\\(begin|end)\s*\{(figure\*?|table\*?|algorithm\*?|wrapfigure|wraptable|SCfigure|SCtable|sidewaysfigure|sidewaystable|longtable|subfigure|subtable)\}/g
/** the float environment a unit's source sits in: figure, table or algorithm (the outermost), else other */
export function envOf(paper, u) {
  const before = (paper.project.files.get(u.file) ?? '').slice(0, u.start), stack = []
  for (const m of before.matchAll(ENVS)) { if (m[1] === 'begin') stack.push(m[2]); else { const i = stack.lastIndexOf(m[2]); if (i >= 0) stack.length = i } }
  const outer = stack.find(e => !/^sub/.test(e))
  if (!outer) return 'other'
  return /figure/i.test(outer) ? 'figure' : /algorithm/.test(outer) ? 'algorithm' : 'table'
}

/** each page's figures and paths, from the operator list PDF.js draws the page by (the reader's annotation mode), and
 *  the time reading the paths took (ms, once) */
export async function drawnOf(pdf, pdfjs) {
  const out = [null]
  for (let p = 1; p <= pdf.numPages; p++) {
    const ops = await (await pdf.getPage(p)).getOperatorList({ annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS })
    const t0 = performance.now(), paths = pathsOf(ops, pdfjs.OPS)
    out.push({ regions: figureRegions(ops, pdfjs.OPS), paths, pathsMs: performance.now() - t0 })
  }
  return out
}

/** a side's floats made as the reader makes them, page by page, each page's geometry first: the time each page with
 *  captions took (ms) */
export function makeFloats(L, drawn) {
  const ms = []
  for (let p = 1; p < drawn.length; p++) {
    if (!wantsFloats(L, p)) continue
    pageGeometry(L, p)
    const t0 = performance.now()
    pageFloats(L, p, drawn[p].regions, drawn[p].paths)
    ms.push(performance.now() - t0)
  }
  return ms
}

const inside = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1
const RUNNING_NOT = new Set(['caption', 'cell', 'figure'])

/** what the gate measures of one side's floats: { found, holes, smaller, points, intruders, overlaps, padsMeet, cells,
 *  cellsOff, lost, regions, floats } — `found` per environment { captions, found, mismatched }; `lost` the points of
 *  running text's blocks a float takes from their unit; `regions` each float's kind and extent (to a tenth), by its
 *  caption */
export function measureSide({ L, doc, anchors, units, paper, kind, pad, step, drawn }) {
  const r = { found: {}, holes: 0, smaller: 0, points: 0, intruders: [], overlaps: [], cells: 0, cellsOff: [], lost: 0, regions: {}, ids: new Map() }
  const floats = []
  for (const fs of L.floats?.values() ?? []) floats.push(...fs)
  for (const f of floats) { r.ids.set(f.id, f.kind); r.regions[f.id] = [f.kind, ...[f.region.x0, f.region.y0, f.region.x1, f.region.y1].map(v => Math.round(v * 10) / 10)].join(' ') }
  units.forEach((u, i) => {
    if (u.kind !== 'caption' || !anchors.get(i)) return
    const env = envOf(paper, u), e = (r.found[env] ??= { captions: 0, found: 0, mismatched: 0 })
    e.captions++
    const k = r.ids.get(i)
    if (k) { e.found++; if ((k === 'figure') !== (env === 'figure')) e.mismatched++ }
  })
  const hit = (p, x, y) => floatHitOf(L, p, x, y, pad, hitOf(L, p, x, y, pad))
  for (const f of floats) {
    // the pointer inside what the float paints lights it, or a smaller unit painted there
    for (const s of floatShapes(L, f, pad)) for (let x = s.x0 + step / 2; x < s.x1; x += step) for (let y = s.y0 + step / 2; y < s.y1; y += step) {
      const h = hit(f.page, x, y)
      r.points++
      if (!h) r.holes++
      else if (h.id !== f.id) r.smaller++
    }
    // no running text inside it, and no other caption's words
    const { tok } = L
    for (const [id, a] of anchors) {
      if (!a || id === f.id || f.parts?.has(id) || (RUNNING_NOT.has(kind.get(id)) && kind.get(id) !== 'caption')) continue
      const n = a.tokens.filter(t => doc[t].page === f.page && inside(f.region, (tok.l[t] + tok.r[t]) / 2, (tok.top[t] + tok.bottom[t]) / 2)).length
      if (n) r.intruders.push(`#${f.id} p${f.page}: ${n} of #${id} (${kind.get(id) ?? 'para'})`)
    }
    // the cells it holds light it
    for (const id of f.members) {
      if (kind.get(id) !== 'cell') continue
      r.cells++
      const t = anchors.get(id).tokens.find(t => doc[t].page === f.page)
      if (t === undefined) continue
      const h = hit(f.page, (tok.l[t] + tok.r[t]) / 2, (tok.top[t] + tok.bottom[t]) / 2)
      if (h?.id !== f.id) r.cellsOff.push(`#${id} in #${f.id}: ${h?.id ?? 'nothing'}`)
    }
  }
  // two floats on a page: their extents overlapping, or a rule in both (the bounded case: round 1's table I took the
  // next float's rule, and reached into its caption); their painted shapes overlapping, by their pads, are counted apart
  const meets = (s, t) => Math.min(s.x1, t.x1) - Math.max(s.x0, t.x0) > 0.5 && Math.min(s.y1, t.y1) - Math.max(s.y0, t.y0) > 0.5
  r.padsMeet = 0
  for (const a of floats) for (const b of floats) {
    // a main caption's whole figure holds its subfigures
    if (a.page !== b.page || a.id >= b.id || a.parts?.has(b.id) || b.parts?.has(a.id)) continue
    const shared = (drawn[a.page]?.paths.rules ?? []).filter(q => [a, b].every(f => inside(f.region, (q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2))).length
    if (meets(a.region, b.region) || shared) r.overlaps.push(`#${a.id} and #${b.id} p${a.page}${shared ? `, ${shared} rules in both` : ''}`)
    else if (floatShapes(L, a, pad).some(s => floatShapes(L, b, pad).some(t => meets(s, t)))) r.padsMeet++
  }
  // running text keeps its own: no point of a running-text unit's block where hitOf finds that unit goes to a float
  const onFloats = new Set(floats.map(f => f.page))
  for (const [id, a] of anchors) {
    if (!a || RUNNING_NOT.has(kind.get(id))) continue
    for (const run of runsOf(L, id)) {
      if (!onFloats.has(run.page)) continue
      const b = blockOf(run, pad)
      for (let x = b.x0 + step / 2; x < b.x1; x += step) for (let y = b.y0 + step / 2; y < b.y1; y += step) {
        const u = hitOf(L, run.page, x, y, pad)
        if (u?.id === id && floatHitOf(L, run.page, x, y, pad, u)?.float) r.lost++
      }
    }
  }
  r.floats = floats.length
  return r
}
