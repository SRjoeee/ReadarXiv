// The ink units in the page pass (docs/route/orphan-text.md §8, stage 2): the units the wrap made of the text no source unit owns
// (layout/ink-units.mjs, `ours.ink`) carried as units after the source units': in the bundle's units (one more chunk, of
// format.mjs INK_UNITS_FORMAT), on the left (an anchor of arXiv's tokens on their lines, as any unit has), and in the layout (their
// rows, which the wrap made of our glyphs, given the layout's own face table and kinds). Nothing here reads a page: the rows are
// the wrap's, the left's tokens step T's.
//
// An original module (no port statement). It imports the engine's own pure modules alone.
import { PH_KINDS, UNIT_KINDS } from '../layout/file.mjs'
import { fontName } from '../layout/make.mjs'
import { BundleRefusal } from '../layer-proto/bundle.mjs'
import { levelRun } from '../layer-proto/figure-rows.mjs'
import { chunkTotals, writeUnitChunks } from '../layer-proto/format.mjs'
import { inkBundleUnitsOf } from '../layer-proto/units.mjs'
import { lineRects } from './anchors.mjs'

/** a token on an ink unit's line: its middle within the line's box, widened by this many PDF units */
const SLACK = 1

/**
 * The ink units the host gave (`ours.ink`, layout/wrap.mjs wrapFinal's `ink`) where they are this paper's: their ids from the
 * count of `source.units` on (the page pass gives the bundle's units before them: the source units' and the paper's structural
 * names', layer-proto/units.mjs bundleUnitsOf; wrapFinal's `inkFrom`), rising, each a kind of UNIT_KINDS with rows of the wrap's shape. Every one keeps the wrap's id, which
 * names its groups in our wrapped page (visibility.mjs textGroup) and which an echo names; `off` those the pass does not lay, as
 * the maker lays no unit on a page not drawable: one on a page `undrawable` (the line check's: carry.mjs lineCheckOf), or that
 * the wrap could not hide alone (its `off`: a page it did not wrap, a placeholder on a page whose groups it merged). Null where
 * there are none, all are off, or the value is not the wrap's (a host of before, a crafted value): the pass is then as it was
 */
export function inkOfHost(ink, source, undrawable = []) {
  const N = source?.units?.length
  if (!ink || !Array.isArray(ink.units) || ink.base !== N || !ink.units.length) return null
  const pages = new Set(undrawable)
  let next = N
  const units = []
  for (const u of ink.units) {
    if (!u || u.id !== next || !UNIT_KINDS.includes(u.kind) || !Array.isArray(u.pieces) || !u.rows || !Array.isArray(u.rows.lines) || u.rows.lines.length % 8 !== 0 || !u.rows.lines.length) return null
    next++
    units.push(u)
  }
  const off = new Set((Array.isArray(ink.off) ? ink.off : []).filter(id => Number.isInteger(id) && id >= N && id < next))
  for (const u of units) for (let j = 0; j < u.rows.lines.length; j += 8) if (pages.has(u.rows.lines[j])) { off.add(u.id); break }
  if (off.size === units.length) return null
  return { base: N, units, off }
}

/**
 * The ink units where their chunks fit beside the source units' within the bounds a head's chunks are read by (format.mjs
 * CHUNKS_MAX, UNITS_TOTAL_BYTES, UNITS_TOTAL_VALUES, a chunk's own): both written once as the pass writes them (chunksOf), else
 * null, the pass as it was. `sourceUnits` the bundle's (bundleUnitsOf's); a refusal of the source units' own is the pass's, later
 */
export async function inkWithinChunks(paper, sourceUnits, ink) {
  if (!ink) return null
  let src
  try { src = await writeUnitChunks({ paper, units: sourceUnits }) } catch (e) { if (e instanceof BundleRefusal) return ink; throw e }
  try { await writeUnitChunks({ paper, units: inkBundleUnitsOf(ink.units), start: ink.base, before: chunkTotals(src) }) } catch (e) { if (e instanceof BundleRefusal) return null; throw e }
  return ink
}

/** the bundle's units with the ink units after the source units' */
export const bundleWithInk = (bundle, ink) => (ink ? [...bundle, ...inkBundleUnitsOf(ink.units)] : bundle)

