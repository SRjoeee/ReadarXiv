// The text inside a vector figure of our final pass (docs/route/orphan-text.md stage 5, the content class `figures`,
// rules/content-classes.mjs): the labels, axis titles, legends and annotations a figure draws as glyphs, cut into ink units, one
// a label or a line, each an ink unit of kind `inkfigures` the bundle's units hold after the paper's own and the other ink units
// (pipeline/page-pass.mjs figureUnits), translated with them whatever the reader's toggles, and drawn in its own run's box by the
// layer where they show the class (run.mjs
// paintFigures, layer-proto/figure-fit.mjs), its ink hidden by its own optional-content group (`f<k>`, layout/wrap.mjs). Read in
// the maker child from what it already has: the pages pageInk read (`indices` and `turned`) and own.mjs's ownership. Nothing of
// arXiv's PDF, no layout file, no position estimated: every place is our glyphs'.
//
// Which glyphs: those no unit owns, no blank, inside a figure our compile set —
//   - an included PDF's: shown inside a form XObject (pageInk's `form`; pdfTeX includes a PDF, and an EPS made one, as a form);
//   - a TikZ or pgfplots picture's: between the picture's points `zs` and `ze` (layout/marks.mjs POINTS_TEX, inside pgf's
//     \pgfsys@beginpicture and \pgfsys@endpicture, in the picture's own box: TeX sets its text in our fonts; pageInk's
//     `pictures`).
// Level and turned alike (a y-axis title set at 90 degrees keeps its turn).
//
// How they are cut (RUN_*): in stream order, a glyph joins the run before it where both are such glyphs, of one font, size,
// colour, direction and figure (one form painted, one picture: pageInk's `fid` and `pid`, so that two figures side by side never
// make one label), on one baseline (within RUN_DY of their size across it), at most RUN_GAP of its size past the run's end along
// it and not back over it by more than RUN_BACK; any other glyph between ends the run. A
// run is a unit when it spells a word (two letters together) in a face that is no math face, every glyph of it a character a
// reader can trust (UNREAD); its text the glyphs' Unicode (NFKC) with a space where two stand apart by SPACE_GAP of their size.
// What it is not, a number, a tick's label, a letter alone, a formula's, stays the original's ink; so does a run a glyph of which
// is not wholly inside the clip in force (an included figure's viewport cuts off what it does not show: pageInk's `clipped`) or
// inside its page's box. A font that gives no Unicode a reader can trust leaves its unit the original's too, which the wrap
// tells from the font's own dict (remove.mjs unicodeOf).
//
// Each unit's place, in its own frame (its first glyph's origin, along its direction, up across it): its box from its first
// glyph's start to its last glyph's end, its band from its descent to its ascent, at least DRAW_BAND (the line a translation is
// drawn in: a CJK face's full em); its anchor, where a translation of another length keeps its place, read from the ink nearest
// it along its baseline within ANCHOR_REACH (a figure's lines by their segments, pageInk's `shapes`; else a box's edges) —
// `start` where the ink before it is nearer by ANCHOR_RATIO (a legend's line sample, an arrow it labels), `end` where the ink
// after it is (a word against its axis), else `centre` (a node's text, an axis title: TeX and the plotting programs centre
// them). A unit whose band meets other ink inside its box — another glyph's, a stroke's segment widened by its half line width,
// a fill's edge, an image's or a shading's box —, but a fill that holds the whole band (a node's fill, the plot's background), is
// `crowded`: a translation there could cover that ink, so it stays the original's.
//
// Its set and its room (the owner's rule of 2026-10-29: the labels of one group set at one size, the original's, each keeping the
// original's alignment; a translation may take free space, never touching other ink nor leaving its figure; a group that cannot
// fit shrinks as one). A unit in a column — runs of one figure, size and direction whose starts, ends or middles lie on one line
// within ALIGN_TOL (across their direction; for turned runs a level or upright line of the page too), two units or more among
// them (a legend's "…" tells its column's start) — keeps its column's edge as its anchor, whatever it read alone (a legend's
// entry with its frame right after it was set from its end, the longest one centred). The units of one column, and those of one
// figure, size and direction on one baseline, are one set (`set`, its first unit's k), which the layer fits at one size
// (layer-proto/figure-fit.mjs fitFigureSet). Its room (`before`, `after`) is the free line beside its box: to the nearest ink
// its band meets (or the edge of the ground it stands on), ROOM_CLEAR short of it, within its figure's extent (pageInk's
// `figures` and its glyphs), half the line to another unit's band (the other half that unit's), short of a unit of another
// direction's band and room, ROOM_MAX at most.
//
// Pure arithmetic over the pages; an original module (no port statement).
import { classifyFont } from '../layer-proto/fonts.mjs'
import { PICTURE_END, PICTURE_START } from './ink.mjs'

/** two glyphs on one run: their baselines within this share of their size across the run's direction */
export const RUN_DY = 0.05
/** …and the second at most this many of its sizes past the run's end along it (a word's space is a third; a legend's columns,
 *  a tick's next label, are an em and more) */
export const RUN_GAP = 0.6
/** …and not back over the run's end by more than this share (a kern) */
const RUN_BACK = 0.3
/** a space in a unit's text where two of its glyphs stand this share of their size apart, or more */
export const SPACE_GAP = 0.15
/** a figure's line right before or after a unit along its baseline, within this many of its sizes, anchors it there */
export const ANCHOR_REACH = 1.5
/** …where the ink on one side of it is nearer than the other side's by this ratio at least (a line sample right before a legend's
 *  entry, an axis right after a tick's word; none on a side is as far as can be) */
