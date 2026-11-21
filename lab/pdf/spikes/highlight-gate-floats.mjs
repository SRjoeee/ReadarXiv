// The highlight gate's floats (plans/2026-10-01-pdf-highlight.md, B4): highlight-gate.mjs calls it for each paper
// (floatsOfPaper, with the sides it anchored) and at its end (floatsVerdict, which prints and holds the floats to their
// own baseline, highlight-gate-floats.baseline.json; WRITE_BASELINE=1 records it with the gate's). On each side, each
// page's floats as the reader makes them on the page's first drawing (src/pdf-reader/engine/view/floats.mjs, from the
// page's operator list, read here again from the PDF), measured against the source's floats:
//  - found: per paper, side and float environment (figure, table, algorithm; a caption in none is `other`), the
//    captions anchored there and those with a float; on both sides; the floats whose kind is not their environment's (a
//    figure found as a table: washed, not outlined)
//  - what the pointer lights inside a float: points on a grid inside each float's shape (pad 3 px at 100 %), by what the
//    pointer's hit test (hitOf, then floatHitOf, as the reader's pointer frame) lights there — the caption, a cell unit, a
//    table's cell no unit holds (floats.mjs cellsOf), another unit, or nothing (a figure's picture, a table's gaps and
//    rules: no float lights whole since the owner's ruling of 2026-10-30, docs/PDF-READER.md §17.1); counted, not held
//  - running text inside a float: a token of a running-text unit (not a caption, a cell or a drawing's text) or of
//    another caption whose ink's centre lies inside a float's extent
//  - floats overlapping: two floats on a page whose extents overlap, or a rule inside both (round 1's table I took the
//    next column's algorithm's rule and reached into its title: the bounded case); their painted shapes meeting by their
//    pads (two floats set closer than their half leadings) are counted apart
//  - cells: each cell a float holds lights itself at its words' centre, and each of a table's cells no unit holds (a cell of
//    numbers, of a formula) lights itself at its box's centre
//  - every unit keeps its own: points of a unit's block (not a cell's) where hitOf finds that unit but floatHitOf does not
//    give it (a float's shape winning over the unit's block: to nothing, or to a cell)
//  - each float's kind and extent, by its caption, held to the baseline exactly (a change meant is recorded again)
//  - kinds agreed: the floats whose kind changed when the two sides' were made to agree (floats.mjs floatsAgree: a
//    caption's float a figure on either side is one on both, as the reader makes it once both pages are drawn); the
//    measures above are of the floats agreed
//  - cost: a page's floats made from its operator list (pathsOf and pageFloats), the main thread's part of the page's
//    first drawing, median of the gate's rounds
// It fails on running text inside a float, floats overlapping, a cell (held or no unit's) lighting anything but itself, a
// point of a unit taken by a float, and against the baseline on fewer floats found (per paper, side and environment, and
// on both sides), more kinds mismatched, or any float's kind or extent moved.
// Each check made to fail once (B4, floats.mjs changed in place each time and put back): the hit test ignoring floats
// (5 082 716 holes, 410 cells lighting themselves); the running-text limit dropped (47 words of 2608.06701's #65 inside
// figure 5's box); a rule past a table's last line taken within 3 lines (16 floats sharing a rule with the next, tables
// found 11 → 9 on 02163); held cells not taken by their table (410); every float a table (figures' kinds mismatched).
// After the review of B4: floats winning over every block (350 points of running text taken); the text block's filter
// dropped, PANELS 0, GAP 3 (floats' extents moved against the baseline). The checks of 2026-10-30 (no float lit whole),
// each made to fail once on floats.mjs changed in place and put back: a cell unit not taken as itself (199 cells lighting
// nothing on 2608.02163 and 2608.12502), a table's cells no unit holds not found under the pointer (1 729), a smaller
// unit's block not winning over a float (250 points of units taken, on the other eight papers).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { floatHitOf, floatsAgree, floatShapes, pageFloats, pathsOf, wantsFloats } from '../../../src/pdf-reader/engine/view/floats.mjs'
import { figureRegions } from '../../../src/pdf-reader/engine/view/figures.mjs'
import { blockOf, DRAWING, hitOf, layoutOf, pageGeometry, runsOf } from '../../../src/pdf-reader/engine/view/highlight.mjs'
import { isTableCell } from '../../../src/pdf-reader/engine/layer-proto/units.mjs'

const BASELINE = new URL('highlight-gate-floats.baseline.json', import.meta.url).pathname

