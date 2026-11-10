// COPIED as it is from src/pdf-reader/engine/layout/figure-text.mjs (abe884b5e), its imports pointed at deps.mjs (today's, copied) and, where
// marked COPY, a turned glyph's owner read where the page states one (streamOf: today's pages own none), and, marked CHANGED, a line of a
// justified paragraph set from its start (setsOf) and a run ended where it goes into or out of a face of one pitch (`fixed`, Rule 1's
// fact): run by locate over arXiv's page (../ink.ts), held equal to today's by
// tests/pdf-reader/locate-ink-today.test.ts. Today's file stays the production prepare's until the cut-over.
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
// How they are cut (RUN_*): in stream order, a glyph joins the run before it where both are such glyphs, of one family (its
// font's name, a subset's tag and its style aside: a plotting program writes one face in several subsets, and a formula's letter
// in the family's italic; no math face), size, colour, direction and figure (one form painted, one picture: pageInk's `fid` and
// `pid`, so that two figures side by side never make one label), on one baseline (within RUN_DY of their size across it), at
// most RUN_GAP of its size past the run's end along it and not back over it by more than RUN_BACK; any other glyph between ends
// the run. TeX's own text in a picture (a glyph of no form, between the picture's points: a TikZ node's, a tcolorbox's that pgf
// draws) is TeX's line: once its run spells a word, a glyph of another face (no math face) or another colour goes on with it, so
// that a label and the address TeX set after it in the link's colour are one unit, and a list of addresses with the commas between
// them (2611.03178v1's abstract box: "Project Page:" and its address were two units, the address left the original's where TeX set
// it, a hole after the label's translation); a symbol TeX set before the first word (an icon) is none of it, and the run after
// it on its line is set from its start where no ink of a figure's tells its anchor: TeX's line runs on from there ("Demo
// Gallery:", its icon wider than its neighbours' and its start off their column, was read centred and drawn an em in). A run is a unit when
// it spells a word (two letters together) in a face
// that is no math face, every glyph of it a character a reader can trust (UNREAD); its text the glyphs' Unicode (NFKC, so that
// a ligature's glyph reads as its letters) with a space where two stand apart by SPACE_GAP of their size.
// What it is not, a number, a tick's label, a letter alone, a formula's, stays the original's ink; so does a run a glyph of which
// is not wholly inside the clip in force (an included figure's viewport cuts off what it does not show: pageInk's `clipped`) or
// inside its page's box, and one a glyph of which stands past BAND_MAX of its size from its baseline (its own ink, level or
// turned): its size is not its glyphs' (OriginLab's Type 3 faces, glyphs of 2048 units an em under a font matrix of 10/2048,
// shown at a size of about 1, stand 7 of it tall), so that a translation drawn at its size would be a tenth of the original,
// and its row's band is one no part's reader takes (layer-proto/figure-rows.mjs checkFigures). A font that gives no Unicode a
// reader can trust leaves its unit the original's too, which the wrap tells from the font's own dict (remove.mjs unicodeOf).
//
// Each unit's place, in its own frame (its first glyph's origin, along its direction, up across it): its box from its first
// glyph's start to its last glyph's end, its band from its descent to its ascent, at least DRAW_BAND (the line a translation is
// drawn in: a CJK face's full em); its anchor, where a translation of another length keeps its place, read from the ink nearest
// it along its baseline within ANCHOR_REACH (a figure's lines by their segments, pageInk's `shapes`; else a box's edges) —
// `start` where the ink before it is nearer by ANCHOR_RATIO (a legend's line sample, an arrow it labels), `end` where the ink
// after it is (a word against its axis), else `centre` (a node's text, an axis title: TeX and the plotting programs centre
// them). A unit whose band meets other ink inside its box — another glyph's, a stroke's segment widened by its half line width,
// a fill's edge, an image's or a shading's box —, but a fill that holds the whole band (a node's fill, the plot's background), is
// `crowded`: a translation there could cover that ink, so it stays the original's. Ink is what the page shows: a glyph wholly
// outside the clip in force and any paint at an alpha of 0 (pageInk's `unseen`) are none, neither a label's nor its crowding, and
// nor is what an opaque fill painted over it before the text covers (pageInk's `opaque`: a gridline under an annotation's box). A
// stroke painted before the text that crosses the band only below its baseline (a gridline under a legend entry's descenders) is
// under the text, as a ground is: it crowds nothing and ends no free line, and the unit carries its depth (`under`): whether a
// translation meets it is told where the translation's faces and size are known, by the layer (figure-fit.mjs).
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
import { BAND_MAX, classifyFont, displayTextMask, PICTURE_END, PICTURE_START, regionMask } from './deps.mjs'

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
/** a font subset's name: a tag of six capital letters and a plus sign before the face's PostScript name (PDF 32000-1 9.6.4) */
const SUBSET_TAG = /^[A-Z]{6}\+/
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
/** the runs that spell a word a page may read as figures' text, at most, and a paper, shown whole or not (past them the rest are
 *  no figure unit, counted) */
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
 * frame: origin (ox, oy), end (ex, ey), direction (ux, uy), size, its band's ascent and descent in em, its own ink up and down
 * from its baseline in em (`up`, `down`: a level glyph's band is its ink; a turned glyph's band is its font's, its ink pageInk's
 * `up` and `down`), its font, fill, whether it is shown in a form, its picture depth, and its owner's group (level glyphs alone
 * are owned: own.mjs reads no turned glyph)
 */