export const ANCHOR_RATIO = 2
/** the band a translation is drawn in, descent and ascent in em, at the least: a unit is crowded where other ink meets it */
export const DRAW_BAND = Object.freeze([-0.15, 0.88])
/** a unit's band inside its box, shrunk by this share of its size at each edge before other ink is looked for in it (an
 *  antialiased edge, a glyph's side bearing) */
const CROWD_PAD = 0.04
/** two runs of one figure, one size and one direction share an edge (a column's start, end or middle) where theirs lie on one
 *  line within this share of their size (a legend's entries, an axis's labels set against it) */
export const ALIGN_TOL = 0.08
/** a level unit's column: the text lines within this many of its sizes above and below its baseline (columnAnchorOf) */
export const COLUMN_REACH = 3
/** a unit's room, the free line before and after its box that a longer translation may take: at most this many of its sizes a
 *  side, and this share of its size short of other ink (a translation never touches another's ink) */
export const ROOM_MAX = 6, ROOM_CLEAR = 0.15
/** a path's segment is told as far as its box shows it, within this many PDF units (its segments are single floats) */
const SHOWN_SLACK = 0.05
/** the units a page may hold, at most, and a paper (past them the rest stay the original's, counted) */
export const FIGURE_UNITS_PAGE = 400, FIGURE_UNITS_DOC = 4000
/** a unit's text at most, in code units (a long run is a paragraph some figure holds: cut there, its rest the original's) */
export const FIGURE_TEXT_MAX = 400
/** the group of figure unit `k` (layout/wrap.mjs names it `axt:f<k>`) */
export const figureGroup = k => `f${k}`
/** why a figure's text is not a unit drawn (wrapFinal's counts, and each unit's `why`) */
export const FIGURE_WHYS = Object.freeze(['crowded', 'unicode', 'shared', 'page', 'bounds'])

const WORD = /\p{L}{2}/u
/** a glyph's Unicode no reader can trust: none, a private use's, a replacement character, a control */
const UNREAD = /[\uE000-\uF8FF\uFFFD\p{Cc}]|[\u{F0000}-\u{10FFFF}]/u

/**
 * A page's glyphs as one stream, level and turned, in the order the content shows them (by show and place in it), each with its
 * frame: origin (ox, oy), end (ex, ey), direction (ux, uy), size, its band's ascent and descent in em, its font, fill, whether
 * it is shown in a form, its picture depth, and its owner's group (level glyphs alone are owned: own.mjs reads no turned glyph)
 */
function streamOf(pg, owners) {
  const G = pg.glyphs ?? [], T = pg.turned ?? [], P = pg.pictures ?? []
  // (the picture depth before each level glyph and each point: points stand before the glyph they name)
  const depthAtPoint = new Int32Array(P.length + 1)
  for (let i = 0, d = 0; i < P.length; i++) { depthAtPoint[i] = d; const nm = P[i].name; if (nm === PICTURE_START) d++; else if (nm === PICTURE_END) d = Math.max(0, d - 1); depthAtPoint[i + 1] = d }
  const out = []
  let q = 0, d = 0
  for (let g = 0; g < G.length; g++) {
    for (; q < P.length && P[q].glyph <= g; q++) { const nm = P[q].name; if (nm === PICTURE_START) d++; else if (nm === PICTURE_END) d = Math.max(0, d - 1) }
    const x = G[g]
    if (!(x.n >= 0)) continue
    out.push({ i: g, turned: false, n: x.n, k: x.k, u: x.u ?? '', blank: !!x.blank || !/\S/u.test(x.u ?? ''), ox: x.x0, oy: x.y, ex: x.x1, ey: x.y, ux: 1, uy: 0, size: x.size, ascent: (x.top - x.y) / Math.max(x.size, 1e-6), descent: (x.bottom - x.y) / Math.max(x.size, 1e-6), font: x.font, fill: x.fill ?? 0, form: !!x.form, picture: d, owner: owners?.[g] ?? null, ink: [x.ix0 ?? x.x0, x.bottom, x.ix1 ?? x.x1, x.top], clipped: !!x.clipped, fid: x.fid ?? 0, pid: x.pid ?? 0 })
  }
  T.forEach((t, j) => {
    if (!(t.n >= 0)) return
    const picture = depthAtPoint[Math.min(Math.max(t.pt ?? 0, 0), P.length)]
    out.push({ i: j, turned: true, n: t.n, k: t.k, u: t.u ?? '', blank: !!t.blank || !/\S/u.test(t.u ?? ''), ox: t.ox, oy: t.oy, ex: t.ex, ey: t.ey, ux: t.ux, uy: t.uy, size: t.size, ascent: t.ascent, descent: t.descent, font: t.font, fill: t.fill ?? 0, form: !!t.form, picture, owner: null, box: t.box, clipped: !!t.clipped, fid: t.fid ?? 0, pid: t.pid ?? 0 })
  })
  out.sort((a, b) => a.n - b.n || a.k - b.k)
  return out
}

/** a point's place in a frame: along it (s) and across it (t) */
const along = (f, x, y) => (x - f.ox) * f.ux + (y - f.oy) * f.uy
const across = (f, x, y) => -(x - f.ox) * f.uy + (y - f.oy) * f.ux
/** a page box [x0, y0, x1, y1] as its extent in a frame: [s0, t0, s1, t1] */
function inFrame(f, b) {
  let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity
  for (const [x, y] of [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]]) {
    const s = along(f, x, y), t = across(f, x, y)
    if (s < s0) s0 = s
    if (s > s1) s1 = s
    if (t < t0) t0 = t
    if (t > t1) t1 = t
  }
  return [s0, t0, s1, t1]
}