const ENVS = /\\(begin|end)\s*\{(figure\*?|table\*?|algorithm\*?|wrapfigure|wraptable|SCfigure|SCtable|sidewaysfigure|sidewaystable|longtable|subfigure|subtable)\}/g
/** the float environment a unit's source sits in: figure, table or algorithm (the outermost), else other */
export function envOf(paper, u) {
  const before = (paper.project.files.get(u.file) ?? '').slice(0, u.start), stack = []
  for (const m of before.matchAll(ENVS)) { if (m[1] === 'begin') stack.push(m[2]); else { const i = stack.lastIndexOf(m[2]); if (i >= 0) stack.length = i } }
  const outer = stack.find(e => !/^sub/.test(e))
  if (!outer) return 'other'
  return /figure/i.test(outer) ? 'figure' : /algorithm/.test(outer) ? 'algorithm' : 'table'
}

/** a PDF's page boxes, and each page's figures and paths from the operator list PDF.js draws it by (the reader's
 *  annotation mode), with the time reading the paths took (ms, once) */
async function drawnOf(file, { cmaps, fonts }) {
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, cMapUrl: cmaps, cMapPacked: true, standardFontDataUrl: fonts })
  const pdf = await task.promise, out = [null], views = []
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const pg = await pdf.getPage(p), ops = await pg.getOperatorList({ annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS })
      views.push(pg.view)
      const t0 = performance.now(), paths = pathsOf(ops, pdfjs.OPS)
      out.push({ regions: figureRegions(ops, pdfjs.OPS), paths, pathsMs: performance.now() - t0 })
    }
  } finally { await task.destroy() }
  return { drawn: out, views }
}

/** a side's floats made as the reader makes them, page by page, each page's geometry first: the time each page with
 *  captions took (ms) */
function makeFloats(L, drawn) {
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

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] ?? null }
/** per paper: each side's measures (measureSide), its floats' cost, and each caption's environment */
const papers = new Map()

/**
 * A paper's floats on both sides (highlight-gate.mjs, in its loop): `sides` { L, R } as it anchored them ({ anchors,
 * doc, layout }), `files` { L, R } their PDFs; the floats made on each side's layout (what the gate measured of the
 * units first is the units' alone), and their cost on fresh layouts, `rounds` times
 */
export async function floatsOfPaper({ id, paper, units, kind, sides, files, rounds, pad, step, cmaps, fonts }) {
  const out = { sides: {}, cost: {}, agreed: 0, envs: new Map(units.flatMap((u, i) => (u.kind === 'caption' ? [[i, envOf(paper, u)]] : []))) }
  const made = {}
  for (const S of ['L', 'R']) {
    const { anchors, doc, layout } = sides[S], { drawn, views } = await drawnOf(files[S], { cmaps, fonts })
    const per = []
    for (let r = 0; r < rounds; r++) per.push(makeFloats(layoutOf(doc, views, anchors, i => kind.get(i)), drawn))
    const page = per[0].map((_, k) => median(per.map(r => r[k]))), paths = drawn.slice(1).map(d => d.pathsMs)
    out.cost[S] = { pages: page.length, floatMs: page.length ? +median(page).toFixed(3) : null, floatMaxMs: page.length ? +Math.max(...page).toFixed(3) : null, pathsMs: +median(paths).toFixed(3), pathsMaxMs: +Math.max(...paths).toFixed(3) }
    makeFloats(layout, drawn)
    made[S] = drawn
  }
  // each caption's float one kind on both sides, as the reader has them once both pages are drawn (floatsAgree)
  for (const p of sides.L.layout.floats?.keys() ?? []) out.agreed += floatsAgree(sides.L.layout, p, sides.R.layout).length
  for (const S of ['L', 'R']) { const { anchors, doc, layout } = sides[S]; out.sides[S] = measureSide({ L: layout, doc, anchors, units, paper, kind, pad, step, drawn: made[S] }) }
  papers.set(id, out)
}

/**
 * The floats' report and verdict (highlight-gate.mjs, at its end): printed; with `write` the baseline recorded (on the
 * ten papers' runs only, `ten`), else held to it. Whether it failed
 */