/**
 * Each ink unit's anchor on the left (anchors.mjs anchorUnits' shape: { rects, coverage, tokens, bounded, pairs }): arXiv's tokens
 * on its page whose middle stands in one of its lines' boxes (our pages are arXiv's, every box equal: the base page's check), its
 * rectangles their lines'. A unit no token stands in has no anchor. `doc` the left's tokens (step T's, fitted)
 */
export function inkAnchors(doc, ink) {
  const out = new Map()
  if (!ink) return out
  const byPage = new Map()
  doc.forEach((t, k) => (byPage.get(t.page) ?? byPage.set(t.page, []).get(t.page)).push(k))
  for (const u of ink.units) {
    const L = u.rows.lines, tokens = []
    for (let j = 0; j < L.length; j += 8) {
      const page = L[j], x0 = L[j + 1] - SLACK, x1 = L[j + 2] + SLACK, top = L[j + 4] + SLACK, bottom = L[j + 5] - SLACK
      for (const k of byPage.get(page) ?? []) {
        const t = doc[k], mx = t.x + t.w / 2, my = (t.top + t.bottom) / 2
        if (mx >= x0 && mx <= x1 && my >= bottom && my <= top) tokens.push(k)
      }
    }
    if (!tokens.length) continue
    const ks = [...new Set(tokens)].sort((a, b) => a - b)
    out.set(u.id, { rects: lineRects(doc, ks), coverage: 1, tokens: ks, bounded: true, pairs: new Map() })
  }
  return out
}

/**
 * Each figure unit's anchor on the left (inkAnchors' shape): arXiv's tokens on its page whose middle stands in its run's band —
 * from its origin along its direction for its length, across from its descent to its ascent (em of its size), SLACK beyond —, its
 * rectangles their lines', so that its translation lights its original as a source unit's does (the hover: a figure's label lit);
 * a unit level and read left to right alone (figure-rows.mjs levelRun: a turned one's translation is in no text layer, and anchored on the
 * left alone it would light there and nothing on the right, where the figure's float lit both). `figures` page-pass.mjs
 * figureUnits' rows by page (layer-proto/figure-rows.mjs figureRow); a unit no token stands in has no anchor (the figure's float
 * lights it then, as before)
 */
export function figureAnchors(doc, figures) {
  const out = new Map()
  if (!figures?.size) return out
  const byPage = new Map()
  doc.forEach((t, k) => (byPage.get(t.page) ?? byPage.set(t.page, []).get(t.page)).push(k))
  for (const [page, rows] of figures) for (const [id, , , x, y, ux, uy, length, size, ascent, descent] of rows) {
    if (!levelRun(ux, uy)) continue
    const tokens = []
    for (const k of byPage.get(page) ?? []) {
      const t = doc[k], dx = t.x + t.w / 2 - x, dy = (t.top + t.bottom) / 2 - y
      const along = dx * ux + dy * uy, across = dy * ux - dx * uy
      if (along >= -SLACK && along <= length + SLACK && across >= descent * size - SLACK && across <= ascent * size + SLACK) tokens.push(k)
    }
    if (tokens.length) out.set(id, { rects: lineRects(doc, tokens), coverage: 1, tokens, bounded: true, pairs: new Map() })
  }
  return out
}

/** the ink units `ids` (of `ink`) as a layout file's rows, their faces added to `fonts` (the file's table, appended to: a copy) */
function rowsOf(ink, ids, fonts) {
  const at = new Map(fonts.map((f, i) => [f, i]))
  const face = name => { const n = fontName(name); if (!at.has(n)) { at.set(n, fonts.length); fonts.push(n) } return at.get(n) }
  const out = { units: [], lines: [], frames: [], erase: [], ph: [] }
  const by = new Map(ink.units.map(u => [u.id, u]))
  for (const id of ids) {
    const u = by.get(id)
    // (a unit off, inkOfHost's, is laid nowhere: the original's)
    if (!u || ink.off?.has?.(id)) continue
    const r = u.rows
    out.units.push([id, UNIT_KINDS.indexOf(r.unit[1]), r.unit[2], r.unit[3], r.unit[4]])
    const lines = r.lines.slice()
    for (let j = 7; j < lines.length; j += 8) lines[j] = face(lines[j])
    out.lines.push([id, lines])
    out.frames.push([id, r.frames.slice()])
    if (r.erase.length) out.erase.push([id, r.erase.slice()])
    for (const p of r.ph) out.ph.push([id, p[0], PH_KINDS.indexOf(p[1]), p[2], ...p.slice(3)])
  }
  return out
}