/**
 * The figure units of a document. `pages` (page p at index p - 1) as wrapFinal reads them — `glyphs` (pageInk's with `indices`),
 * `turned` (pageInk's `turned`), `boxes` (stride 4), `paths`, `points` —; `own`, ownOf's result for them (its `glyphs[p - 1][g]`,
 * a group or null). Returns { units, glyphs, turned, stats }: `units` each { k, page, group, text, font, size, fill, angle (degrees,
 * anticlockwise), x, y (its first glyph's origin), ux, uy, length (its box along its direction), ascent, descent (its band, em),
 * anchor ('start' | 'centre' | 'end'), form, why (null, or 'crowded') }; `glyphs[p - 1]` a Map of a level glyph's index to its
 * unit's k and `turned[p - 1]` of a turned glyph's, and each unit's set and room (setsOf, roomsOf: `set`, its set's first
 * unit's k; `before`, `after`, PDF units); `stats` { units, crowded, letters, runs, sets, grouped, aligned }
 */
export function figureUnitsOf(pages, own, { unitsPage = FIGURE_UNITS_PAGE, unitsDoc = FIGURE_UNITS_DOC } = {}) {
  const fam = new Map()
  const famOf = name => { let f = fam.get(name); if (f === undefined) { f = classifyFont(name ?? '').fam; fam.set(name, f) } return f }
  const units = [], glyphMaps = [], turnedMaps = []
  const stats = { units: 0, crowded: 0, letters: 0, runs: 0, past: 0, clipped: 0, sets: 0, grouped: 0, aligned: 0 }
  pages.forEach((pg, pi) => {
    // (the page's text lines a unit's column is read from, made once a page and call, of this call's owners)
    let lines = null
    const glyphMap = new Map(), turnedMap = new Map()
    glyphMaps.push(glyphMap); turnedMaps.push(turnedMap)
    const S = streamOf(pg, own?.glyphs?.[pi])
    const runs = []
    let run = null
    const close = () => { if (run?.gs.some(x => !x.blank)) runs.push(run); run = null }
    for (const x of S) {
      const figure = !x.owner && (x.form || x.picture > 0)
      if (!figure) { close(); continue }
      if (run) {
        const f = run.frame, s = along(f, x.ox, x.oy), t = across(f, x.ox, x.oy)
        const joins = x.font === run.font && Math.abs(x.size - run.size) <= 0.01 * run.size && x.fill === run.fill && x.form === run.form && x.fid === run.fid && x.pid === run.pid
          && Math.abs(x.ux - f.ux) < 1e-3 && Math.abs(x.uy - f.uy) < 1e-3 && Math.abs(t) <= RUN_DY * run.size
          && s >= run.s1 - RUN_BACK * run.size && s - run.s1 <= RUN_GAP * run.size
        if (!joins) close()
      }
      if (!run) {
        if (x.blank) continue
        run = { gs: [], font: x.font, size: x.size, fill: x.fill, form: x.form, fid: x.fid, pid: x.pid, s1: 0, frame: { ox: x.ox, oy: x.oy, ux: x.ux, uy: x.uy } }
      }
      run.gs.push(x)
      if (x.clipped && !x.blank) run.clipped = true
      run.s1 = Math.max(run.s1, along(run.frame, x.ex, x.ey))
    }
    close()
    stats.runs += runs.length
    // (the page's box, which clips what it draws as a clip path does: a run past it, in part, is not shown whole either)
    const V = pg.view?.length === 4 ? [Math.min(pg.view[0], pg.view[2]), Math.min(pg.view[1], pg.view[3]), Math.max(pg.view[0], pg.view[2]), Math.max(pg.view[1], pg.view[3])] : null
    const offPage = (x, y) => !!V && (x < V[0] || x > V[2] || y < V[1] || y > V[3])
    let onPage = 0
    // (the page's units with their free line, and every run shown whole, a unit's or not: a column's edge is told by them all,
    // a legend's "…" among its entries, a tick's number under its axis's words)
    const mine = [], evidence = []
    for (const r of runs) {
      const gs = r.gs.filter(x => !x.blank)
      if (!r.clipped && !gs.some(x => offPage(x.ox, x.oy) || offPage(x.ex, x.ey))) evidence.push(edgesOf(r, gs))
      if (famOf(r.font) === 'math') continue
      const text = textOf(r.gs, r.frame)
      if (!WORD.test(text.normalize('NFKC'))) continue
      if (gs.some(x => UNREAD.test(x.u)) || text.length > FIGURE_TEXT_MAX) continue
      // (a run its clip cuts, or its page's edge, whole or in part, is not shown whole: no text a translation could stand for,
      // and a row whose origin is off its page no part's reader takes, figure-rows.mjs checkFigures)
      if (r.clipped || gs.some(x => offPage(x.ox, x.oy) || offPage(x.ex, x.ey))) { stats.clipped++; continue }
      if (onPage >= unitsPage || units.length >= unitsDoc) { stats.past++; continue }
      const f = r.frame, first = gs[0]
      const s0 = 0, s1 = Math.max(...gs.map(x => along(f, x.ex, x.ey)))
      // (its band: its glyphs', at least the line a translation is drawn in, DRAW_BAND: a CJK face's full em)
      const ascent = Math.max(DRAW_BAND[1], ...gs.map(x => x.ascent)), descent = Math.min(DRAW_BAND[0], ...gs.map(x => x.descent))
      const k = units.length
      const u = { k, page: pi + 1, group: figureGroup(k), text, font: r.font, size: r.size, fill: r.fill, angle: angleOf(f), x: first.ox, y: first.oy, ux: f.ux, uy: f.uy, length: s1 - s0, ascent, descent, anchor: 'centre', form: r.form, why: null }
      const room = roomOf(pg, f, u, r.gs)
      // (the ink beside it within the reach tells its anchor, inside a figure (a line sample, an axis); where none does, a level
      // line on its column's edge, or centred in it, is set from there, as TeX set it (a heading a class sets in a boxed
      // panel); else its middle; the unit's set below may take its column's edge over either)
      u.anchor = room.told ? room.anchor : (columnAnchorOf((lines ??= columnLinesOf(pg, own?.glyphs?.[pi])), u) ?? room.anchor)
      if (room.crowded) { u.why = 'crowded'; stats.crowded++ }
      units.push(u)
      mine.push({ u, r, free: room })
      evidence.at(-1).unit = u
      onPage++
      stats.units++
      stats.letters += (text.match(/\p{L}/gu) ?? []).length
      for (const x of r.gs) (x.turned ? turnedMap : glyphMap).set(x.i, k)
    }
    // (the page's units in their columns and sets, then each one's room on its line)
    setsOf(mine, evidence, stats)
    roomsOf(pg, S, mine)
  })
  return { units, glyphs: glyphMaps, turned: turnedMaps, stats }
}