export function floatsVerdict({ ids, write, ten }) {
  const counts = {}, regions = {}
  for (const id of ids) {
    const { sides, envs } = papers.get(id), both = {}
    for (const [i] of sides.L.ids) if (sides.R.ids.has(i)) { const env = envs.get(i) ?? 'other'; both[env] = (both[env] ?? 0) + 1 }
    counts[id] = { L: sides.L.found, R: sides.R.found, both }
    regions[id] = { L: sides.L.regions, R: sides.R.regions }
  }
  console.log('\nfloats per environment: captions anchored L / R, with a float L / R, on both sides; kinds mismatched L / R')
  const envSum = {}
  for (const id of ids) for (const S of ['L', 'R']) for (const [env, e] of Object.entries(counts[id][S])) { const t = (envSum[env] ??= { capL: 0, capR: 0, L: 0, R: 0, both: 0, misL: 0, misR: 0 }); t[`cap${S}`] += e.captions; t[S] += e.found; t[`mis${S}`] += e.mismatched }
  for (const id of ids) for (const [env, n] of Object.entries(counts[id].both)) envSum[env].both += n
  for (const [env, t] of Object.entries(envSum)) console.log(env.padEnd(10), `captions ${t.capL} / ${t.capR}`, `floats ${t.L} / ${t.R}`, `both ${t.both}`, `mismatched ${t.misL} / ${t.misR}`)
  console.log('kinds agreed across the sides (a figure on one side made one on the other):', ids.reduce((n, id) => n + papers.get(id).agreed, 0), ids.filter(id => papers.get(id).agreed).map(id => `${id} ${papers.get(id).agreed}`).join(', '))
  const sum = { points: 0, caption: 0, cell: 0, own: 0, other: 0, none: 0, cells: 0, owns: 0, padsMeet: 0, lost: 0 }, fail = { intruders: [], overlaps: [], cellsOff: [] }
  for (const id of ids) for (const S of ['L', 'R']) { const m = papers.get(id).sides[S]; for (const k of Object.keys(sum)) sum[k] += m[k]; for (const k of Object.keys(fail)) fail[k].push(...m[k].map(x => `${id} ${S} ${x}`)) }
  console.log(`points in floats' shapes ${sum.points}, lighting: the caption ${sum.caption}, a cell unit ${sum.cell}, a cell no unit holds ${sum.own}, another unit ${sum.other}, nothing ${sum.none}`)
  console.log(`cells held ${sum.cells}, cells no unit holds ${sum.owns}; lighting another ${fail.cellsOff.length}; points of a unit taken by a float ${sum.lost}`)
  console.log('cells lighting another:', fail.cellsOff.length, fail.cellsOff.slice(0, 8).join('; '))
  console.log('running text inside a float:', fail.intruders.length, fail.intruders.slice(0, 8).join('; '))
  console.log('floats overlapping:', fail.overlaps.length, fail.overlaps.slice(0, 8).join('; '), `(their pads meeting: ${sum.padsMeet})`)
  console.log('a page\'s floats, ms: paths read (median, max) and floats made (median, slowest page), per paper and side')
  for (const id of ids) for (const S of ['L', 'R']) { const c = papers.get(id).cost[S]; if (c.pages) console.log(`${id} ${S}`.padEnd(14), `${c.pages} pages with captions`, `paths ${c.pathsMs} / ${c.pathsMaxMs}`, `floats ${c.floatMs} / ${c.floatMaxMs}`) }
  const failures = []
  if (sum.lost) failures.push(`points of a unit taken by a float ${sum.lost}`)
  for (const k of Object.keys(fail)) if (fail[k].length) failures.push(`floats' ${k} ${fail[k].length}: ${fail[k][0]}`)
  if (write) {
    if (!ten) failures.push('a baseline is recorded on the ten papers\' runs only')
    if (!failures.length) writeFileSync(BASELINE, `${JSON.stringify({ note: 'highlight-gate-floats.mjs: per paper, side and float environment, captions and floats found, kinds mismatched, and floats on both sides; each float, its kind and extent. Counts and boxes only', floats: counts, floatRegions: regions }, null, 1)}\n`)
    console.log(failures.length ? 'floats: no baseline written' : `floats: baseline written: ${BASELINE}`)
  } else if (!existsSync(BASELINE)) failures.push('no floats baseline (WRITE_BASELINE=1 records one)')
  else {
    const base = JSON.parse(readFileSync(BASELINE, 'utf8'))
    for (const id of ids) {
      const was = base.floats?.[id]
      if (!was) { failures.push(`${id}: no baseline of the floats`); continue }
      // the floats found may not fall, nor the kinds mismatched grow
      for (const S of ['L', 'R']) for (const [env, b] of Object.entries(was[S])) {
        const c = counts[id][S][env] ?? { found: 0, mismatched: 0 }
        if (c.found < b.found) failures.push(`${id} ${S} ${env}: floats ${c.found}, the baseline ${b.found}`)
        if (c.mismatched > b.mismatched) failures.push(`${id} ${S} ${env}: kinds mismatched ${c.mismatched}, the baseline ${b.mismatched}`)
      }
      for (const [env, n] of Object.entries(was.both)) if ((counts[id].both[env] ?? 0) < n) failures.push(`${id} ${env}: floats on both sides ${counts[id].both[env] ?? 0}, the baseline ${n}`)
      // each float's kind and extent as recorded
      for (const S of ['L', 'R']) {
        const now = regions[id][S], had = base.floatRegions?.[id]?.[S] ?? {}
        for (const c of new Set([...Object.keys(now), ...Object.keys(had)])) if ((now[c] ?? null) !== (had[c] ?? null)) failures.push(`${id} ${S} float #${c}: ${now[c] ?? 'none'}, the baseline ${had[c] ?? 'none'}`)
      }
    }
  }
  console.log(failures.length ? `\nFAIL (floats): ${failures.slice(0, 20).join('; ')}${failures.length > 20 ? ` (and ${failures.length - 20} more)` : ''}` : '\nok (floats): no running text inside, no unit\'s point taken, none overlapping, every cell lighting itself; the baseline met')
  return failures.length > 0
}

