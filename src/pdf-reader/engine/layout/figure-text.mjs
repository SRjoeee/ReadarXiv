// The text inside a vector figure of our final pass (docs/route/orphan-text.md stage 5, the content class `figures`,
// rules/content-classes.mjs): the labels, axis titles, legends and annotations a figure draws as glyphs, cut into ink units, one
// a label or a line, each translated once on the server as a unit of kind `figure` and drawn in its own run's box by the layer
// (layer-proto/figure-text.mjs), its ink hidden by its own optional-content group (`f<k>`, layout/wrap.mjs). Read in the maker
// child from what it already has: the pages pageInk read (`indices` and `turned`) and own.mjs's ownership. Nothing of arXiv's
// PDF, no layout file, no position estimated: every place is our glyphs'.
//
// Which glyphs: those no unit owns, no blank, inside a figure our compile set —
//   - an included PDF's: shown inside a form XObject (pageInk's `form`; pdfTeX includes a PDF, and an EPS made one, as a form);
//   - a TikZ or pgfplots picture's: between the picture's points `zs` and `ze` (layout/marks.mjs POINTS_TEX, around pgf's
//     \pgfsys@beginpicture and \pgfsys@endpicture, inside the picture's own box: TeX sets its text in our fonts).
// Level and turned alike (a y-axis title set at 90 degrees keeps its turn).
//
// How they are cut (RUN_*): in stream order, a glyph joins the run before it where both are such glyphs, of one font, size,
// colour and direction, on one baseline (within RUN_DY of their size across it), at most RUN_GAP of its size past the run's end
// along it and not back over it; any other glyph between ends the run. A run is a unit when it spells a word (two letters
// together) in a face that is no math face; its text the glyphs' Unicode (NFKC) with a space where two stand apart by
// SPACE_GAP of their size. What it is not, a number, a tick's label, a letter alone, a formula's, stays the original's ink and is
// counted by the ledger as it was.
//
// Each unit's place, in its own frame (its first glyph's origin, along its direction, up across it): its box from its first
// glyph's start to its last glyph's end, its font's band from its descent to its ascent; its anchor, where a translation of
// another length keeps its place — `start` where a figure's line stands right before it along its baseline and none after
// (a legend's line sample), `end` where one stands right after it and none before (a y tick's label against its axis), else
// `centre` (a node's text, an axis title, a box's label: TeX and the plotting programs centre them). A unit whose band meets
// other ink inside its box (a glyph of another run, a stroke that crosses it, an image), but a box that holds the whole band (a
// frame, a node's fill, the plot's own background), is `crowded`: a translation there could cover that ink, so it stays the
// original's.
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
/** the band a translation is drawn in, descent and ascent in em, at the least: a unit is crowded where other ink meets it */
export const DRAW_BAND = Object.freeze([-0.15, 0.88])
/** a unit's band inside its box, shrunk by this share of its size at each edge before other ink is looked for in it (an
 *  antialiased edge, a glyph's side bearing) */