/** the page's text lines a unit's column is read from: the level glyphs a unit owns (own.mjs's groups), by baseline, a line
 *  cut where two glyphs stand a size apart (two columns' lines on one baseline), each { y, x0, x1, size } by its glyphs'
 *  advances */
function columnLinesOf(pg, owners) {
  if (!owners) return []
  const G = pg.glyphs ?? [], gs = [], lines = []
  for (let g = 0; g < G.length; g++) { const x = G[g]; if (owners[g] != null && x && x.size > 0 && /\S/u.test(x.u ?? '') && !x.blank) gs.push(x) }
  gs.sort((a, b) => b.y - a.y || a.x0 - b.x0)
  let row = []
  const flush = () => {
    row.sort((a, b) => a.x0 - b.x0)
    let cur = null
    for (const x of row) {
      if (cur && x.x0 - cur.x1 <= cur.size) { cur.x1 = Math.max(cur.x1, x.x1); cur.size = Math.max(cur.size, x.size); continue }
      cur = { y: x.y, x0: x.x0, x1: x.x1, size: x.size }
      lines.push(cur)
    }
    row = []
  }
  for (const x of gs) { if (row.length && Math.abs(row[0].y - x.y) > RUN_DY * Math.max(row[0].size, x.size)) flush(); row.push(x) }
  flush()
  return lines
}

/** a level unit's anchor by its column, where no ink beside it tells one (the column's text lines within COLUMN_REACH of its
 *  sizes above and below it whose extent its box meets, two at least): its start on their common start, the column's left
 *  edge, within ALIGN_TOL of its size ('start': a heading TeX set flush, 2610.37668v1's "Abstract", centred over its longer
 *  original had stood an em in); its end on their end ('end'); its middle on the column's ('centre'); else null */
function columnAnchorOf(lines, u) {
  if (!lines.length || Math.abs(u.uy) > 1e-3 || u.ux <= 0) return null
  const x0 = u.x, x1 = u.x + u.length, reach = COLUMN_REACH * u.size, tol = ALIGN_TOL * u.size
  let n = 0, left = Infinity, right = -Infinity
  for (const l of lines) {
    if (Math.abs(l.y - u.y) > reach || l.x1 <= x0 || l.x0 >= x1) continue
    n++
    left = Math.min(left, l.x0)
    right = Math.max(right, l.x1)
  }
  if (n < 2) return null
  if (Math.abs(x0 - left) <= tol) return 'start'
  if (Math.abs(x1 - right) <= tol) return 'end'
  if (Math.abs((x0 + x1) / 2 - (left + right) / 2) <= tol) return 'centre'
  return null
}

/** the stretch along a unit's direction, from its origin, over which both edges of its band stay inside box `b` [x0, y0, x1,
 *  y1]: [s0, s1] (an axis the direction does not move along bounds nothing) */
function spanIn(u, b) {
  const nx = -u.uy, ny = u.ux
  let s0 = -Infinity, s1 = Infinity
  for (const t of [u.descent * u.size, u.ascent * u.size]) {
    const px = u.x + nx * t, py = u.y + ny * t
    for (const [p, d, lo, hi] of [[px, u.ux, b[0], b[2]], [py, u.uy, b[1], b[3]]]) {
      if (Math.abs(d) < 1e-9) continue
      const a = (lo - p) / d, z = (hi - p) / d
      s0 = Math.max(s0, Math.min(a, z)); s1 = Math.min(s1, Math.max(a, z))
    }
  }
  return [s0, s1]
}

/** a run's edges and its baseline (so that runs of one direction compare by number): each edge's place along its direction in
 *  the page's own frame turned to it (`along`), and its point on the page (`x`, `y`) — its start (its first glyph's origin), end
 *  (its last glyph's end) and middle —, its baseline across its direction, its size and what it may share an edge with (`key`:
 *  one figure, one direction, one size), and the lines its edges may share (`axes`: across its direction always; for a run
 *  turned off the page's axes, the page's level and upright lines too, as a turned axis's labels end on one level line) */