/** a label row and an ink unit's text box meet: across and up, by more than this (PDF units) */
const MEET = 0.1

/**
 * The label rows (the file's [unit, kind, page, x0, baseline, x1, top, bottom]) that meet an ink unit's text: its erase boxes,
 * every one its text glyphs' (layout/ink-units.mjs rowsOf). The maker reads a unit's label off the glyphs left of its start mark
 * (make.mjs labelOf), and the wrap leaves those of a label that has no label's form in no group (own.mjs `labelKept`: "AMS subject
 * classifications.", a theorem's head whose note is a citation, "Definition 1 ([TT])"), where an ink unit claims them. The reader
 * shows a label row its unit does not draw again from render C, every group shown (layer-proto/hide.mjs), so that row brought
 * the original back under the ink unit's translation (the release sweep of 2026-10-25, (c): 2610.20266v1 p1, 2610.11256v1 pp12-13,
 * 2610.21037v1 p1). Their ink is the ink unit's alone: the rows go, where the ink unit is laid (one `off` is the original's, its
 * ink shown in its group, and the row stays as it was). A set of the rows, or null where none meets one
 */
function labelsOverInk(labels, ink) {
  if (!labels?.length || !ink?.units?.length) return null
  const byPage = new Map()
  for (const u of ink.units) {
    // (one laid nowhere, `off`, is the original's: its ink stays shown in its group, and the source unit's row as it was)
    if (ink.off?.has?.(u.id)) continue
    const L = u.rows.lines, E = u.rows.erase
    for (let q = 0; q + 4 < E.length; q += 5) {
      const page = L[8 * E[q]]
      ;(byPage.get(page) ?? byPage.set(page, []).get(page)).push([E[q + 1], E[q + 2], E[q + 3], E[q + 4]])
    }
  }
  let out = null
  for (const r of labels) {
    const boxes = byPage.get(r[2])
    if (boxes?.some(([x0, y0, x1, y1]) => Math.min(r[5], x1) - Math.max(r[3], x0) > MEET && Math.min(r[6], y1) - Math.max(r[7], y0) > MEET)) (out ??= new Set()).add(r)
  }
  return out
}

/** a layout (a file, or a part's rows: make.mjs partOf's) with the ink units `ids` after its own units, rising by id as the file's
 *  tables are, and none of its label rows that meets an ink unit's text (labelsOverInk); `layout` is not changed */
export function layoutWithInk(layout, ink, ids) {
  if (!layout || !ink) return layout
  const over = labelsOverInk(layout.labels, ink)
  if (!ids.length && !over) return layout
  const fonts = layout.fonts.slice()
  const add = rowsOf(ink, ids, fonts)
  return { ...layout, fonts, units: [...layout.units, ...add.units], lines: [...layout.lines, ...add.lines], frames: [...layout.frames, ...add.frames], erase: [...layout.erase, ...add.erase], ph: [...layout.ph, ...add.ph], ...(over ? { labels: layout.labels.filter(r => !over.has(r)) } : {}) }
}

/**
 * The maker's stream (make.mjs stream) with the ink units in it: every ink unit settled from the start (its rows the wrap's),
 * `layout(ids)` the maker's of the source units among `ids` with the ink units among them after; `tell` passes the maker its own
 */
export function streamWithInk(st, ink) {
  if (!st || !ink) return st
  const base = ink.base, all = ink.units.map(u => u.id)
  return {
    ...st,
    settled: i => (i >= base ? true : st.settled(i)),
    layout: (ids = null) => {
      const want = ids ?? null
      const own = want === null ? st.layout() : st.layout(want.filter(i => i < base))
      return layoutWithInk(own, ink, want === null ? all : want.filter(i => i >= base))
    },
    tell: (ids, through) => st.tell(ids.filter(i => i < base), through),
  }
}