const CROWD_PAD = 0.04
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
const UNREAD = /[-�\p{Cc}]|[\u{F0000}-\u{10FFFF}]/u

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
    out.push({ i: g, turned: false, n: x.n, k: x.k, u: x.u ?? '', blank: !!x.blank || !/\S/u.test(x.u ?? ''), ox: x.x0, oy: x.y, ex: x.x1, ey: x.y, ux: 1, uy: 0, size: x.size, ascent: (x.top - x.y) / Math.max(x.size, 1e-6), descent: (x.bottom - x.y) / Math.max(x.size, 1e-6), font: x.font, fill: x.fill ?? 0, form: !!x.form, picture: d, owner: owners?.[g] ?? null, ink: [x.ix0 ?? x.x0, x.bottom, x.ix1 ?? x.x1, x.top] })
  }
  T.forEach((t, j) => {
    if (!(t.n >= 0)) return
    const picture = depthAtPoint[Math.min(Math.max(t.pt ?? 0, 0), P.length)]
    out.push({ i: j, turned: true, n: t.n, k: t.k, u: t.u ?? '', blank: !!t.blank || !/\S/u.test(t.u ?? ''), ox: t.ox, oy: t.oy, ex: t.ex, ey: t.ey, ux: t.ux, uy: t.uy, size: t.size, ascent: t.ascent, descent: t.descent, font: t.font, fill: t.fill ?? 0, form: !!t.form, picture, owner: null, box: t.box })
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
 * unit's k and `turned[p - 1]` of a turned glyph's; `stats` { units, crowded, letters, runs }
 */
export function figureUnitsOf(pages, own, { unitsPage = FIGURE_UNITS_PAGE, unitsDoc = FIGURE_UNITS_DOC } = {}) {
  const fam = new Map()
  const famOf = name => { let f = fam.get(name); if (f === undefined) { f = classifyFont(name ?? '').fam; fam.set(name, f) } return f }
  const units = [], glyphMaps = [], turnedMaps = []
  const stats = { units: 0, crowded: 0, letters: 0, runs: 0, past: 0 }
  pages.forEach((pg, pi) => {
    const glyphMap = new Map(), turnedMap = new Map()
    glyphMaps.push(glyphMap); turnedMaps.push(turnedMap)
    const S = streamOf(pg, own?.glyphs?.[pi])
    const runs = []
    let run = null
    const close = () => { if (run && run.gs.some(x => !x.blank)) runs.push(run); run = null }
    for (const x of S) {
      const figure = !x.owner && (x.form || x.picture > 0)
      if (!figure) { close(); continue }
      if (run) {
        const f = run.frame, s = along(f, x.ox, x.oy), t = across(f, x.ox, x.oy)
        const joins = x.font === run.font && Math.abs(x.size - run.size) <= 0.01 * run.size && x.fill === run.fill && x.form === run.form
          && Math.abs(x.ux - f.ux) < 1e-3 && Math.abs(x.uy - f.uy) < 1e-3 && Math.abs(t) <= RUN_DY * run.size
          && s >= run.s1 - RUN_BACK * run.size && s - run.s1 <= RUN_GAP * run.size
        if (!joins) close()
      }
      if (!run) {
        if (x.blank) continue
        run = { gs: [], font: x.font, size: x.size, fill: x.fill, form: x.form, s1: 0, frame: { ox: x.ox, oy: x.oy, ux: x.ux, uy: x.uy } }
      }
      run.gs.push(x)
      run.s1 = Math.max(run.s1, along(run.frame, x.ex, x.ey))
    }
    close()
    stats.runs += runs.length
    let onPage = 0
    for (const r of runs) {
      const gs = r.gs.filter(x => !x.blank)
      if (famOf(r.font) === 'math') continue
      const text = textOf(r.gs, r.frame)
      if (!WORD.test(text.normalize('NFKC'))) continue
      if (gs.some(x => UNREAD.test(x.u)) || text.length > FIGURE_TEXT_MAX) continue
      if (onPage >= unitsPage || units.length >= unitsDoc) { stats.past++; continue }
      const f = r.frame, first = gs[0]
      const s0 = 0, s1 = Math.max(...gs.map(x => along(f, x.ex, x.ey)))
      // (its band: its glyphs', at least the line a translation is drawn in, DRAW_BAND: a CJK face's full em)
      const ascent = Math.max(DRAW_BAND[1], ...gs.map(x => x.ascent)), descent = Math.min(DRAW_BAND[0], ...gs.map(x => x.descent))
      const k = units.length
      const u = { k, page: pi + 1, group: figureGroup(k), text, font: r.font, size: r.size, fill: r.fill, angle: angleOf(f), x: first.ox, y: first.oy, ux: f.ux, uy: f.uy, length: s1 - s0, ascent, descent, anchor: 'centre', form: r.form, why: null }
      const room = roomOf(pg, f, u, r.gs)
      u.anchor = room.anchor
      if (room.crowded) { u.why = 'crowded'; stats.crowded++ }
      units.push(u)
      onPage++
      stats.units++
      stats.letters += (text.match(/\p{L}/gu) ?? []).length
      for (const x of r.gs) (x.turned ? turnedMap : glyphMap).set(x.i, k)
    }
  })
  return { units, glyphs: glyphMaps, turned: turnedMaps, stats }
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
  const reach = ANCHOR_REACH * u.size
  let crowded = false, before = false, after = false
  /** an extent along the baseline, of ink across the band: inside the box, or right before or after it */
  const along1 = (a0, a1) => {
    if (a1 > band[0] && a0 < band[2]) crowded = true
    else if (a1 <= band[0] && a1 >= -reach) before = true
    else if (a0 >= band[2] && a0 <= u.length + reach) after = true
  }
  for (let g = 0; g < G.length && !crowded; g++) {
    if (mineG.has(g)) continue
    const x = G[g]
    if (x.blank || !/\S/u.test(x.u ?? '')) continue
    const e = inFrame(f, [x.ix0 ?? x.x0, x.bottom, x.ix1 ?? x.x1, x.top])
    if (e[3] > band[1] && e[1] < band[3] && e[2] > band[0] && e[0] < band[2]) crowded = true
  }
  for (let b = 0; b + 3 < B.length && !crowded; b += 4) {
    if (mineB.has(b / 4)) continue
    const e = inFrame(f, [B[b], B[b + 1], B[b + 2], B[b + 3]])
    if (e[3] <= band[1] || e[1] >= band[3] || e[2] <= -reach || e[0] >= u.length + reach) continue
    const shape = S?.get(b / 4)
    if (shape) { shapeRoom(shape, f, band, along1); continue }
    const holds = e[0] <= 0 && e[2] >= u.length && e[1] <= u.descent * u.size && e[3] >= u.ascent * u.size
    if (!holds) along1(e[0], e[2])
  }
  return { crowded, anchor: before && !after ? 'start' : after && !before ? 'end' : 'centre' }
}

/** a path's lines against a unit's band (in its frame): each segment's part across the band (a stroke's widened by its half
 *  width) told by its extent along it (along1); a fill none of whose edges reach into the band's box and that holds the band's
 *  middle is behind the text, told nothing */
function shapeRoom(shape, f, band, along1) {
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
  if (shape.fill && !shape.stroke && !inside && holdsPoint(shape, f, (band[0] + band[2]) / 2, (band[1] + band[3]) / 2)) return
  for (const [a, b] of parts) along1(a, b)
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