function edgesOf(r, gs) {
  const f = r.frame, s0 = f.ox * f.ux + f.oy * f.uy, len = Math.max(0, ...gs.map(x => along(f, x.ex, x.ey)))
  const at = s => ({ along: s0 + s, x: f.ox + f.ux * s, y: f.oy + f.uy * s })
  const square = Math.abs(f.ux) < 1e-3 || Math.abs(f.uy) < 1e-3
  return { start: at(0), end: at(len), centre: at(len / 2), t: -f.ox * f.uy + f.oy * f.ux, size: r.size, key: `${r.fid}:${r.pid}:${Math.round(f.ux * 1000)}:${Math.round(f.uy * 1000)}:${r.size.toFixed(2)}`, axes: square ? AXES.slice(0, 1) : AXES, unit: null }
}

/** the edges a column may share, in the order a tie between them is broken (a column is read from its start) */
const EDGES = Object.freeze(['start', 'end', 'centre'])
/** the lines a column's edges lie on: across the runs' direction (`along`: one place along it), upright (`x`), level (`y`) */
const AXES = Object.freeze(['along', 'x', 'y'])

/**
 * A page's units in their columns and sets (the owner's rule of 2026-10-29: the labels of one group set at one size, each
 * keeping the original's alignment). A column: the runs of one key (one figure, direction and size) whose starts, ends or
 * middles lie on one line within ALIGN_TOL of their size — across their direction, or for runs turned off the page's axes on
 * a level or upright line of the page (a turned axis's labels, each ending at its tick) —, units or not (a legend's "…", a
 * tick's number tell its column's edge too). A unit in a column with another unit keeps that column's edge as its anchor — the
 * edge the most of its runs share; where edges tie, the one the most of the column's units read alone (roomOf), else the
 * first of EDGES — whatever it read alone: a legend's entry with its frame near its end is set from its start as its column
 * is. A set: the units of one column of one edge, and the units of one key on one baseline (within RUN_DY of their size: an
 * axis's words, a legend laid in a row), joined; its number `set` is its first unit's k, which the layer fits it by
 * (figure-fit.mjs fitFigureSet: one size for all). Counts the sets of two units or more (`sets`), the units in them
 * (`grouped`) and those whose anchor the column changed (`aligned`)
 */