function streamOf(pg, owners) {
  const G = pg.glyphs ?? [], T = pg.turned ?? [], P = pg.pictures ?? []
  // (the picture depth before each level glyph and each point: points stand before the glyph they name)
  const depthAtPoint = new Int32Array(P.length + 1)
  for (let i = 0, d = 0; i < P.length; i++) { depthAtPoint[i] = d; const nm = P[i].name; if (nm === PICTURE_START) d++; else if (nm === PICTURE_END) d = Math.max(0, d - 1); depthAtPoint[i + 1] = d }
  // (each glyph TeX set in a code region, by its points (pageInk's `regions`): its run is no unit, below; and (CHANGED) each one
  // TeX set in a display, the formula's, kept as the paper has it wherever it stands, but what it set there in text mode)
  const code = regionMask(pg.regions, G.length, 'code'), display = regionMask(pg.regions, G.length, 'display'), dtext = displayTextMask(pg.regions, G.length)
  for (let g = 0; g < G.length; g++) if (display[g] && !dtext[g]) code[g] = 1
  const out = []
  let q = 0, d = 0
  for (let g = 0; g < G.length; g++) {
    for (; q < P.length && P[q].glyph <= g; q++) { const nm = P[q].name; if (nm === PICTURE_START) d++; else if (nm === PICTURE_END) d = Math.max(0, d - 1) }
    const x = G[g]
    if (!(x.n >= 0)) continue
    const ascent = (x.top - x.y) / Math.max(x.size, 1e-6), descent = (x.bottom - x.y) / Math.max(x.size, 1e-6)
    out.push({ i: g, turned: false, n: x.n, k: x.k, u: x.u ?? '', blank: !!x.blank || !/\S/u.test(x.u ?? ''), ox: x.x0, oy: x.y, ex: x.x1, ey: x.y, ux: 1, uy: 0, size: x.size, ascent, descent, up: ascent, down: descent, font: x.font, fill: x.fill ?? 0, form: !!x.form, picture: d, owner: owners?.[g] ?? null, ink: [x.ix0 ?? x.x0, x.bottom, x.ix1 ?? x.x1, x.top], clipped: !!x.clipped, unseen: !!x.unseen, code: code[g] === 1, fid: x.fid ?? 0, pid: x.pid ?? 0 })
  }
  // (COPY: a turned glyph's owner where the page states one, `turnedOwners`: today's pages own none, own.mjs reads no turned glyph)
  T.forEach((t, j) => {
    if (!(t.n >= 0)) return
    const picture = depthAtPoint[Math.min(Math.max(t.pt ?? 0, 0), P.length)]
    out.push({ i: j, turned: true, n: t.n, k: t.k, u: t.u ?? '', blank: !!t.blank || !/\S/u.test(t.u ?? ''), ox: t.ox, oy: t.oy, ex: t.ex, ey: t.ey, ux: t.ux, uy: t.uy, size: t.size, ascent: t.ascent, descent: t.descent, up: Number.isFinite(t.up) ? t.up : t.ascent, down: Number.isFinite(t.down) ? t.down : t.descent, font: t.font, fill: t.fill ?? 0, form: !!t.form, picture, owner: pg.turnedOwners?.[j] ?? null, box: t.box, clipped: !!t.clipped, unseen: !!t.unseen, code: false, fid: t.fid ?? 0, pid: t.pid ?? 0 })
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
 * anchor ('start' | 'centre' | 'end'), form, why (null, or 'crowded'), under (the depth under its baseline of the nearest stroke
 * under its text, PDF units, or null: roomOf) }; `glyphs[p - 1]` a Map of a level glyph's index to its
 * unit's k and `turned[p - 1]` of a turned glyph's, and each unit's set and room (setsOf, roomsOf: `set`, its set's first
 * unit's k; `before`, `after`, PDF units); `stats` { units, crowded, letters, runs, past, clipped, outsized, sets, grouped,
 * aligned }
 */
export function figureUnitsOf(pages, own, { unitsPage = FIGURE_UNITS_PAGE, unitsDoc = FIGURE_UNITS_DOC, done = null, fixed = null } = {}) {
  const fam = new Map(), face = new Map()
  const famOf = name => { let f = fam.get(name); if (f === undefined) { f = classifyFont(name ?? '').fam; fam.set(name, f) } return f }
  // (a glyph's face: its font's name, a subset's tag aside. Matplotlib (3.11) writes the characters past its first subset of a
  // face, the minus sign and the ligatures its text shaping sets (ff, fi, fl, ffi), into a second subset of the same face, so that
  // one label switched fonts inside a word: "di" | "ff" | "erence (points)", "Jury" | "−" | "equal-weight pool" were units of their
  // own, the fragments translated as words (2610.21085v1's Figures 3 and 4; 66 labels on 12 of the sweep's 87 papers))
  const faceOf = name => { let f = face.get(name); if (f === undefined) { f = String(name ?? '').replace(SUBSET_TAG, ''); face.set(name, f) } return f }
  // (one label line over the faces of one family: the face's name before its style, the PostScript name's part before its first
  // hyphen (DejaVuSans and DejaVuSans-Oblique, XCharter-Roman and XCharter-Bold), neither a math face. A plotting program sets a
  // formula's letter in the family's italic inside a label ("jury, α = 1": matplotlib's mathtext α in DejaVuSans-Oblique), and a
  // label cut there was a fragment ("jury,") whose room ended at the letter: drawn at 0.66. TeX's math faces are families of
  // their own (CMMI10 against CMR10) and stay apart)
  const familyOf = name => faceOf(name).replace(/-.*$/u, '')
  const oneLine = (a, b) => faceOf(a) === faceOf(b) || (familyOf(a) === familyOf(b) && famOf(a) !== 'math' && famOf(b) !== 'math')
  // (CHANGED: a run goes on over faces and colours, but never into or out of a face of one pitch: `fixed`, the faces the document
  // sets at one pitch (facts.ts fixedFacesOf, read off the glyphs' advances, per font program), which locate gives where Rule 1
  // keeps such text (PDF-READER §18.22). 2610.19159v1's transcript box titles, TeX's lines in pgf's pictures, set a path in
  // typewriter between a title's words: one figure text, the path translated inside the title; its own figure text now, kept)
  const pitchOf = name => !!fixed && fixed.has(faceOf(name))
  // (TeX's own glyph in a picture after a run of TeX's that spells a word: its line goes on over faces and colours, math aside)
  const texLine = (x, run) => run.word && !x.form && !run.form && x.picture > 0 && famOf(x.font) !== 'math' && famOf(run.font) !== 'math'
  const units = [], glyphMaps = [], turnedMaps = []
  // (CHANGED: the ink each crowded unit's band meets, by its k, and its stroke under its text: locate's relation reading judges
  // it, figure-lines.ts, the owner's reformulation of 2026-11-10)
  const met = new Map()
  // (the runs that spell a word the caps have counted, units or not)
  let taken = 0
  const stats = { units: 0, crowded: 0, letters: 0, runs: 0, past: 0, clipped: 0, outsized: 0, sets: 0, grouped: 0, aligned: 0 }
  pages.forEach((pg, pi) => {
    // (the page's text lines a unit's column is read from, made once a page and call, of this call's owners)
    let lines = null
    const glyphMap = new Map(), turnedMap = new Map()
    glyphMaps.push(glyphMap); turnedMaps.push(turnedMap)
    const S = streamOf(pg, own?.glyphs?.[pi])
    const runs = []
    // (`prev`: the run right before in the stream, nothing but white space between, which TeX's line may go on from)
    let run = null, prev = null
    const close = () => { if (run?.gs.some(x => !x.blank)) runs.push(run); if (run) prev = run; run = null }
    for (const x of S) {
      const figure = !x.owner && (x.form || x.picture > 0)
      if (!figure) { close(); prev = null; continue }
      if (run) {
        const f = run.frame, s = along(f, x.ox, x.oy), t = across(f, x.ox, x.oy)
        const tex = texLine(x, run)
        const joins = (oneLine(x.font, run.font) || tex) && pitchOf(x.font) === pitchOf(run.font) && Math.abs(x.size - run.size) <= 0.01 * run.size && (x.fill === run.fill || tex) && x.form === run.form && x.fid === run.fid && x.pid === run.pid
          && Math.abs(x.ux - f.ux) < 1e-3 && Math.abs(x.uy - f.uy) < 1e-3 && Math.abs(t) <= RUN_DY * run.size
          && s >= run.s1 - RUN_BACK * run.size && s - run.s1 <= RUN_GAP * run.size
          // (a code region's edge ends a run: the prose beside the code, in its face on its baseline, is read, and the code alone kept)
          && x.code === run.inCode
        if (!joins) close()
      }
      if (!run) {
        if (x.blank) continue
        // (TeX's line going on from the run before it on its line, which it did not join (a symbol before its first word, an icon;
        // a formula): set from its start, as the line runs on from there)
        const p = prev, pf = p?.frame
        const led = !!p && !x.form && !p.form && x.picture > 0 && x.pid === p.pid && Math.abs(x.ux - pf.ux) < 1e-3 && Math.abs(x.uy - pf.uy) < 1e-3
          && Math.abs(across(pf, x.ox, x.oy)) <= RUN_DY * p.size && along(pf, x.ox, x.oy) >= p.s1 - RUN_BACK * p.size && along(pf, x.ox, x.oy) - p.s1 <= RUN_GAP * p.size
        run = { gs: [], font: x.font, size: x.size, fill: x.fill, form: x.form, fid: x.fid, pid: x.pid, inCode: x.code, s1: 0, frame: { ox: x.ox, oy: x.oy, ux: x.ux, uy: x.uy }, word: false, last: null, led }
        prev = null
      }
      // (whether it spells a word yet: two letters together, no space between, as WORD reads its text)
      if (!x.blank) {
        const letter = /^\p{L}$/u.test((x.u ?? '').normalize('NFKC'))
        const last = run.last
        if (letter && last?.letter && along(run.frame, x.ox, x.oy) - last.s1 < SPACE_GAP * Math.max(x.size, last.size)) run.word = true
        run.last = { letter, s1: along(run.frame, x.ex, x.ey), size: x.size }
      } else run.last = null
      run.gs.push(x)
      if ((x.clipped || x.unseen) && !x.blank) run.clipped = true
      if (x.code && !x.blank) run.code = true
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
      // (the caps count the figures' text the reading takes, every run that spells a word, shown whole or not: what shows of it
      // never moves where they fall. Where the units alone counted, #555's runs no page shows (2610.19159v1's invisible Type 3
      // text over its pp. 2-17's pictures) let the cap fall later, in p67's box, and the lines past it that the ink units had
      // translated became figure units, one of them crowded by its own underscore: English (the sweep of 1e01ce14))
      if (onPage >= unitsPage || taken >= unitsDoc) { stats.past++; continue }
      onPage++
      taken++
      // (a run TeX set in a code region (pageInk's `regions`, marks.mjs regionsTex) is code, kept as the paper has it, never a figure's
      // text, wherever it stands: 2610.19159v1's transcripts, in mdframed boxes TikZ draws, were cut into figure units word by word
      // and translated. Counted under the caps as any run, so that where they fall moves with no judgment of a run's, and a column's
      // edge it tells others as before)
      if (r.code) continue
      // (a run its clip cuts, or its page's edge, whole or in part, or one painted at an alpha of 0, is not shown whole: no text a
      // translation could stand for, and a row whose origin is off its page no part's reader takes, figure-rows.mjs checkFigures)
      if (r.clipped || gs.some(x => offPage(x.ox, x.oy) || offPage(x.ex, x.ey))) { stats.clipped++; continue }
      // (a run a glyph of which stands past BAND_MAX of its size from its baseline is not set at its size: its glyphs are drawn at a
      // scale its size does not tell (2608.08481v1's OriginLab faces, 7 of it tall), a translation drawn at its size would be a
      // tenth of the original, and its row's band no part's reader takes, figure-rows.mjs checkFigures)
      if (gs.some(x => !(x.up <= BAND_MAX && x.down >= -BAND_MAX))) { stats.outsized++; continue }
      const f = r.frame, first = gs[0]
      const s0 = 0, s1 = Math.max(...gs.map(x => along(f, x.ex, x.ey)))
      // (its band: its glyphs', at least the line a translation is drawn in, DRAW_BAND: a CJK face's full em)
      const ascent = Math.max(DRAW_BAND[1], ...gs.map(x => x.ascent)), descent = Math.min(DRAW_BAND[0], ...gs.map(x => x.descent))
      const k = units.length
      const u = { k, page: pi + 1, group: figureGroup(k), text, font: r.font, size: r.size, fill: r.fill, angle: angleOf(f), x: first.ox, y: first.oy, ux: f.ux, uy: f.uy, length: s1 - s0, ascent, descent, anchor: 'centre', form: r.form, why: null }
      const room = roomOf(pg, f, u, r.gs)
      // (the ink beside it within the reach tells its anchor, inside a figure (a line sample, an axis); where none does, TeX's line
      // going on from a run before it is set from its start, and a level line on its column's edge, or centred in it, is set from
      // there, as TeX set it (a heading a class sets in a boxed panel); else its middle; the unit's set below may take its
      // column's edge over either)
      u.anchor = room.told ? room.anchor : r.led ? 'start' : (columnAnchorOf((lines ??= columnLinesOf(pg, own?.glyphs?.[pi])), u) ?? room.anchor)
      // (CHANGED: a crowded unit's met ink and its tones, an uncrowded one's tones under part of it, for the relation reading)
      if (room.crowded) { u.why = 'crowded'; stats.crowded++; met.set(k, { items: [...room.met, ...room.grounds], under: room.under }) }
      else if (room.grounds.length) met.set(k, { items: room.grounds, under: room.under })
      u.under = room.crowded ? null : room.under
      units.push(u)
      mine.push({ u, r, free: room })
      evidence.at(-1).unit = u
      stats.units++
      stats.letters += (text.match(/\p{L}/gu) ?? []).length
      for (const x of r.gs) (x.turned ? turnedMap : glyphMap).set(x.i, k)
    }
    // (the page's units in their columns and sets, then each one's room on its line)
    setsOf(mine, evidence, stats)
    roomsOf(pg, S, mine)
    // (the page read: nothing here reads its shapes again, which a reader may let go, `done`: locate's ink step, lane mem-back)
    done?.(pi)
  })
  return { units, glyphs: glyphMaps, turned: turnedMaps, stats, met }
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
 *  turned off the page's axes, the page's level and upright lines too, as a turned axis's labels end on one level line), and
 *  (CHANGED) its word space (`space`, spaceOf: setsOf's measure). Its size is setsOf's to key (CHANGED: today's keyed it to the
 *  hundredth, see there) */
function edgesOf(r, gs) {
  const f = r.frame, s0 = f.ox * f.ux + f.oy * f.uy, len = Math.max(0, ...gs.map(x => along(f, x.ex, x.ey)))
  const at = s => ({ along: s0 + s, x: f.ox + f.ux * s, y: f.oy + f.uy * s })
  const square = Math.abs(f.ux) < 1e-3 || Math.abs(f.uy) < 1e-3
  return { start: at(0), end: at(len), centre: at(len / 2), t: -f.ox * f.uy + f.oy * f.ux, size: r.size, key: `${r.fid}:${r.pid}:${Math.round(f.ux * 1000)}:${Math.round(f.uy * 1000)}`, axes: square ? AXES.slice(0, 1) : AXES, unit: null, space: spaceOf(f, gs, r.size) }
}

/** (CHANGED) a run's word space: the mean of the gaps between its glyphs past SPACE_GAP of its size, a word's; null where it has
 *  none (one word) */
function spaceOf(f, gs, size) {
  let sum = 0, n = 0
  for (let j = 1; j < gs.length; j++) {
    const gap = along(f, gs[j].ox, gs[j].oy) - along(f, gs[j - 1].ex, gs[j - 1].ey)
    if (gap > SPACE_GAP * size) { sum += gap; n++ }
  }
  return n ? sum / n : null
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
  // (one size as a run is one: within 1 % of the size before it, as glyphs join a run. CHANGED: today's keyed the size to the
  // hundredth, and 2411.13093v4 p18's lines 515 and 527, set at 7.07 pt among their paragraph's 7.06's, made a column of their own)
  {
    const bySize = new Map()
    evidence.forEach((e, i) => (bySize.get(e.key) ?? bySize.set(e.key, []).get(e.key)).push(i))
    for (const [key, list] of bySize) {
      const order = [...list].sort((a, b) => evidence[a].size - evidence[b].size)
      let n = 0
      order.forEach((i, j) => {
        if (j && evidence[i].size - evidence[order[j - 1]].size > 0.01 * evidence[order[j - 1]].size) n++
        evidence[i].key = `${key}:${n}`
      })
    }
  }
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
  // (a paragraph's measure: an end column and a start column along the runs that hold lines in common (its full lines), their
  // word spaces stretched apart to meet both (justified: two of them whose spaces differ past ALIGN_TOL of their size, the
  // tolerance two edges are one by), the end column's other lines all starting inside it (an entry's first line, indented by
  // hand) and the start column's all ending inside it (a paragraph's last line). Its lines were set each from its start, its end
  // no edge a line was set from. Right-aligned labels that share a start too have their spaces as their face sets them, whatever
  // their texts: one ("Population mean" twice, 2610.10492v1), none (2610.20808v1's "pt" "en" "es"), or one each, the one label
  // more letters, the other more spaces (2610.40394v1's "Ordinary Differential Equations" and "History & General Mathematics",
  // 2.348 pt both): no stretch, no measure. 2411.13093v4 p18's full lines' spaces run from 3.96 to 6.36 pt, its unjustified
  // lines' 3.90. CHANGED: today's set a paragraph's indented line, which shares its end and not its start, from its end —
  // 2411.13093v4 p18's prompt, an entry's translated first line flush against the box's right edge, its next line from the left)
  const measured = new Map()
  const isMeasure = (line, c) => {
    if (line.axis !== 'along') return false
    if (measured.has(c)) return measured.get(c)
    const start = lines.find(l => l.edge === 'start' && l.axis === 'along')
    const inEnd = []
    for (let j = 0; j < evidence.length; j++) if (find(line.parent, j) === c) inEnd.push(j)
    const byStart = new Map()
    for (const j of inEnd) { const s = find(start.parent, j); (byStart.get(s) ?? byStart.set(s, []).get(s)).push(j) }
    let yes = false
    for (const [s, full] of byStart) {
      if (full.length === inEnd.length) continue
      const spaces = full.map(j => evidence[j].space).filter(x => x !== null)
      if (!(spaces.length >= 2 && Math.max(...spaces) - Math.min(...spaces) > ALIGN_TOL * evidence[full[0]].size)) continue
      const from = Math.max(...full.map(j => evidence[j].start.along)), to = Math.min(...full.map(j => evidence[j].end.along))
      const indented = inEnd.every(j => find(start.parent, j) === s || evidence[j].start.along > from)
      let short = true
      for (let j = 0; j < evidence.length && short; j++) if (find(start.parent, j) === s && find(line.parent, j) !== c) short = evidence[j].end.along < to
      if (indented && short) { yes = true; break }
    }
    measured.set(c, yes)
    return yes
  }
  const chosen = new Map()
  for (const { u } of mine) {
    const i = at.get(u)
    let best = null
    for (const line of lines) {
      const c = find(line.parent, i), n = line.units.get(c) > 1 ? line.runs.get(c) : 0
      if (n < 2) continue
      const vote = line.votes.get(c)[line.edge]
      if (!best || n > best.n || (n === best.n && vote > best.vote)) best = { n, vote, edge: line.edge, id: `${line.edge}:${line.axis}:${c}`, line, c }
    }
    if (best?.edge === 'end' && isMeasure(best.line, best.c)) best.edge = 'start'
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
 * by the figure's lines right before and after it along its baseline. Other ink, what the page shows (pageInk's `unseen` none of
 * it: a glyph wholly outside the clip in force, any paint at an alpha of 0): every level glyph not the run's (its outline's
 * box), every turned glyph's box but the run's own, an image's or a shading's box that does not hold the whole band, and a
 * figure's path by its lines where pageInk kept them (`shapes`: a stroke's segments widened by half its line width, a fill's
 * edges; a fill that holds the band, edges clear of it, is its background), else by its box, which a frame or a fill behind the
 * text holds the band within. A ground is painted before the text: a fill of known lines that holds the band's middle, an image
 * or a shading over the band painted after it (pageInk's `boxAt`), a card stacked on it, a picture laid over it, covers it, and
 * crowds it. And what an opaque fill painted after it covers is not shown either (pageInk's `opaque`: a gridline under a label's
 * box, the box painted over it and the text on the box): where such a fill, painted before the text, holds the band whole along a
 * stretch (coverOf), the ink painted before it there neither crowds the unit, nor tells its anchor, nor ends its free line
 */
function roomOf(pg, f, u, own) {
  const G = pg.glyphs ?? [], B = pg.boxes ?? [], S = pg.shapes ?? null, U = pg.unseen ?? null, C = pg.cut ?? null
  const mineG = new Set(own.filter(x => !x.turned).map(x => x.i)), mineB = new Set(own.filter(x => x.turned && x.box >= 0).map(x => x.box))
  // (the boxes painted before the run's first glyph, pageInk's `boxAt` (a turned glyph's own box, painted where it is shown): a
  // fill of known lines, an image or a shading from it on that holds the band is painted over the run, never its ground; a box
  // of lines not known, a frame drawn as a ring among them, and an annotation's appearance stay what they were)
  const A = pg.boxAt ?? null
  let over = Infinity
  for (const x of own) if (!x.blank) over = Math.min(over, x.turned ? (x.box >= 0 ? x.box : Infinity) : (A?.[x.i] ?? Infinity))
  const pad = CROWD_PAD * u.size
  const band = [pad, u.descent * u.size + pad, u.length - pad, u.ascent * u.size - pad]
  const reach = ANCHOR_REACH * u.size, far = Math.max(reach, (ROOM_MAX + ROOM_CLEAR) * u.size)
  // (the nearest ink right before its box along its baseline and right after it, within the reach: their gaps to the box; and
  // within `far` the free line either side, its room (roomsOf): the ink a translation there would meet, as far as it shows)
  let crowded = false, before = Infinity, after = Infinity, freeBefore = Infinity, freeAfter = Infinity
  // (CHANGED: each item of ink the band meets, a glyph's index `g` or a box's `b` with its box and its lines where pageInk kept
  // them; the scan goes on past the first, so that a unit the relation reading frees has its room and anchor read whole)
  const met = [], metBox = new Set(), grounds = []
  let atBox = null
  const meet = () => {
    crowded = true
    if (atBox !== null && !metBox.has(atBox.b)) { metBox.add(atBox.b); met.push(atBox) }
  }
  // (the top, across its frame, of the strokes under its text: the depth a translation drawn there must stay above, told by the
  // layer, which knows the translation's faces and size)
  let underTop = -Infinity
  // (what may meet its band, its reach or its line, on the page: its frame's box there, a box apart from it no ink of them)
  const nearOf = d => {
    const nx = -u.uy, ny = u.ux, lo = u.descent * u.size, hi = u.ascent * u.size
    const pts = [[-d, lo], [u.length + d, lo], [-d, hi], [u.length + d, hi]].map(([s1, t]) => [u.x + u.ux * s1 + nx * t, u.y + u.uy * s1 + ny * t])
    return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]
  }
  const apartOf = near => (x0, y0, x1, y1) => Math.max(x0, x1) < near[0] || Math.min(x0, x1) > near[2] || Math.max(y0, y1) < near[1] || Math.min(y0, y1) > near[3]
  const apart = apartOf(nearOf(reach)), apartFar = apartOf(nearOf(far))
  // (the opaque fills painted before the text near it, each with the stretches along its frame over which it holds the band whole
  // as far as its box shows it, in paint order: the ink painted before one there is under it, not shown (2609.26457v1's Figure 2,
  // a plot's gridlines under its annotations' white boxes: "diagnosis before any fix" crowded by the gridline its box hides))
  const covers = []
  if (S) {
    for (let b = 0; b + 3 < B.length && b / 4 < over; b += 4) {
      const shape = S.get(b / 4)
      if (!shape?.opaque || U?.has(b / 4)) continue
      const box = C?.get(b / 4) ?? [B[b], B[b + 1], B[b + 2], B[b + 3]]
      if (apartFar(...box)) continue
      const spans = coverOf(shape, f, band, box)
      if (spans.length) covers.push({ at: b / 4, spans })
    }
  }
  const lastCover = covers.length ? covers[covers.length - 1].at : -1
  /** the parts of an extent along the baseline, of ink painted before box `next`, that no cover painted from `next` on hides */
  const seen = (next, a0, a1) => {
    let parts = [[a0, a1]]
    for (const c of covers) {
      if (c.at < next) continue
      for (const [g0, g1] of c.spans) {
        const out = []
        for (const [p, q] of parts) {
          if (q <= g0 || p >= g1) { out.push([p, q]); continue }
          if (p < g0) out.push([p, g0])
          if (q > g1) out.push([g1, q])
        }
        parts = out
        if (!parts.length) return parts
      }
    }
    return parts
  }
  /** an extent's reader (along1, free1) given the parts of it that show, for ink painted before box `next` */
  const shownBy = (next, fn) => (fn && next <= lastCover ? (a0, a1) => { for (const [p, q] of seen(next, a0, a1)) fn(p, q) } : fn)
  /** an extent along the baseline of ink beside the box: where its free line ends */
  const free1 = (a0, a1) => {
    if (a1 <= band[0]) { if (a1 >= -far) freeBefore = Math.min(freeBefore, -a1) }
    else if (a0 >= band[2]) { if (a0 <= u.length + far) freeAfter = Math.min(freeAfter, a0 - u.length) }
  }
  /** an extent along the baseline, of ink across the band: inside the box, or right before or after it (the crowding and the
   *  anchor are read within the reach alone, as they were before the room: the same units are drawn) */
  const along1 = (a0, a1) => {
    if (a1 > band[0] && a0 < band[2]) meet()
    else if (a1 <= band[0] && a1 >= -reach) before = Math.min(before, -a1)
    else if (a0 >= band[2] && a0 <= u.length + reach) after = Math.min(after, a0 - u.length)
  }
  /** a stroke's part under the text: its top across the frame */
  const under1 = top => { underTop = Math.max(underTop, top) }
  for (let g = 0; g < G.length; g++) {
    if (mineG.has(g)) continue
    const x = G[g], box = [x.ix0 ?? x.x0, x.bottom, x.ix1 ?? x.x1, x.top]
    if (x.blank || x.unseen || !/\S/u.test(x.u ?? '') || apartFar(...box)) continue
    const e = inFrame(f, box)
    if (!(e[3] > band[1] && e[1] < band[3])) continue
    // (painted before a cover that hides it, only the parts of it that show)
    const next = A?.[g] ?? Infinity
    for (const [a0, a1] of next <= lastCover ? seen(next, e[0], e[2]) : [[e[0], e[2]]]) {
      if (a1 > band[0] && a0 < band[2]) { if (!apart(...box)) { crowded = true; if (!met.some(m => m.g === g)) met.push({ g }) } } else free1(a0, a1)
    }
  }
  for (let b = 0; b + 3 < B.length; b += 4) {
    // (a box as far as it shows: the bounds of its transparency groups cut it, pageInk's `cut`)
    const box = C?.get(b / 4) ?? [B[b], B[b + 1], B[b + 2], B[b + 3]]
    if (apartFar(...box) || mineB.has(b / 4) || U?.has(b / 4)) continue
    const e = inFrame(f, box)
    if (e[3] <= band[1] || e[1] >= band[3] || e[2] <= -far || e[0] >= u.length + far) continue
    // (the crowding and the anchor by the ink within the reach, as before; the free line by every ink, a path's lines as far as
    // its box shows them: a line its clip cuts off is no ink there)
    const near = !apart(...box) && !(e[2] <= -reach || e[0] >= u.length + reach)
    const shape = S?.get(b / 4), after = b / 4 >= over
    atBox = { b: b / 4, box: [B[b], B[b + 1], B[b + 2], B[b + 3]], shape: shape ?? null, kind: pg.paths?.[b / 4] }
    // (CHANGED: a tone painted before the text, a fill of no stroke and no pattern an edge of whose box stands inside the text's
    // extent, across its band: a tone under part of it, a highlight under a stretch of its words, which crowds nothing (shapeRoom);
    // recorded for the relation reading (figure-lines.ts), which carries one holding a stretch of its words whole with them)
    if (shape?.fill && !shape.stroke && !shape.pattern && !after && e[1] < band[3] && e[3] > band[1] && e[2] > 0 && e[0] < u.length && (e[0] > 0 || e[2] < u.length))
      grounds.push({ ...atBox, ground: true })
    // (what of it shows: a cover painted after it hides it where it holds the band)
    const next = b / 4 + 1, al = shownBy(next, near ? along1 : null), fr = shownBy(next, free1)
    const un = next <= lastCover ? (top, a0, a1) => { if (seen(next, Math.max(a0, band[0]), Math.min(a1, band[2])).length) under1(top) } : under1
    if (shape) { shapeRoom(shape, f, band, al, fr, e, after, un); continue }
    const kind = pg.paths?.[b / 4]
    const holds = !(after && (kind === -2 || kind === -3)) && e[0] <= 0 && e[2] >= u.length && e[1] <= u.descent * u.size && e[3] >= u.ascent * u.size
    // (a box behind the whole band is its ground, no ink of its box: a path's, its free line ending a band's height inside its
    // edges, as its lines are not known (a rounded corner, a frame's stroke, past the page's shapes: 2610.21924v1's "ARCHIVE"
    // node); an image's, a shading's or boxes merged, none: their pixels beside the original's box are no ground a translation
    // may take (2602.23285v2's caption over a screenshot))
    if (!holds) { al?.(e[0], e[2]); fr(e[0], e[2]) } else if (!(pg.paths?.[b / 4] >= -1)) { freeBefore = 0; freeAfter = 0 } else {
      const inset = (u.ascent - u.descent) * u.size
      freeBefore = Math.min(freeBefore, Math.max(0, -e[0] - inset)); freeAfter = Math.min(freeAfter, Math.max(0, e[2] - u.length - inset))
    }
  }
  // (set from its start where the ink before it is nearer by half, from its end where the ink after it is: else from its middle)
  const anchor = Math.max(before, 0) * ANCHOR_RATIO < Math.max(after, 0) ? 'start' : Math.max(after, 0) * ANCHOR_RATIO < Math.max(before, 0) ? 'end' : 'centre'
  // (`told`: whether the ink within the reach told the anchor, on either side; none on both is its middle by default; `under`, the
  // depth under its baseline of the nearest stroke under its text, PDF units, or null where none is)
  return { crowded, met, grounds: grounds.filter(x => !metBox.has(x.b)), anchor, told: Number.isFinite(before) || Number.isFinite(after), before: freeBefore, after: freeAfter, under: underTop > -Infinity ? -underTop : null }
}

/** a path's lines against a unit's band (in its frame): each segment's part across the band (a stroke's widened by its half
 *  width) told by its extent along it (along1, where given), and that part as far as the path's box `e` shows it, its clip's,
 *  as the free line's end (free1); a fill none of whose edges reach into the band's box and that holds the band's middle is
 *  behind the text, its edges told as the free line's ends alone (a translation stays on its ground), where it was painted
 *  before the text: painted `after` it, it covers the text, ink over the whole band. A fill painted before the text is its
 *  ground whatever its edges: one inside the band is a change of tone under the text and crowds nothing, its parts beside the
 *  box lines beside it; but a fill of a tiling pattern (pageInk's `pattern`), whose hatching is not read, a ground only where it
 *  holds the band, as before. A stroke (no fill) painted before the text whose part across the band, its half width out, lies
 *  wholly below the baseline and, as far as its box shows it, under the text's box is under the text: the original's own
 *  descenders were set over it (2610.21085v1's gridline under "jury, α = 8", the legend's other entry translated). It neither
 *  crowds the text nor ends its free line nor tells its anchor; it is told with its top (under1), so that the layer draws a
 *  translation over it only where the translation's own depth, in its faces at the size it is drawn at, stays above it
 *  (figure-fit.mjs): a CJK translation in its em box clears a gridline a Latin one's descenders cross. Such a part only beside the
 *  box is a line beside it, as any: where a longer translation would stand over it, its free line ends */
function shapeRoom(shape, f, band, along1, free1, e, after = false, under1 = null) {
  const { segs, hw } = shape, w = shape.stroke ? hw : 0
  const t0 = band[1] - w, t1 = band[3] + w
  const under = under1 && shape.stroke && !shape.fill && !after
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
    // (a stroke under the text: its part across the band, widened by its half width, below the baseline, and as far as its box
    // shows it under the text's box; told with its top)
    if (under) {
      const top = Math.max(ts + (te - ts) * lo, ts + (te - ts) * hi) + w
      const a = Math.max(Math.min(p, q) - w, e[0] - SHOWN_SLACK), b = Math.min(Math.max(p, q) + w, e[2] + SHOWN_SLACK)
      if (top < 0 && a <= b && b > band[0] && a < band[2]) { under1(top, a, b); continue }
    }
    parts.push([Math.min(p, q) - w, Math.max(p, q) + w])
  }
  const inside = parts.some(([a, b]) => b > band[0] && a < band[2])
  // (to its box within SHOWN_SLACK: its segments are single floats, a rectangle's edge a hair past the box it bounds)
  const shown = (a, b) => { const p = Math.max(a, e[0] - SHOWN_SLACK), q = Math.min(b, e[2] + SHOWN_SLACK); if (p <= q) free1(p, q) }
  // (a ground: its lines where its box shows them, and its box's own edges, where a clip cuts it short of them)
  const holds = shape.fill && !inside && holdsPoint(shape, f, (band[0] + band[2]) / 2, (band[1] + band[3]) / 2)
  // (painted after the text it covers it as far as its box, its clip's, shows it: its lines uncut may hold the band where its
  // clip leaves none of it)
  if (holds && after) { const a = Math.max(band[0], e[0]), b = Math.min(band[2], e[2]); if (a < b) along1?.(a, b) }
  else if (holds && !shape.stroke) { for (const [a, b] of parts) shown(a, b); free1(Math.min(e[0], band[0]), Math.min(e[0], band[0])); free1(Math.max(e[2], band[2]), Math.max(e[2], band[2])); return }
  // (a fill painted before the text, no stroke, is its ground whatever its edges, as the original was set on it: an edge inside
  // the band is a change of tone under the text, no ink over it, and crowds nothing; beside the box it tells the anchor and ends
  // the free line as any line does, so that a translation stays on its tone)
  // (a tiling pattern's edge crowds as before: what its cells paint inside is not read, a hatching's lines among it)
  const tone = shape.fill && !shape.stroke && !after && !shape.pattern
  for (const [a, b] of parts) {
    if (!tone || b <= band[0] || a >= band[2]) { along1?.(a, b); shown(a, b); continue }
    // (a tone's edge inside the box crowds nothing; its parts before and after the box, a slanted edge's, are lines beside it)
    if (a < band[0]) { along1?.(a, band[0]); shown(a, band[0]) }
    if (b > band[2]) { along1?.(band[2], b); shown(band[2], b) }
  }
}

/** the stretches along a frame over which an opaque fill holds a unit's band whole (`band`, roomOf's: across from band[1] to
 *  band[3]), as far as its box (`box`, its clip's and its groups' bounds) shows it: the band's stretch inside the box, cut at each
 *  of the fill's edges across the band; each piece between two is wholly inside the fill or wholly outside it, its middle telling
 *  which */
function coverOf(shape, f, band, box) {
  const t0 = band[1], t1 = band[3]
  // (the stretch over which both of the band's edges stay inside the box)
  let s0 = -Infinity, s1 = Infinity
  for (const t of [t0, t1]) {
    const px = f.ox - f.uy * t, py = f.oy + f.ux * t
    for (const [p, d, lo, hi] of [[px, f.ux, box[0], box[2]], [py, f.uy, box[1], box[3]]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return []; continue }
      const a = (lo - p) / d, z = (hi - p) / d
      s0 = Math.max(s0, Math.min(a, z)); s1 = Math.min(s1, Math.max(a, z))
    }
  }
  if (!(s1 > s0)) return []
  // (its edges' parts across the band, along the frame)
  const { segs } = shape, cuts = []
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const as = along(f, segs[i], segs[i + 1]), ts = across(f, segs[i], segs[i + 1]), ae = along(f, segs[i + 2], segs[i + 3]), te = across(f, segs[i + 2], segs[i + 3])
    let lo = 0, hi = 1
    if (ts === te) { if (ts < t0 || ts > t1) continue } else {
      const a = (t0 - ts) / (te - ts), b = (t1 - ts) / (te - ts)
      lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b))
      if (lo > hi) continue
    }
    const p = as + (ae - as) * lo, q = as + (ae - as) * hi
    cuts.push([Math.min(p, q), Math.max(p, q)])
  }
  cuts.sort((a, b) => a[0] - b[0])
  const out = [], mid = (t0 + t1) / 2
  const piece = (a, b) => { if (b > a && holdsPoint(shape, f, (a + b) / 2, mid)) out.push([a, b]) }
  let at = s0
  for (const [a, b] of cuts) {
    if (a >= s1) break
    if (a > at) piece(at, a)
    at = Math.max(at, b)
  }
  if (at < s1) piece(at, s1)
  return out
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