const inside = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1

/** what the gate measures of one side's floats: { found, points, caption, cell, own, other, none, intruders, overlaps,
 *  padsMeet, cells, owns, cellsOff, lost, regions, floats } — `found` per environment { captions, found, mismatched }; the
 *  points of the floats' shapes by what they light; `lost` the points of units' blocks a float takes from their unit;
 *  `regions` each float's kind and extent (to a tenth), by its caption */
export function measureSide({ L, doc, anchors, units, paper, kind, pad, step, drawn }) {
  const r = { found: {}, points: 0, caption: 0, cell: 0, own: 0, other: 0, none: 0, intruders: [], overlaps: [], cells: 0, owns: 0, cellsOff: [], lost: 0, regions: {}, ids: new Map() }
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
    // what the pointer lights inside the float: its caption, a cell, another unit painted there, or nothing
    for (const s of floatShapes(L, f, pad)) for (let x = s.x0 + step / 2; x < s.x1; x += step) for (let y = s.y0 + step / 2; y < s.y1; y += step) {
      const h = hit(f.page, x, y)
      r.points++
      r[!h ? 'none' : h.id === f.id ? 'caption' : isTableCell(h.id) ? 'own' : kind.get(h.id) === 'cell' ? 'cell' : 'other']++
    }
    // no running text inside it, and no other caption's words
    const { tok } = L
    for (const [id, a] of anchors) {
      if (!a || id === f.id || f.parts?.has(id) || kind.get(id) === 'cell' || DRAWING.has(kind.get(id))) continue
      const n = a.tokens.filter(t => doc[t].page === f.page && inside(f.region, (tok.l[t] + tok.r[t]) / 2, (tok.top[t] + tok.bottom[t]) / 2)).length
      if (n) r.intruders.push(`#${f.id} p${f.page}: ${n} of #${id} (${kind.get(id) ?? 'para'})`)
    }
    // the cells it holds light themselves, and so do its cells no unit holds
    for (const id of f.members) {
      if (kind.get(id) !== 'cell') continue
      r.cells++
      const t = anchors.get(id).tokens.find(t => doc[t].page === f.page)
      if (t === undefined) continue
      const x = (tok.l[t] + tok.r[t]) / 2, y = (tok.top[t] + tok.bottom[t]) / 2, h = hit(f.page, x, y)
      if (h?.id !== id) r.cellsOff.push(`#${id} in #${f.id} p${f.page} at ${Math.round(x)},${Math.round(y)}: ${h?.id ?? 'nothing'} (the unit there ${hitOf(L, f.page, x, y, pad)?.id ?? 'none'})`)
    }
    for (const c of f.cells) {
      r.owns++
      const b = blockOf(c.run, pad), h = hit(f.page, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)
      if (h?.id !== c.id) r.cellsOff.push(`a cell no unit holds in #${f.id} p${f.page} at ${Math.round((b.x0 + b.x1) / 2)},${Math.round((b.y0 + b.y1) / 2)}: ${h ? `#${h.id} (${kind.get(h.id) ?? (isTableCell(h.id) ? 'a cell' : '?')})` : 'nothing'}`)
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
  // every unit keeps its own (a cell its table's, checked above): no point of its block where hitOf finds it goes elsewhere
  const onFloats = new Set(floats.map(f => f.page))
  for (const [id, a] of anchors) {
    if (!a || kind.get(id) === 'cell' || DRAWING.has(kind.get(id))) continue
    for (const run of runsOf(L, id)) {
      if (!onFloats.has(run.page)) continue
      const b = blockOf(run, pad)
      for (let x = b.x0 + step / 2; x < b.x1; x += step) for (let y = b.y0 + step / 2; y < b.y1; y += step) {
        const u = hitOf(L, run.page, x, y, pad)
        if (u?.id === id && floatHitOf(L, run.page, x, y, pad, u)?.id !== id) r.lost++
      }
    }
  }
  r.floats = floats.length
  return r
}