function setsOf(mine, evidence, stats) {
  for (const { u } of mine) u.set = u.k
  if (mine.length < 2) return
  // (each edge's columns on each line: the runs of a key in the order of that edge's place, each joined to the one before
  // within the tolerance)
  const byKey = new Map()
  evidence.forEach((e, i) => (byKey.get(e.key) ?? byKey.set(e.key, []).get(e.key)).push(i))
  const lines = EDGES.flatMap(edge => AXES.map(axis => ({ edge, axis, parent: new Int32Array(evidence.length).map((_, i) => i) })))
  const find = (parent, i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  for (const list of byKey.values()) {
    if (list.length < 2) continue
    for (const { edge, axis, parent } of lines) {
      if (!evidence[list[0]].axes.includes(axis)) continue
      const order = [...list].sort((a, b) => evidence[a][edge][axis] - evidence[b][edge][axis])
      for (let j = 1; j < order.length; j++) {
        const a = evidence[order[j - 1]], b = evidence[order[j]]
        if (b[edge][axis] - a[edge][axis] <= ALIGN_TOL * b.size) parent[find(parent, order[j])] = find(parent, order[j - 1])
      }
    }
  }
  // (each column's runs, its units, and its units' readings alone)
  for (const line of lines) {
    line.runs = new Map(); line.units = new Map(); line.votes = new Map()
    for (let i = 0; i < evidence.length; i++) {
      const c = find(line.parent, i)
      line.runs.set(c, (line.runs.get(c) ?? 0) + 1)
      const u = evidence[i].unit
      if (!u) continue
      line.units.set(c, (line.units.get(c) ?? 0) + 1)
      const v = line.votes.get(c) ?? line.votes.set(c, { start: 0, end: 0, centre: 0 }).get(c)
      v[u.anchor]++
    }
  }
  // (each unit's column: of the columns it shares with another unit, the one the most runs share; a tie, by the readings of its
  // units of that column's edge, then EDGES' order. A number alone at a word's edge makes no column: an axis's title over a
  // tick's label stays centred)
  const at = new Map(evidence.map((e, i) => [e.unit, i]).filter(([u]) => u))
  const chosen = new Map()
  for (const { u } of mine) {
    const i = at.get(u)
    let best = null
    for (const line of lines) {
      const c = find(line.parent, i), n = line.units.get(c) > 1 ? line.runs.get(c) : 0
      if (n < 2) continue
      const vote = line.votes.get(c)[line.edge]
      if (!best || n > best.n || (n === best.n && vote > best.vote)) best = { n, vote, edge: line.edge, id: `${line.edge}:${line.axis}:${c}` }
    }
    if (best) chosen.set(u, best)
  }
  // (the sets: a column's units of one edge, and a key's units on one baseline)
  const parent = new Map(mine.map(({ u }) => [u, u]))
  const root = u => { while (parent.get(u) !== u) { parent.set(u, parent.get(parent.get(u))); u = parent.get(u) } return u }
  const join = (a, b) => { const x = root(a), y = root(b); if (x !== y) parent.set(x.k < y.k ? y : x, x.k < y.k ? x : y) }
  const firstOf = new Map()
  for (const [u, c] of chosen) { if (firstOf.has(c.id)) join(firstOf.get(c.id), u); else firstOf.set(c.id, u) }
  const unitsByKey = new Map()
  for (const { u } of mine) { const e = evidence[at.get(u)]; (unitsByKey.get(e.key) ?? unitsByKey.set(e.key, []).get(e.key)).push(u) }
  for (const list of unitsByKey.values()) {
    const order = [...list].sort((a, b) => evidence[at.get(a)].t - evidence[at.get(b)].t)
    for (let j = 1; j < order.length; j++) if (Math.abs(evidence[at.get(order[j])].t - evidence[at.get(order[j - 1])].t) <= RUN_DY * order[j].size) join(order[j - 1], order[j])
  }
  const members = new Map()
  for (const { u } of mine) {
    const c = chosen.get(u)
    if (c && c.edge !== u.anchor) { u.anchor = c.edge; stats.aligned++ }
    u.set = root(u).k
    members.set(u.set, (members.get(u.set) ?? 0) + 1)
  }
  for (const n of members.values()) if (n > 1) { stats.sets++; stats.grouped += n }
}

/**
 * Each unit's room on its line (`before`, `after`: PDF units along its direction before its box's start and after its end), the
 * free line a translation longer than its original may take (the owner's rule of 2026-10-29: into free space, never touching
 * other ink, never leaving its figure): the ink its band meets nearest along its baseline (roomOf's `free`: another glyph, a
 * stroke, a fill's edge, an image) less ROOM_CLEAR of its size; never past its figure's extent (pageInk's `figures`, with its
 * figure's glyphs) nor its page's box, where either edge of its band leaves them (spanIn); half the line between it and another unit whose band its own meets (a neighbour's translation may take
 * the other half); ROOM_MAX of its size at most; and short of the band and room of a unit of another direction (each
 * against the other's room as first found: a level label and a turned one never take one place)
 */
function roomsOf(pg, S, mine) {
  if (!mine.length) return
  // (each figure's extent: its boxes', pageInk's, and its glyphs')
  const ext = new Map()
  for (const [key, b] of pg.figures ?? []) ext.set(key, [...b])
  for (const x of S) {
    if (!(x.form || x.picture > 0) || x.blank || x.turned) continue
    const key = `${x.fid}:${x.pid}`, b = ext.get(key), g = x.ink
    if (!b) ext.set(key, [...g])
    else { if (g[0] < b[0]) b[0] = g[0]; if (g[1] < b[1]) b[1] = g[1]; if (g[2] > b[2]) b[2] = g[2]; if (g[3] > b[3]) b[3] = g[3] }
  }
  // (each unit's band on the page, as a box: its neighbours' line against it)
  const boxOf = u => {
    const nx = -u.uy, ny = u.ux, lo = u.descent * u.size, hi = u.ascent * u.size
    const pts = [[0, lo], [u.length, lo], [0, hi], [u.length, hi]].map(([s1, t]) => [u.x + u.ux * s1 + nx * t, u.y + u.uy * s1 + ny * t])
    return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]
  }
  const bands = mine.map(({ u }) => boxOf(u))
  const view = pg.view?.length === 4 ? [Math.min(pg.view[0], pg.view[2]), Math.min(pg.view[1], pg.view[3]), Math.max(pg.view[0], pg.view[2]), Math.max(pg.view[1], pg.view[3])] : null
  // (each unit's band with its room either side, as a page box: what a unit of another direction may take, stopped short of)
  const reachOf = u => {
    const nx = -u.uy, ny = u.ux, lo = u.descent * u.size, hi = u.ascent * u.size
    const pts = [[-u.before, lo], [u.length + u.after, lo], [-u.before, hi], [u.length + u.after, hi]].map(([s1, t]) => [u.x + u.ux * s1 + nx * t, u.y + u.uy * s1 + ny * t])
    return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]
  }
  mine.forEach(({ u, r, free }, i) => {
    const f = { ox: u.x, oy: u.y, ux: u.ux, uy: u.uy }, clear = ROOM_CLEAR * u.size, pad = CROWD_PAD * u.size
    const lo = u.descent * u.size + pad, hi = u.ascent * u.size - pad
    let before = Math.min(ROOM_MAX * u.size, free.before - clear), after = Math.min(ROOM_MAX * u.size, free.after - clear)
    // (its band as far as it stays inside its figure's extent and its page's box, both its edges: a turned label leaves a box
    // where its band crosses the box's side, before its box's corners project there, the review of #490)
    for (const b of [ext.get(`${r.fid}:${r.pid}`), view]) {
      if (!b) continue
      const [s0, s1] = spanIn(u, b)
      before = Math.min(before, -s0); after = Math.min(after, s1 - u.length)
    }
    bands.forEach((b, j) => {
      if (j === i) return
      const o = inFrame(f, b)
      if (o[3] <= lo || o[1] >= hi) return
      if (o[2] <= 0) before = Math.min(before, (-o[2] - clear) / 2)
      else if (o[0] >= u.length) after = Math.min(after, (o[0] - u.length - clear) / 2)
    })
    u.before = Math.max(0, before)
    u.after = Math.max(0, after)
  })
  // (then a unit of another direction: its band with its room, as just found, stops this one's room short of it, and this one's
  // its; each against the other's first finding, so that neither takes the place the other may, the review of #490)
  const first = mine.map(({ u }) => reachOf(u))
  const cut = mine.map(({ u }) => [u.before, u.after])
  mine.forEach(({ u }, i) => {
    const f = { ox: u.x, oy: u.y, ux: u.ux, uy: u.uy }, clear = ROOM_CLEAR * u.size, pad = CROWD_PAD * u.size
    const lo = u.descent * u.size + pad, hi = u.ascent * u.size - pad
    mine.forEach(({ u: v }, j) => {
      if (j === i || Math.abs(u.ux * v.uy - u.uy * v.ux) < 1e-3) return
      const o = inFrame(f, first[j])
      if (o[3] <= lo || o[1] >= hi) return
      // (one across its own box is ink its crowding read, or a band its room already halved: nothing more to cut)
      if (o[2] <= 0) cut[i][0] = Math.min(cut[i][0], Math.max(0, -o[2] - clear))
      else if (o[0] >= u.length) cut[i][1] = Math.min(cut[i][1], Math.max(0, o[0] - u.length - clear))
    })
  })
  mine.forEach(({ u }, i) => { u.before = cut[i][0]; u.after = cut[i][1] })
}

/** a run's text: its glyphs' Unicode (NFKC), a space where two stand SPACE_GAP of their size apart or more (or a blank between) */
function textOf(gs, f) {
  let s = '', end = null
  for (const x of gs) {
    if (x.blank) { if (end !== null) s += ' '; continue }
    const a = along(f, x.ox, x.oy)
    if (end !== null && a - end >= SPACE_GAP * x.size && !s.endsWith(' ')) s += ' '
    s += x.u.normalize('NFKC')
    end = along(f, x.ex, x.ey)
  }
  return s.replace(/\s+/gu, ' ').trim()
}

/** a frame's direction as an angle, degrees anticlockwise from the page's x, to a hundredth */
const angleOf = f => { const a = Math.round((Math.atan2(f.uy, f.ux) * 18000) / Math.PI) / 100; return a === -180 ? 180 : a === 0 ? 0 : a }

/**
 * A unit's room on its page: whether other ink lies inside its box's band (`crowded`), and its anchor (`start`, `centre`, `end`)
 * by the figure's lines right before and after it along its baseline. Other ink: every level glyph not the run's (its outline's
 * box), every turned glyph's box but the run's own, an image's or a shading's box that does not hold the whole band, and a
 * figure's path by its lines where pageInk kept them (`shapes`: a stroke's segments widened by half its line width, a fill's
 * edges; a fill that holds the band, edges clear of it, is its background), else by its box, which a frame or a fill behind the
 * text holds the band within
 */
function roomOf(pg, f, u, own) {
  const G = pg.glyphs ?? [], B = pg.boxes ?? [], S = pg.shapes ?? null
  const mineG = new Set(own.filter(x => !x.turned).map(x => x.i)), mineB = new Set(own.filter(x => x.turned && x.box >= 0).map(x => x.box))
  const pad = CROWD_PAD * u.size
  const band = [pad, u.descent * u.size + pad, u.length - pad, u.ascent * u.size - pad]
  const reach = ANCHOR_REACH * u.size, far = Math.max(reach, (ROOM_MAX + ROOM_CLEAR) * u.size)
  // (the nearest ink right before its box along its baseline and right after it, within the reach: their gaps to the box; and
  // within `far` the free line either side, its room (roomsOf): the ink a translation there would meet, as far as it shows)
  let crowded = false, before = Infinity, after = Infinity, freeBefore = Infinity, freeAfter = Infinity
  // (what may meet its band, its reach or its line, on the page: its frame's box there, a box apart from it no ink of them)
  const nearOf = d => {
    const nx = -u.uy, ny = u.ux, lo = u.descent * u.size, hi = u.ascent * u.size
    const pts = [[-d, lo], [u.length + d, lo], [-d, hi], [u.length + d, hi]].map(([s1, t]) => [u.x + u.ux * s1 + nx * t, u.y + u.uy * s1 + ny * t])
    return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]
  }
  const apartOf = near => (x0, y0, x1, y1) => Math.max(x0, x1) < near[0] || Math.min(x0, x1) > near[2] || Math.max(y0, y1) < near[1] || Math.min(y0, y1) > near[3]
  const apart = apartOf(nearOf(reach)), apartFar = apartOf(nearOf(far))
  /** an extent along the baseline of ink beside the box: where its free line ends */
  const free1 = (a0, a1) => {
    if (a1 <= band[0]) { if (a1 >= -far) freeBefore = Math.min(freeBefore, -a1) }
    else if (a0 >= band[2]) { if (a0 <= u.length + far) freeAfter = Math.min(freeAfter, a0 - u.length) }
  }
  /** an extent along the baseline, of ink across the band: inside the box, or right before or after it (the crowding and the
   *  anchor are read within the reach alone, as they were before the room: the same units are drawn) */
  const along1 = (a0, a1) => {
    if (a1 > band[0] && a0 < band[2]) crowded = true
    else if (a1 <= band[0] && a1 >= -reach) before = Math.min(before, -a1)
    else if (a0 >= band[2] && a0 <= u.length + reach) after = Math.min(after, a0 - u.length)
  }
  for (let g = 0; g < G.length && !crowded; g++) {
    if (mineG.has(g)) continue
    const x = G[g], box = [x.ix0 ?? x.x0, x.bottom, x.ix1 ?? x.x1, x.top]
    if (x.blank || !/\S/u.test(x.u ?? '') || apartFar(...box)) continue
    const e = inFrame(f, box)
    if (e[3] > band[1] && e[1] < band[3]) { if (e[2] > band[0] && e[0] < band[2]) { if (!apart(...box)) crowded = true } else free1(e[0], e[2]) }
  }
  for (let b = 0; b + 3 < B.length && !crowded; b += 4) {
    const box = [B[b], B[b + 1], B[b + 2], B[b + 3]]
    if (apartFar(...box) || mineB.has(b / 4)) continue
    const e = inFrame(f, box)
    if (e[3] <= band[1] || e[1] >= band[3] || e[2] <= -far || e[0] >= u.length + far) continue
    // (the crowding and the anchor by the ink within the reach, as before; the free line by every ink, a path's lines as far as
    // its box shows them: a line its clip cuts off is no ink there)
    const near = !apart(...box) && !(e[2] <= -reach || e[0] >= u.length + reach)
    const shape = S?.get(b / 4)
    if (shape) { shapeRoom(shape, f, band, near ? along1 : null, free1, e); continue }
    const holds = e[0] <= 0 && e[2] >= u.length && e[1] <= u.descent * u.size && e[3] >= u.ascent * u.size
    // (a box behind the whole band is its ground, no ink of its box: a path's, its free line ending a band's height inside its
    // edges, as its lines are not known (a rounded corner, a frame's stroke, past the page's shapes: 2610.21924v1's "ARCHIVE"
    // node); an image's, a shading's or boxes merged, none: their pixels beside the original's box are no ground a translation
    // may take (2602.23285v2's caption over a screenshot))
    if (!holds) { if (near) along1(e[0], e[2]); free1(e[0], e[2]) } else if (!(pg.paths?.[b / 4] >= -1)) { freeBefore = 0; freeAfter = 0 } else {
      const inset = (u.ascent - u.descent) * u.size
      freeBefore = Math.min(freeBefore, Math.max(0, -e[0] - inset)); freeAfter = Math.min(freeAfter, Math.max(0, e[2] - u.length - inset))
    }
  }
  // (set from its start where the ink before it is nearer by half, from its end where the ink after it is: else from its middle)
  const anchor = Math.max(before, 0) * ANCHOR_RATIO < Math.max(after, 0) ? 'start' : Math.max(after, 0) * ANCHOR_RATIO < Math.max(before, 0) ? 'end' : 'centre'
  // (`told`: whether the ink within the reach told the anchor, on either side; none on both is its middle by default)
  return { crowded, anchor, told: Number.isFinite(before) || Number.isFinite(after), before: freeBefore, after: freeAfter }
}

/** a path's lines against a unit's band (in its frame): each segment's part across the band (a stroke's widened by its half
 *  width) told by its extent along it (along1, where given), and that part as far as the path's box `e` shows it, its clip's,
 *  as the free line's end (free1); a fill none of whose edges reach into the band's box and that holds the band's middle is
 *  behind the text, its edges told as the free line's ends alone (a translation stays on its ground) */
function shapeRoom(shape, f, band, along1, free1, e) {
  const { segs, hw } = shape, w = shape.stroke ? hw : 0
  const t0 = band[1] - w, t1 = band[3] + w
  const parts = []
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const as = along(f, segs[i], segs[i + 1]), ts = across(f, segs[i], segs[i + 1]), ae = along(f, segs[i + 2], segs[i + 3]), te = across(f, segs[i + 2], segs[i + 3])
    // (the segment's part with its across inside [t0, t1])
    let lo = 0, hi = 1
    if (ts === te) { if (ts < t0 || ts > t1) continue } else {
      const a = (t0 - ts) / (te - ts), b = (t1 - ts) / (te - ts)
      lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b))
      if (lo > hi) continue
    }
    const p = as + (ae - as) * lo, q = as + (ae - as) * hi
    parts.push([Math.min(p, q) - w, Math.max(p, q) + w])
  }
  const inside = parts.some(([a, b]) => b > band[0] && a < band[2])
  // (to its box within SHOWN_SLACK: its segments are single floats, a rectangle's edge a hair past the box it bounds)
  const shown = (a, b) => { const p = Math.max(a, e[0] - SHOWN_SLACK), q = Math.min(b, e[2] + SHOWN_SLACK); if (p <= q) free1(p, q) }
  // (a ground: its lines where its box shows them, and its box's own edges, where a clip cuts it short of them)
  if (shape.fill && !shape.stroke && !inside && holdsPoint(shape, f, (band[0] + band[2]) / 2, (band[1] + band[3]) / 2)) { for (const [a, b] of parts) shown(a, b); free1(Math.min(e[0], band[0]), Math.min(e[0], band[0])); free1(Math.max(e[2], band[2]), Math.max(e[2], band[2])); return }
  for (const [a, b] of parts) { along1?.(a, b); shown(a, b) }
}

/** whether a fill's closed edges hold a point of a frame (even-odd, as a ray along the frame's direction crosses them) */
function holdsPoint(shape, f, s, t) {
  const { segs } = shape
  let inside = false
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const as = along(f, segs[i], segs[i + 1]), ts = across(f, segs[i], segs[i + 1]), ae = along(f, segs[i + 2], segs[i + 3]), te = across(f, segs[i + 2], segs[i + 3])
    if ((ts > t) !== (te > t) && s < as + ((t - ts) * (ae - as)) / (te - ts)) inside = !inside
  }
  return inside
}
