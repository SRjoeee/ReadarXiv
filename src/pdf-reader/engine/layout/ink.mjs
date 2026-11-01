// arXiv's ink, for the layout maker (Plan 8b, Task 5; the layout research of 2026-10-06): every glyph of a page of
// arXiv's PDF placed as PDF.js's canvas places it, and the page's graphics as boxes, read from the page's operator list
// (page.getOperatorList(): fnArray, argsArray). The text layer gives a run's box only, its characters an even share of
// its width; the canvas places each glyph by its own width, which is where the layer erases and what a placeholder's
// rendering is cut from. Pure arithmetic on the list, in the page's user space (unrotated, y up, PDF units).
//
// What the canvas does (pdfjs-dist 6.3.289, display/canvas.js) and this follows: the graphics state's stack (save,
// restore, transform; a form XObject's matrix and box; a group; an annotation's own space), the text state (font and
// size, character and word spacing, horizontal scale, rise, leading, render mode), the text matrix and its line moves.
// In PDF.js 6 the evaluator gives every text-showing operator as showText (TJ's numbers inside its array), a text
// matrix as one argument, and a path as one constructPath ([painting op, data, minMax], minMax its box in the path's
// own space). arXiv's PDF is untrusted: no more than OPS_CAP operations and STEPS_MAX steps are read, the graphics
// state's stack holds no more than STACK_MAX copies (a level past it holds none, and ink placed in a state it lost caps the
// page), a reader that asks keeps no more than GLYPHS_PAGE glyphs and BOXES_PAGE boxes
// one by one (the boxes past it merged, below), INK_MS is the walk's backstop, a matrix or a number that is not one places
// nothing, and nothing here throws on a malformed list. Each bound is an abuse guard, twenty times or more above the
// corpus's heaviest page (the census of 2026-10-16: the 2,793 pages of the 124 papers of data/corpus, read by the pinned
// PDF.js on the lite worker), and every one of those pages is read under them exactly as under none: no real page meets one.
// Imports nothing: the maker runs it in a Worker or in Node alike.

/** the operations read on a page at most; past it the page is capped (its reader gives it no ink). The corpus's busiest
 *  page holds 146,115 (2608.12606 page 5: 17,903 paths, each with its save, transform, colour, width and restore; the next
 *  102,052, and 6 pages of 2,793 more than 50,000); this is 20.5 times that. It bounds the walk, not the page: the walk
 *  sees a list PDF.js has built whole, and the list is the dearer. A painted path is some 580 bytes of it (`re f`; a
 *  plot's mix 150 an operation), so a page of paths fills the server's 768 MiB at some 1,300,000 of them, long before
 *  this (still 58 times the corpus's most, 22,381 paths a page), and 25,000 saves left open cost PDF.js's parse 19 s (it grows
 *  with their square: 100,000, 299 s). A true bound a page is the list given up in flight (make.mjs giveUp, past OPS_MS),
 *  which the walk cannot be */
export const OPS_CAP = 3_000_000
/** the glyphs a page's ink holds at most, where its reader asks (`glyphsMax`): one text-showing operation may show any
 *  number of glyphs, so OPS_CAP alone does not bound a page's ink. A page past it is capped as one past OPS_CAP is: no ink,
 *  that page alone. The densest page of the corpus's arXiv PDFs holds a few thousand */
export const GLYPHS_PAGE = 100_000
/** the steps a page's walk takes at most (`stepsMax`): an operation, each element of a shown array (a glyph, a number), each
 *  box placed (a path's, an image's or each of its placements, a shading's, a glyph set turned), each entry of a graphics
 *  state, each cell a merged box meets. Past it reading stops and the page is capped: the walk's own bound, counted, so that
 *  a page is read alike on every machine (OPS_CAP alone does not bound it: one operation may carry any number of glyphs,
 *  numbers or placements). The corpus's busiest page takes 173,861 (2608.12606 page 5; the gate's 30 outputs 22,639 at
 *  most); this is 28.8 times that. On a laptop the dearest kinds reach it in 0.3 to 0.6 s (a painted path merged, an
 *  image's placements); a page of the corpus walks at 310 ns a step at worst */
export const STEPS_MAX = 5_000_000
/** the boxes a page's ink keeps one by one at most where its reader asks (`boxesMax`), every box it holds counted: past it
 *  each further box, of whatever kind (a path's, an image's or one of its placements, a shading's, a glyph set turned), is
 *  merged into the cells of a grid it meets (TILE), and the page is `degraded`. What the maker holds of a page's boxes is
 *  so bounded whatever the page: some 140 bytes a box in all (the walk's 4 numbers and kind, the maker's own array of
 *  them), 65 MB at the budget and its 4,096 cells. The corpus's most: 22,101 boxes (2608.27728 page 15); this is 22.6
 *  times that */
export const BOXES_PAGE = 500_000
/** the boxes a page's ink holds at most, whatever its reader: one operation may place any number of them (a repeat or a group
 *  of images, which PDF.js's own list for getOperatorList never holds, its queue optimiser being off for it, but a list from
 *  elsewhere may; a text-showing operation's glyphs set turned, a box each), so OPS_CAP alone does not bound them. A page past
 *  it is capped as one past OPS_CAP is: no ink, that page alone. A reader that asks for BOXES_PAGE never meets it (its boxes
 *  past the budget are merged, 4,096 at most); the corpus's most is 22,101 boxes (2608.27728 page 15) */
export const BOXES_CAP = 1_000_000
/** the walk's backstop (`msMax`), in milliseconds: past it reading stops and the page is `timedOut` (its reader gives it no
 *  ink, and says so apart from a list that never came). STEPS_MAX is the walk's bound; this is for a machine far slower
 *  than the one it was measured on, and only there does it act: a page timed out on one machine and read on another, the
 *  one bound that depends on the machine, and safe (dark: its units the original's). The corpus's slowest page walks in
 *  15 to 18 ms on a laptop, the dearest list to STEPS_MAX in 0.6 s; this is 100 times the one and 3 times the other. The
 *  clock is read once every CLOCK_EVERY steps */
export const INK_MS = 2_000
/** the graphics state's levels that hold a copy of it at most (a save, a form, a group, an annotation each push one; a copy
 *  some 177 bytes: 3,000,000 saves unrestored held 530 MB). Past it a level holds none: its save changes nothing, and the
 *  walk goes on exactly; its restore cannot give back the state of its save, and ink placed before a restore reaches a level
 *  that holds a copy caps the page (pageInk's `lost`), so a page is read exactly or not at all. The census of 2026-10-17 (the
 *  127 papers of data/corpus and the gate's pack, 2,836 pages, by the pinned PDF.js): the deepest 27 (2608.04183 page 15),
 *  then 26 and 19, the median paper's deepest 6; and no page leaves a save open at its list's end. This is 37 times that */
export const STACK_MAX = 1_000
/** a degraded page's grid: cells of TILE points from the page's origin, TILES across and up (1,536 points), the
 *  outermost reaching on past the grid (a box beyond it lands there). A merged box is the union of the parts of the boxes
 *  past the budget that lie in its cell: every one of their points is in a merged box, none is more than a cell from one of
 *  them, and the cells are 4,096 at most. A page larger than the grid (a poster), or set far from the origin, has its
 *  outer cells' boxes coarser: they cover more than the ink, which is safe (kept ink where there is none) */
const TILE = 24, TILES = 64
/** a merged box's kind in `paths` (beside -1 to -4): no path of the page's own, so that nothing removes or owns it */
export const MERGED = -5
/** the walk's steps (STEPS_MAX's) between two readings of the clock */
const CLOCK_EVERY = 1024
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** where a font gives no ascent or descent (an old Type 3 font gives none worth reading), as anchors.mjs reads them */
const ASCENT = 0.75, DESCENT = -0.22
/** a glyph's run counts as level when its rise across is under this share of its advance */
const LEVEL = 1e-3
/** a turned glyph's axes meet square within this share (a cosine): a shear past it is no turn (pageInk's `turned`) */
const TURN_SKEW = 0.02
/** a TikZ picture's points (layout/marks.mjs POINTS_TEX, around pgf's picture): a figure's text and lines lie between them */
export const PICTURE_START = 'zs', PICTURE_END = 'ze'
/** a figure's curve as this many chords (`turned`'s shapes), and the numbers a page's shapes hold at most */
const CURVE_STEPS = 8, SHAPE_NUMBERS_PAGE = 1_000_000
const FONT_MATRIX = [0.001, 0, 0, 0.001, 0, 0]
/** a matrix that was not one: everything under it is placed nowhere (each number it gives is not finite) */
const BROKEN = Object.freeze([Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN])
const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0])

const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
/** six numbers from an argument (an array or a typed array), else BROKEN */
function matrixOf(v) {
  if (!v || typeof v !== 'object' || !(v.length >= 6)) return BROKEN
  const m = [v[0], v[1], v[2], v[3], v[4], v[5]]
  return m.every(x => typeof x === 'number') ? m : BROKEN
}
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const finite = (...xs) => xs.every(Number.isFinite)

/** a fresh graphics state: the page's own, or an annotation's. `fill`: the fill colour, 0xRRGGBB (PDF's default black, 0), or
 *  NO_FILL for one of no colour (a pattern, PDF.js's transparent) */
const fresh = () => ({
  ctm: IDENTITY, clip: null, lw: 1, font: null, fontId: '', size: 0, dir: 1, cs: 0, ws: 0, hs: 1, rise: 0, leading: 0, tr: 0,
  tm: IDENTITY, x: 0, y: 0, lx: 0, ly: 0, pendingClip: false, lost: false, fill: 0, form: 0, formId: 0,
})
/** a glyph's fill of no colour (a pattern's, PDF.js's transparent) */
export const NO_FILL = -1
/** a fill colour as PDF.js's operator list gives it, every colour space turned to RGB (setFillRGBColor: '#rrggbb'), as
 *  0xRRGGBB; NO_FILL for anything else */
const fillOf = a => (typeof a?.[0] === 'string' && /^#[0-9a-f]{6}$/i.test(a[0]) ? Number.parseInt(a[0].slice(1), 16) : NO_FILL)

/**
 * A glyph's own ink in em, [x0, y0, x1, y1] from its origin, y up: the extremes of its outline, as PDF.js gives it where
 * it draws glyphs as paths (`<font's loadedName>_path_<fontChar>` in the common objects, a FontPathInfo: in Node, where
 * the font face is disabled by default, or wherever the document is opened with `disableFontFace`; Float32 whatever the runtime
 * where the host made it so, layout/pdf-lite.mjs float32Outlines). The outline's points
 * and its curves' control points bound it, and a font's outline has a point at each extreme (TrueType's and CFF's own
 * rule), so the box is its ink. [] for a glyph of no outline (a space drawn); null where no outline is given (a Type 3
 * font, the browser's default): the font's declared ascent and descent then
 */
export function outlineBox(commonObjs, font, fontChar) {
  if (!font || typeof font.loadedName !== 'string' || typeof fontChar !== 'string' || typeof commonObjs?.has !== 'function') return null
  const id = `${font.loadedName}_path_${fontChar}`
  let path = null
  try { if (commonObjs.has(id)) path = commonObjs.get(id)?.path } catch { return null }
  // DrawOPS: moveTo 0 and lineTo 1 a point, curveTo 2 three, quadraticCurveTo 3 two, closePath 4 none
  return pointsBox(path)
}

/** a Type 3 glyph's procedure's steps read at most (type3Box): matplotlib's glyphs are a width and one path, a bitmap font's a
 *  width, a matrix and an image; past it the glyph is read as one of no procedure (its font's ascent and descent) */
const TYPE3_OPS = 512
/** each Type 3 font's glyph boxes by procedure (type3Box), read once a font */
const type3Boxes = new WeakMap()
/**
 * A Type 3 glyph's own ink in em, [x0, y0, x1, y1] from its origin, y up, as outlineBox gives an outline's (#122-1: every glyph
 * of a font was boxed alike, its declared ascent and descent, a "." as an "M"): the extent of what its char procedure paints
 * (PDF.js's `charProcOperatorList` for the glyph's `operatorListId`, as the canvas runs it: each painted path's box, a
 * stroke's widened by half its line width, each image's unit square, through the procedure's own transforms), carried
 * through the font's matrix. [] for a procedure that paints nothing (a space); null where it cannot be read whole (no
 * procedure, one past TYPE3_OPS steps, or one holding any operation but a path, an image and those that paint nothing
 * (QUIET_NAMES): text shown, a shading, a form, a group, whose extent is not read here):
 * the font's ascent and descent then, as before. Never the FontBBox, which bounds every glyph of the font. Read once a font
 * and glyph; nothing is rendered
 */
export function type3Box(OPS, font, id) {
  if (font?.isType3Font !== true || id === undefined || id === null) return null
  let m = type3Boxes.get(font)
  if (!m) type3Boxes.set(font, (m = new Map()))
  if (!m.has(id)) m.set(id, procBox(OPS, font, id))
  return m.get(id)
}
function procBox(OPS, font, id) {
  const procs = font.charProcOperatorList, proc = procs instanceof Map ? procs.get(id) : procs?.[id]
  const fns = proc?.fnArray, args = proc?.argsArray
  if (!fns || typeof fns.length !== 'number' || fns.length > TYPE3_OPS) return null
  const fm = matrixOf(font.fontMatrix)
  if (fm === BROKEN) return null
  const STROKES = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])
  const PAINTS = new Set([...STROKES, OPS.fill, OPS.eoFill])
  const IMAGES = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintSolidColorImageMask])
  const QUIET = quietOps(OPS)
  let ctm = fm, lw = 1, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const stack = []
  const add = (m, a0, b0, a1, b1) => {
    for (const [x, y] of [[a0, b0], [a1, b0], [a0, b1], [a1, b1]]) {
      const X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5]
      if (!finite(X, Y)) return false
      if (X < x0) x0 = X
      if (X > x1) x1 = X
      if (Y < y0) y0 = Y
      if (Y > y1) y1 = Y
    }
    return true
  }
  for (let j = 0; j < fns.length; j++) {
    const fn = fns[j], a = args?.[j] ?? []
    if (QUIET.has(fn)) continue
    if (fn === OPS.save) { if (stack.length >= STACK_MAX) return null; stack.push([ctm, lw]) }
    else if (fn === OPS.restore) { const t = stack.pop(); if (t) [ctm, lw] = t }
    else if (fn === OPS.transform) { ctm = mul(ctm, matrixOf(a)); if (ctm.some(v => !Number.isFinite(v))) return null }
    else if (fn === OPS.setLineWidth) lw = num(a[0])
    else if (fn === OPS.setGState) { for (const e of Array.isArray(a[0]) ? a[0] : []) if (Array.isArray(e) && e[0] === 'LW') lw = num(e[1]) }
    else if (fn === OPS.constructPath) {
      const op = a[0], mm = a[2]
      // (a bitmap glyph's image mask, which PDF.js compiles into a path of its ink's outline in the image's unit square
      // (rawFillPath; its minMax is the bitmap's size in pixels, no box of the path's): the path's own points)
      if (op === OPS.rawFillPath) { const b = pointsBox(a[1]?.[0]); if (!b || (b.length === 4 && !add(ctm, b[0], b[1], b[2], b[3]))) return null; continue }
      if (!PAINTS.has(op)) continue
      if (!(mm && mm.length >= 4 && finite(mm[0], mm[1], mm[2], mm[3]) && mm[2] >= mm[0] && mm[3] >= mm[1])) return null
      const e = STROKES.has(op) ? lw / 2 : 0
      if (!add(ctm, mm[0] - e, mm[1] - e, mm[2] + e, mm[3] + e)) return null
    } else if (IMAGES.has(fn)) { if (!add(ctm, 0, 0, 1, 1)) return null }
    // (anything else — text shown, a shading, a form, a group, a repeat, an operation PDF.js may add — is not read here)
    else return null
  }
  return x0 <= x1 ? [x0, y0, x1, y1] : []
}
/** the operations a char procedure may hold that paint nothing and change no extent type3Box reads: the line's style, a
 *  colour, a clip (which only cuts ink), the glyph's width, the text state with nothing shown, a mark; by name, once a table */
const QUIET_NAMES = ['dependency', 'setLineCap', 'setLineJoin', 'setMiterLimit', 'setDash', 'setRenderingIntent', 'setFlatness', 'endPath', 'clip', 'eoClip', 'beginText', 'endText', 'setCharSpacing', 'setWordSpacing', 'setHScale', 'setLeading', 'setFont', 'setTextRenderingMode', 'setTextRise', 'moveText', 'setLeadingMoveText', 'setTextMatrix', 'nextLine', 'setCharWidth', 'setCharWidthAndBounds', 'setStrokeColorSpace', 'setFillColorSpace', 'setStrokeColor', 'setStrokeColorN', 'setFillColor', 'setFillColorN', 'setStrokeGray', 'setFillGray', 'setStrokeRGBColor', 'setFillRGBColor', 'setStrokeCMYKColor', 'setFillCMYKColor', 'markPoint', 'markPointProps', 'beginMarkedContent', 'beginMarkedContentProps', 'endMarkedContent', 'beginCompat', 'endCompat', 'setStrokeTransparent', 'setFillTransparent']
const quietTables = new WeakMap()
function quietOps(OPS) {
  let q = quietTables.get(OPS)
  if (!q) quietTables.set(OPS, (q = new Set(QUIET_NAMES.map(n => OPS[n]).filter(v => v !== undefined))))
  return q
}

/** the box of a path's points (PDF.js's DrawOPS, as outlineBox reads them): [x0, y0, x1, y1], [] for none, null where it is no
 *  such path */
function pointsBox(path) {
  if (!path || typeof path.length !== 'number') return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < path.length;) {
    const op = path[i++], k = op === 0 || op === 1 ? 2 : op === 2 ? 6 : op === 3 ? 4 : op === 4 ? 0 : -1
    if (k < 0 || i + k > path.length) return null
    for (let q = 0; q < k; q += 2) {
      const x = path[i + q], y = path[i + q + 1]
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
    i += k
  }
  return x0 <= x1 ? [x0, y0, x1, y1] : []
}

/** a glyph's key in an outline table: its font's PostScript name, its character as PDF.js maps it and its advance, as
 *  PDF.js gives them alike in Node and in the browser (its Unicode is not: a symbol font's glyph is blank in one and a
 *  private-use character in the other). A name alone is not one font: a long paper embeds one subset several times, each
 *  its own encoding (2307.16209's TeX Gyre Pagella, 546 characters that met another's; by character and advance, 51,
 *  whose boxes the table joins) */
export const outlineKey = (font, fontId, g) => `${typeof font?.name === 'string' && font.name ? font.name : fontId}|${g.fontChar}|${Math.round(1000 * (Number(g.width) || 0))}`

/**
 * An outline table as the reader is sent it: { [font]: [char, x0, y0, x1, y1, …] } with each box in thousandths of an em
 * (a glyph of no outline, [], as four zeros and a flag: x0 > x1), from pageInk's `collect`; and back (readOutlines) to
 * the Map pageInk's `outlines` takes. Rounded outwards, so that a box never cuts its glyph's ink
 */
export function outlineTable(collected) {
  const out = {}
  for (const [key, box] of collected) {
    // (a PostScript name holds no '|'; the rest of the key may)
    const at = key.indexOf('|'), font = key.slice(0, at), ch = key.slice(at + 1)
    const row = (out[font] ??= [])
    if (box.length === 4) row.push(ch, Math.floor(1000 * box[0]), Math.floor(1000 * box[1]), Math.ceil(1000 * box[2]), Math.ceil(1000 * box[3]))
    else row.push(ch, 1, 0, 0, 0)
  }
  return out
}
export function readOutlines(table) {
  const out = new Map()
  for (const [font, row] of Object.entries(table ?? {})) {
    if (!Array.isArray(row)) continue
    for (let i = 0; i + 4 < row.length; i += 5) {
      const [x0, y0, x1, y1] = [row[i + 1], row[i + 2], row[i + 3], row[i + 4]].map(v => v / 1000)
      out.set(`${font}|${row[i]}`, x0 > x1 ? [] : [x0, y0, x1, y1])
    }
  }
  return out
}

/** a point of the marked compile (layout/marks.mjs LAYOUT_TEX's \\axt@point): a rendering intent, `/axt-<name> ri`,
 *  which PDF.js keeps in the operator list with its name (it drops marked-content points, DP and MP) and which its text
 *  layer passes over. The name: a mark's, or a bracket's (bs, be, fs, fe and a number) */
const POINT = /^axt-([A-Za-z0-9.-]{1,64})$/
/** a paragraph's point (marks.mjs POINTS_TEX: `q<n>` at LaTeX's para/begin): kept apart (`paras`), so that no reader of the marks
 *  meets it among their points; the ledger reads it (layout/ledger.mjs) */
export const PARA_POINT = /^q\d+$/

/**
 * A page's ink: { glyphs, boxes, points, boxAt, capped, timedOut, degraded, mergedAt, rotated }. `glyphs`: each glyph
 * shown with a Unicode string, upright and painted (render mode not 3 or 7), as a Glyph, whatever its Unicode: a symbolic font's glyph that PDF.js
 * gives a blank one (txexs's big left parenthesis is its code 32) is ink to erase and to draw; a vertical font's glyphs
 * are passed over, a glyph set rotated or mirrored is a box of its em instead (it has no baseline across the page). A
 * glyph's `top` and `bottom`, and its ink across (`ix0`, `ix1`), are its own outline's (outlineBox) where PDF.js gives it:
 * a font's declared descent is no glyph's (CMSY10 declares 0.96 em, a line and more below its baseline; Pagella's
 * descenders reach past its declared 0.156 em); else its font's declared ascent and descent, and its advance.
 * `boxes`: x0, y0, x1, y1 (stride 4) for each image placed, each path painted (a stroke's widened by half the line
 * width; a clip paints nothing), each shading painted into a clip, and those glyphs; each cut to the clip in force (a
 * form's box, a clipping path), and one wholly outside it left out. Glyphs and boxes in the order the content stream
 * shows them; `points`: each point of the marked compile (POINT), { name, glyph, box }, the glyphs and the boxes shown
 * before it; `boxAt`: for each glyph, the boxes shown before it. On arXiv's PDF the points are nobody's. `capped`: the
 * list held more than OPS_CAP operations, the walk took more than `stepsMax` steps (STEPS_MAX), (`glyphsMax`) the page
 * showed more glyphs than that, ink was to be placed in a state a restore past STACK_MAX could not give back, or it kept
 * more than BOXES_CAP boxes, and reading stopped there, within the operation (a stack deeper than STACK_MAX alone caps
 * nothing: saves left open are read on exactly). `timedOut`: the walk
 * passed `msMax` (INK_MS, the backstop), and reading stopped there. A reader gives a page capped or timed out no ink.
 * `rotated`: the page's /Rotate is not 0, and nothing is read (the layer lays over no rotated page).
 * `boxesMax` (BOXES_PAGE where a reader asks; none by default): the boxes past it, of every kind, are not kept one by one
 * but merged by the grid's cells (TILE), after the others and in the cells' order (from `mergedAt`, the first merged box's
 * index; null on a page not degraded), each of kind MERGED in `paths` (no path's index), and the page is `degraded`. The
 * glyphs are read in full whatever the boxes, the boxes before the budget and every path's index stay what they are, and
 * a merged box covers all the ink it stands for: so a degraded page's text is placed and removed as ever, and the ink past
 * the budget is kept (never owned, never removed: kept ink where a unit's rectangle meets it) and met where it lies, to a
 * cell. A merged box is no box of any one rule, and its reader must take it as none (the layout maker marks them taken,
 * make.mjs glyphsOf): so a placeholder whose rule lies past the budget is LOST, a line's rule there is not the line's, a
 * cell's rule there is not among its rules
 * `indices` (the text remover's, layout/remove.mjs): each glyph also carries where the content stream shows it: `n`, its
 * text-showing operation's place among the page's own (an annotation's appearance not counted: -1 there), and `k`, its
 * place among that operation's glyphs, `blank: true` where its Unicode is blank, and `form: true` where it is shown inside a
 * form XObject (an included PDF's, the ledger's figures: layout/ledger.mjs); and `paths` gives, for each box,
 * its path's place among the page's own painted paths (constructPath), or its kind: -1 a path of an annotation's
 * appearance, -2 a shading, -3 an image, -4 a glyph set rotated or mirrored; and `shows` counts the page's own
 * text-showing operations. Off, the answer is the maker's, unchanged.
 * `outlines` (the text removal's, the reader's side): the outline boxes of the paper's glyphs by font and character
 * (outlineTable's, made where PDF.js gives the outlines: in Node), for a glyph whose outline this reading has not (the
 * browser draws a font as a font face, and gives no outline): its box is then the server's, exactly. `collect`: a Map
 * this reading's outline boxes are added to, by outlineKey
 * `glyphsOnly` (the reader's live fills, layer-proto/run.mjs liveFillsOf): the glyphs alone, as a whole walk places them (their
 * text, place, size and fill: layout/fills.mjs reads no more), with no box, path, image or outline read: `boxes` empty, a
 * glyph's outline its line's
 */
export function pageInk(OPS, ops, commonObjs, { rotate, indices = false, outlines: given = null, collect = null, glyphsMax = Infinity, boxesMax = Infinity, stepsMax = STEPS_MAX, msMax = INK_MS, glyphsOnly = false, turned = false }) {
  const turn = (((Number(rotate) % 360) + 360) % 360)
  if (turn !== 0) return { glyphs: [], boxes: [], points: [], boxAt: [], ...(indices ? { paths: [], shows: 0 } : {}), ...(turned ? { turned: [], shapes: new Map(), pictures: [], figures: new Map() } : {}), capped: false, timedOut: false, degraded: false, mergedAt: null, rotated: true }
  const fnArray = ops?.fnArray ?? [], argsArray = ops?.argsArray ?? []
  const n = Math.min(fnArray.length, OPS_CAP)
  const glyphs = [], boxes = [], points = [], boxAt = [], paths = [], paras = [], turnedOut = [], pictures = []
  // (the guards: reading stops once `stop` is set: `over` past glyphsMax, `deep` ink placed in a state past STACK_MAX not
  // kept, `many` past stepsMax, the three caps; `late` past msMax, the backstop. The clock is read once every CLOCK_EVERY steps)
  let stop = false, over = false, deep = false, many = false, late = false, steps = 0, check = CLOCK_EVERY
  const t0 = clock()
  const step = k => {
    steps += k
    if (steps > stepsMax) { many = true; stop = true; return }
    if (steps < check) return
    check = steps + CLOCK_EVERY
    if (clock() - t0 > msMax) { late = true; stop = true }
  }
  // (the boxes past `boxesMax`: each cell's union, x0 y0 x1 y1, NaN until a part lands there; made at the first)
  const keep = typeof boxesMax === 'number' && boxesMax >= 0 ? Math.floor(boxesMax) : Infinity
  let tiles = null
  const cellOf = v => Math.min(TILES - 1, Math.max(0, Math.floor(v / TILE)))
  /** a box past the budget, its part in each cell it meets merged into that cell's union */
  const merge = (x0, y0, x1, y1) => {
    tiles ??= new Float64Array(4 * TILES * TILES).fill(Number.NaN)
    const cx0 = cellOf(x0), cx1 = cellOf(x1), cy0 = cellOf(y0), cy1 = cellOf(y1)
    for (let cy = cy0; cy <= cy1 && !stop; cy++) {
      // (a part's edge where the box goes on into the next cell; the outermost cells reach on past the grid)
      const py0 = cy === cy0 ? y0 : cy * TILE, py1 = cy === cy1 ? y1 : (cy + 1) * TILE
      for (let cx = cx0; cx <= cx1; cx++) {
        const px0 = cx === cx0 ? x0 : cx * TILE, px1 = cx === cx1 ? x1 : (cx + 1) * TILE
        const o = 4 * (cy * TILES + cx)
        if (Number.isNaN(tiles[o])) { tiles[o] = px0; tiles[o + 1] = py0; tiles[o + 2] = px1; tiles[o + 3] = py1 }
        else { if (px0 < tiles[o]) tiles[o] = px0; if (py0 < tiles[o + 1]) tiles[o + 1] = py0; if (px1 > tiles[o + 2]) tiles[o + 2] = px1; if (py1 > tiles[o + 3]) tiles[o + 3] = py1 }
      }
      step(cx1 - cx0 + 1)
    }
  }
  // (indices: the showing operation's place and the glyph's within it; the painted path's place; inside an annotation, -1)
  // (a soft mask's group, an ExtGState's /SMask PDF.js lists as a group: no content stream the remover walks paints it, so
  // that its shows and paths are counted as an annotation's are not: remove.mjs alignOf)
  let showAt = -1, pathAt = -1, inAnnotation = 0, curShow = -1, glyphAt = -1, inMask = 0
  const maskGroups = []
  const fonts = new Map()
  const fontOf = id => {
    if (!fonts.has(id)) {
      let f = null
      try { f = commonObjs.get(id) } catch {}
      fonts.set(id, f && typeof f === 'object' ? f : null)
    }
    return fonts.get(id)
  }
  const {
    save: SAVE, restore: RESTORE, transform: TRANSFORM, setLineWidth: LINE_WIDTH, setGState: GSTATE,
    beginText: BEGIN_TEXT, setFont: FONT, setTextMatrix: TEXT_MATRIX, moveText: MOVE, setLeadingMoveText: LEADING_MOVE,
    setLeading: LEADING, nextLine: NEXT_LINE, setCharSpacing: CHAR_SPACING, setWordSpacing: WORD_SPACING,
    setHScale: HSCALE, setTextRise: RISE, setTextRenderingMode: RENDER, showText: SHOW,
    showSpacedText: SHOW_SPACED, nextLineShowText: NEXT_SHOW, nextLineSetSpacingShowText: NEXT_SPACING_SHOW,
    paintFormXObjectBegin: FORM, paintFormXObjectEnd: FORM_END, beginGroup: GROUP, endGroup: GROUP_END,
    beginAnnotation: ANNOTATION, endAnnotation: ANNOTATION_END, constructPath: PATH, clip: CLIP, eoClip: EO_CLIP,
    shadingFill: SHADING, paintImageXObject: IMAGE, paintInlineImageXObject: INLINE_IMAGE, paintImageMaskXObject: MASK,
    paintSolidColorImageMask: SOLID_MASK, paintImageXObjectRepeat: IMAGE_REPEAT, paintImageMaskXObjectRepeat: MASK_REPEAT,
    paintImageMaskXObjectGroup: MASK_GROUP, paintInlineImageXObjectGroup: INLINE_GROUP, setRenderingIntent: INTENT,
    setFillRGBColor: FILL_RGB, setFillTransparent: FILL_NONE, setFillColorN: FILL_N, setCharWidthAndBounds: D1,
  } = OPS
  const STROKES = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])
  const PAINTS = new Set([...STROKES, OPS.fill, OPS.eoFill])
  const FILLS = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])
  let s = fresh()
  const stack = []
  // (past STACK_MAX a level holds no copy, `unsaved` counting them. Its save changes nothing, so the state goes on exact; its
  // restore cannot give back the state of its save, which is then unknown (`lost`, kept in each copy) until a restore
  // reaches a level that holds one, or an annotation sets a state of its own. Ink placed while the state is unknown stops
  // the reading and caps the page (`deep`): a page is read exactly or not at all, never with its ink misplaced)
  let unsaved = 0
  const push = () => { if (stack.length >= STACK_MAX) { unsaved++; return } stack.push({ ...s }) }
  const pop = () => { if (unsaved > 0) { unsaved--; s.lost = true; return } const t = stack.pop(); if (t) s = t }
  /** whether ink may be placed now: not while the state is unknown (the page then capped) */
  const known = () => { if (s.lost) { deep = true; stop = true } return !s.lost }

  /** a rectangle of space `m` as its box on the page, cut to `clip` (null: wholly outside it) */
  const boxOf = (m, x0, y0, x1, y1, clip) => {
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5]
      if (X < bx0) bx0 = X
      if (X > bx1) bx1 = X
      if (Y < by0) by0 = Y
      if (Y > by1) by1 = Y
    }
    if (!finite(bx0, by0, bx1, by1)) return null
    if (clip) { bx0 = Math.max(bx0, clip[0]); by0 = Math.max(by0, clip[1]); bx1 = Math.min(bx1, clip[2]); by1 = Math.min(by1, clip[3]) }
    return bx0 <= bx1 && by0 <= by1 ? [bx0, by0, bx1, by1] : null
  }
  /** a box painted, a step: kept one by one within the budget, else merged by cell (whatever its kind); past BOXES_CAP
   *  boxes kept (a reader that asks for no budget), reading stops, the page capped */
  const put = (x0, y0, x1, y1, path) => {
    step(1)
    if (stop || !known()) return
    if (turned && (s.form > 0 || picture > 0) && !inAnnotation && !inMask) extend(`${s.formId}:${pictureIds.at(-1) ?? 0}`, x0, y0, x1, y1)
    if (boxes.length >= 4 * keep) { merge(x0, y0, x1, y1); return }
    if (boxes.length >= 4 * BOXES_CAP) { over = true; stop = true; return }
    boxes.push(x0, y0, x1, y1)
    if (indices) paths.push(path)
  }
  const addBox = (m, x0, y0, x1, y1, path = -1) => { if (!known()) return; const b = boxOf(m, x0, y0, x1, y1, s.clip); if (b) put(b[0], b[1], b[2], b[3], path); else step(1) }
  /** the clip in force cut to a rectangle of space `m`; nothing left of it is a clip of no area */
  const clipTo = (m, x0, y0, x1, y1) => {
    const b = boxOf(m, x0, y0, x1, y1, s.clip)
    s.clip = b ?? [0, 0, -1, -1]
  }
  const setFont = (id, size) => {
    s.font = fontOf(id); s.fontId = String(id)
    const v = typeof size === 'number' ? size : Number.NaN
    s.size = v < 0 ? -v : v; s.dir = v < 0 ? -1 : 1
  }
  const moveText = (tx, ty) => { s.lx += num(tx); s.ly += num(ty); s.x = s.lx; s.y = s.ly }

  /** a glyph shown from text-space x `xa` to `xb` on the current line (the horizontal scale applied), under M = the CTM
   *  × the text matrix; `hs` the horizontal scale with the font's direction */
  const outlines = new Map()
  /** a glyph's outline box in em (outlineBox), once a font and character; else the given table's */
  const outlineOf = g => {
    // (a Type 3 glyph's from its own procedure, which PDF.js gives alike in Node and in the browser, by its procedure: PDF.js
    // maps a Type 3 character to a glyph name, so its fontChar is '' for every glyph, and a "," as wide as a "." is another
    // glyph. Never an outline table's, whose key tells such glyphs not apart)
    const t3 = s.font?.isType3Font === true
    const key = t3 ? `${s.fontId}|t3|${g.operatorListId}` : `${s.fontId}|${g.fontChar}|${g.width}`
    if (!outlines.has(key)) {
      let box = t3 ? type3Box(OPS, s.font, g.operatorListId) : outlineBox(commonObjs, s.font, g.fontChar)
      if (!t3 && box === null && given) box = given.get(outlineKey(s.font, s.fontId, g)) ?? null
      else if (!t3 && box !== null && collect) {
        // (two glyphs of one key, rare: the box of both, which a swap covers either with)
        const k = outlineKey(s.font, s.fontId, g), had = collect.get(k)
        collect.set(k, had && had.length === 4 && box.length === 4 ? [Math.min(had[0], box[0]), Math.min(had[1], box[1]), Math.max(had[2], box[2]), Math.max(had[3], box[3])] : had?.length === 4 ? had : box)
      }
      outlines.set(key, box)
    }
    return outlines.get(key)
  }
  /** whether a Type 3 glyph paints colours of its own: a coloured glyph (d0, not d1) whose procedure sets a fill (PDF 9.6.4: a
   *  d1 glyph is a stencil painted in the current fill, whatever its procedure sets); once a font and glyph */
  const ownColours = new WeakMap()
  const paintsOwn = (font, id) => {
    if (font?.isType3Font !== true || id === undefined) return false
    let m = ownColours.get(font)
    if (!m) ownColours.set(font, (m = new Map()))
    if (!m.has(id)) {
      const procs = font.charProcOperatorList, proc = procs instanceof Map ? procs.get(id) : procs?.[id]
      const fns = proc?.fnArray ?? []
      m.set(id, fns.length > 0 && fns[0] !== D1 && [...fns].some(fn => fn === FILL_RGB || fn === FILL_N || fn === FILL_NONE))
    }
    return m.get(id)
  }
  const emit = (g, M, hs, xa, xb, ascent, descent) => {
    const u = g.unicode
    if (typeof u !== 'string' || !known() || (s.tr & 3) === 3) return
    const ty = s.y + s.rise, size = s.size
    const level = M[0] * hs > 0 && M[3] > 0 && Math.abs(M[1]) <= LEVEL * Math.abs(M[0])
    if (!level) {
      const had = boxes.length
      if (!glyphsOnly) addBox(M, Math.min(xa, xb), ty + descent * size, Math.max(xa, xb), ty + ascent * size, -4)
      if (turned) turnedGlyph(g, M, hs, xa, xb, ty, ascent, descent, boxes.length > had ? had / 4 : -1)
      return
    }
    const ox = M[0] * xa + M[2] * ty + M[4], oy = M[1] * xa + M[3] * ty + M[5], ex = M[0] * xb + M[2] * ty + M[4]
    const sz = size * M[3]
    const name = typeof s.font.name === 'string' && s.font.name ? s.font.name : s.fontId
    // (its fill where its rendering mode paints one: 0, 2, 4 and 6 fill; 1 and 5 stroke alone; 3 and 7 paint nothing, above)
    const glyph = { u, x0: Math.min(ox, ex), x1: Math.max(ox, ex), y: oy, top: oy + ascent * sz, bottom: oy + descent * sz, size: sz, font: name, ix0: Math.min(ox, ex), ix1: Math.max(ox, ex), fill: s.tr & 1 ? NO_FILL : s.fill }
    // (a Type 3 glyph whose procedure paints its own colours: `fill` is only the fill it was shown in, no reading of its ink)
    if (paintsOwn(s.font, g.operatorListId)) glyph.ownColour = true
    const box = glyphsOnly ? null : outlineOf(g)
    if (box?.length === 4) {
      // the outline across from the origin (its x in em × size, the horizontal scale and the direction), and up
      const a = M[0] * (xa + box[0] * size * hs) + M[2] * ty + M[4], b = M[0] * (xa + box[2] * size * hs) + M[2] * ty + M[4]
      glyph.ix0 = Math.min(a, b); glyph.ix1 = Math.max(a, b); glyph.top = oy + box[3] * sz; glyph.bottom = oy + box[1] * sz
    } else if (box) { glyph.top = glyph.bottom = oy; glyph.ix0 = glyph.ix1 = ox }
    if (indices) { glyph.n = curShow; glyph.k = glyphAt; if (!/\S/.test(u)) glyph.blank = true; if (s.form > 0) glyph.form = true }
    // (`turned`, the figures' reading: a glyph not wholly inside the clip in force is not shown whole, an included figure's text its
    // viewport cuts off)
    if (turned && outsideClip(Math.min(glyph.x0, glyph.ix0), glyph.bottom, Math.max(glyph.x1, glyph.ix1), glyph.top)) glyph.clipped = true
    if (turned) { if (s.formId) glyph.fid = s.formId; if (pictureIds.length) glyph.pid = pictureIds.at(-1) }
    if (finite(glyph.x0, glyph.x1, glyph.y, glyph.top, glyph.bottom, glyph.size, glyph.ix0, glyph.ix1)) {
      if (glyphs.length >= glyphsMax) { over = true; stop = true; return }
      glyphs.push(glyph); boxAt.push(boxes.length / 4)
    }
  }

  /** whether a box on the page is not wholly inside the clip in force (a hair's slack: an edge on the clip's) */
  const outsideClip = (x0, y0, x1, y1) => !!s.clip && (x0 < s.clip[0] - 0.05 || y0 < s.clip[1] - 0.05 || x1 > s.clip[2] + 0.05 || y1 > s.clip[3] + 0.05)
  /** a glyph set turned (`turned`, layout/figure-text.mjs: a figure's y-axis title), as a TurnedGlyph: its baseline from its
   *  origin (ox, oy) to its advance's end (ex, ey), its direction (ux, uy), its size and its font's ascent and descent in em, a
   *  rotation of the page's axes alone (no mirror, no shear past TURN_SKEW); its own ink up and down from its baseline in em
   *  (`up`, `down`: its outline's top and bottom, none for an outline of nothing drawn, else its font's ascent and descent, as a
   *  level glyph's `top` and `bottom` are); its box's index among the page's boxes (-1 where its clip left none), the level glyphs
   *  and the points before it in the stream (`at`, `pt`); `clipped` where its own ink is not wholly inside the clip in force. A
   *  glyph mirrored or sheared is a box alone, as before */
  const turnedGlyph = (g, M, hs, xa, xb, ty, ascent, descent, box) => {
    const ax = M[0] * hs, ay = M[1] * hs, upx = M[2], upy = M[3]
    const la = Math.hypot(ax, ay), lu = Math.hypot(upx, upy)
    if (!(la > 0 && lu > 0) || ax * upy - ay * upx <= 0 || Math.abs(ax * upx + ay * upy) > TURN_SKEW * la * lu) return
    const ox = M[0] * xa + M[2] * ty + M[4], oy = M[1] * xa + M[3] * ty + M[5], ex = M[0] * xb + M[2] * ty + M[4], ey = M[1] * xb + M[3] * ty + M[5]
    const sz = s.size * lu
    const name = typeof s.font.name === 'string' && s.font.name ? s.font.name : s.fontId
    const o = outlineOf(g), has = o?.length === 4, none = Array.isArray(o) && o.length === 0
    const up = has ? o[3] : none ? 0 : ascent, down = has ? o[1] : none ? 0 : descent
    const t = { u: g.unicode, n: curShow, k: glyphAt, ox, oy, ex, ey, ux: ax / la, uy: ay / la, size: sz, ascent, descent, up, down, font: name, fill: s.tr & 1 ? NO_FILL : s.fill, box, at: glyphs.length, pt: pictures.length }
    if (!/\S/.test(t.u)) t.blank = true
    if (s.form > 0) t.form = true
    if (s.formId) t.fid = s.formId
    if (pictureIds.length) t.pid = pictureIds.at(-1)
    // (not shown whole where its own ink is not wholly inside the clip in force, as a level glyph (emit): its advance and its
    // outline across it, its outline's bottom to its top, else its font's descent to its ascent (an outline of nothing drawn:
    // its baseline alone); the four corners of that box turned with it. Never a box of its whole size on both sides of its
    // baseline: a y-axis title or a colour bar's title set at its figure's edge, inside the form's box, read as cut and was no
    // unit (2610.35877v1 p8, 2610.22065v1 p3: the sweep of 6e0a8d1c, once the final pass drew its figures with no group, whose
    // box PDF.js gives no form))
    if (s.clip) {
      const ia = has ? xa + o[0] * s.size * hs : xa, ib = has ? xa + o[2] * s.size * hs : xa
      const a0 = Math.min(xa, xb, ia, ib), a1 = Math.max(xa, xb, ia, ib)
      const b0 = ty + down * s.size, b1 = ty + up * s.size
      let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity
      for (const [x, y] of [[a0, b0], [a1, b0], [a0, b1], [a1, b1]]) {
        const X = M[0] * x + M[2] * y + M[4], Y = M[1] * x + M[3] * y + M[5]
        if (X < X0) X0 = X
        if (X > X1) X1 = X
        if (Y < Y0) Y0 = Y
        if (Y > Y1) Y1 = Y
      }
      if (outsideClip(X0, Y0, X1, Y1)) t.clipped = true
    }
    if (finite(ox, oy, ex, ey, sz) && turnedOut.length < glyphsMax) turnedOut.push(t)
  }
  /** a figure's painted path as its lines (`turned`): inside a form or a TikZ picture (between the points `zs` and `ze`), its
   *  segments on the page (a curve's CURVE_STEPS chords, a fill's subpaths closed), whether it strokes and fills, and its half line
   *  width on the page, by its box's index; at most SHAPE_NUMBERS_PAGE numbers a page, the paths past them their boxes alone */
  const shapes = new Map()
  let picture = 0, shapeNumbers = 0
  /** each form painted and each TikZ picture its own number (`turned`: a figure's glyphs are of one figure, `fid` and `pid`, so
   *  that two figures side by side never make one label); the pictures open now */
  let formSeq = 0, pictureSeq = 0
  const pictureIds = []
  /** each figure's extent on the page (`turned`): the box of every box painted inside it, by `<fid>:<pid>` (its form's number and
   *  its innermost picture's, 0 for none), before any budget merges it, cut to the clip in force as every box is; a figure's
   *  glyphs carry the same numbers, so that its reader adds their boxes (layout/figure-text.mjs: a label's room never leaves its
   *  figure) */
  const figureBoxes = new Map()
  const extend = (key, x0, y0, x1, y1) => {
    const b = figureBoxes.get(key)
    if (!b) { figureBoxes.set(key, [x0, y0, x1, y1]); return }
    if (x0 < b[0]) b[0] = x0
    if (y0 < b[1]) b[1] = y0
    if (x1 > b[2]) b[2] = x1
    if (y1 > b[3]) b[3] = y1
  }
  const shapeOf = (box, op, data) => {
    if (!data || typeof data.length !== 'number' || shapeNumbers + data.length * 2 > SHAPE_NUMBERS_PAGE) return
    const m = s.ctm, fill = FILLS.has(op), segs = []
    let x = 0, y = 0, sx = 0, sy = 0, open = false
    const X = (px, py) => m[0] * px + m[2] * py + m[4], Y = (px, py) => m[1] * px + m[3] * py + m[5]
    const close = () => { if (fill && open && (x !== sx || y !== sy)) segs.push(x, y, sx, sy) }
    for (let i = 0; i < data.length;) {
      const o = data[i++]
      if (o === 0) { close(); x = sx = X(data[i], data[i + 1]); y = sy = Y(data[i], data[i + 1]); open = true; i += 2 }
      else if (o === 1) { const nx = X(data[i], data[i + 1]), ny = Y(data[i], data[i + 1]); segs.push(x, y, nx, ny); x = nx; y = ny; i += 2 }
      else if (o === 2 || o === 3) {
        // (a cubic's control points and end, a quadratic's one control point and end)
        const n = o === 2 ? 6 : 4, c = []
        for (let q = 0; q < n; q += 2) c.push(X(data[i + q], data[i + q + 1]), Y(data[i + q], data[i + q + 1]))
        i += n
        let px = x, py = y
        for (let k = 1; k <= CURVE_STEPS; k++) {
          const t = k / CURVE_STEPS, u = 1 - t
          const qx = o === 2 ? u * u * u * x + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t * t * t * c[4] : u * u * x + 2 * u * t * c[0] + t * t * c[2]
          const qy = o === 2 ? u * u * u * y + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5] : u * u * y + 2 * u * t * c[1] + t * t * c[3]
          segs.push(px, py, qx, qy)
          px = qx; py = qy
        }
        x = px; y = py
      } else if (o === 4) { if (x !== sx || y !== sy) segs.push(x, y, sx, sy); x = sx; y = sy }
      else return
    }
    close()
    if (!segs.every(Number.isFinite)) return
    shapeNumbers += segs.length
    shapes.set(box, { segs: Float32Array.from(segs), stroke: STROKES.has(op), fill, hw: Math.max(0.25, (s.lw / 2) * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))) })
  }
  /** showText as the canvas runs it (showText, showType3Text): each glyph's origin, its advance, the line moved on */
  const show = arr => {
    if (indices) { if (!inAnnotation && !inMask) showAt++; curShow = inAnnotation || inMask ? -1 : showAt; glyphAt = -1 }
    // (in a state not known, its font, size and mode are not either: nothing shown is placed, and the page is capped)
    if (!known()) return
    const f = s.font
    if (!f || !Array.isArray(arr)) return
    const size = s.size, hs = s.hs * s.dir, vertical = !!f.vertical
    const own = matrixOf(f.fontMatrix), fm = own === BROKEN ? FONT_MATRIX : own
    const M = mul(s.ctm, s.tm)
    if (f.isType3Font) {
      // the canvas neither paints nor advances a Type 3 font's invisible text or one of size 0
      if (s.tr === 3 || size === 0) return
      for (const g of arr) {
        step(1)
        if (stop) return
        if (typeof g === 'number') { s.x += (((vertical ? 1 : -1) * g * size) / 1000) * hs; continue }
        if (!g || typeof g !== 'object') continue
        glyphAt++
        // its advance through its own font matrix (x and translation), spacing after it unscaled by direction
        const w = (num(g.width) * fm[0] + fm[4]) * size, spacing = (g.isSpace ? s.ws : 0) + s.cs
        if (!vertical) emit(g, M, hs, s.x, s.x + w * hs, ASCENT, DESCENT)
        s.x += (w + spacing) * hs
      }
      return
    }
    if (!(size > 0)) return
    const adv = size * fm[0]
    const ascent = f.ascent > 0 ? f.ascent : ASCENT, descent = f.descent < 0 ? f.descent : DESCENT
    if (f.isInvalidPDFjsFont) {
      // drawn as one string from the line's place: each glyph by the widths before it, no spacing (as the canvas)
      let w = 0
      for (const g of arr) {
        step(1)
        if (stop) return
        if (!g || typeof g !== 'object') continue
        glyphAt++
        const gw = num(g.width) * adv
        if (!vertical) emit(g, M, hs, s.x + w * hs, s.x + (w + gw) * hs, ascent, descent)
        w += gw
      }
      s.x += w * hs
      return
    }
    let x = 0
    for (const g of arr) {
      step(1)
      if (stop) return
      if (typeof g === 'number') { x += ((vertical ? 1 : -1) * g * size) / 1000; continue }
      if (!g || typeof g !== 'object') continue
      glyphAt++
      const spacing = (g.isSpace ? s.ws : 0) + s.cs
      if (vertical) {
        const vm = g.vmetric || f.defaultVMetrics
        x += (vm ? -num(vm[0]) : num(g.width)) * adv - spacing * s.dir
        continue
      }
      // the glyph's own advance; the spacing after it moves the next one
      const w = num(g.width) * adv
      emit(g, M, hs, s.x + x * hs, s.x + (x + w) * hs, ascent, descent)
      x += w + spacing * s.dir
    }
    if (vertical) s.y -= x
    else s.x += x * hs
  }

  for (let j = 0; j < n && !stop; j++) {
    step(1)
    const fn = fnArray[j], a = argsArray[j] ?? []
    switch (fn) {
      case SAVE: push(); break
      case RESTORE: pop(); break
      case TRANSFORM: s.ctm = mul(s.ctm, matrixOf(a)); break
      case LINE_WIDTH: s.lw = num(a[0]); break
      // (the fill colour, every space PDF.js turns to RGB; a pattern's or a transparent one none)
      case FILL_RGB: s.fill = fillOf(a); break
      case FILL_NONE: case FILL_N: s.fill = NO_FILL; break
      case GSTATE:
        for (const e of Array.isArray(a[0]) ? a[0] : []) {
          step(1)
          if (stop) break
          if (!Array.isArray(e)) continue
          if (e[0] === 'LW') s.lw = num(e[1])
          else if (e[0] === 'Font' && Array.isArray(e[1])) setFont(e[1][0], e[1][1])
        }
        break
      case BEGIN_TEXT: s.tm = IDENTITY; s.x = s.y = s.lx = s.ly = 0; break
      case FONT: setFont(a[0], a[1]); break
      case TEXT_MATRIX: s.tm = matrixOf(a[0] && typeof a[0] === 'object' ? a[0] : a); s.x = s.y = s.lx = s.ly = 0; break
      case MOVE: moveText(a[0], a[1]); break
      case LEADING_MOVE: s.leading = num(a[1]); moveText(a[0], a[1]); break
      case LEADING: s.leading = -num(a[0]); break
      case NEXT_LINE: moveText(0, s.leading); break
      case CHAR_SPACING: s.cs = num(a[0]); break
      case WORD_SPACING: s.ws = num(a[0]); break
      case HSCALE: s.hs = num(a[0]) / 100; break
      case RISE: s.rise = num(a[0]); break
      case RENDER: s.tr = num(a[0]); break
      case SHOW: case SHOW_SPACED: show(a[0]); break
      // the evaluator gives these as nextLine, spacing and showText; read as the PDF operators, should a list hold them
      case NEXT_SHOW: moveText(0, s.leading); show(a[0]); break
      case NEXT_SPACING_SHOW: s.ws = num(a[0]); s.cs = num(a[1]); moveText(0, s.leading); show(a[2]); break
      case FORM: {
        push()
        s.form++
        s.formId = ++formSeq
        if (a[0]) s.ctm = mul(s.ctm, matrixOf(a[0]))
        const bb = a[1]
        if (bb && bb.length >= 4) clipTo(s.ctm, num(bb[0]), num(bb[1]), num(bb[2]), num(bb[3]))
        break
      }
      case FORM_END: pop(); break
      case GROUP: { const m = !!a?.[0]?.smask; maskGroups.push(m); if (m) inMask++; push(); break }
      case GROUP_END: if (maskGroups.pop()) inMask--; pop(); break
      case ANNOTATION: {
        // [id, rect, transform, matrix, …]: an annotation's appearance in its own space, clipped to its rectangle
        inAnnotation++
        push()
        const rect = a[1]
        s = fresh()
        if (rect && rect.length >= 4) clipTo(IDENTITY, num(rect[0]), num(rect[1]), num(rect[2]), num(rect[3]))
        s.ctm = mul(matrixOf(a[2]), matrixOf(a[3]))
        break
      }
      case ANNOTATION_END: inAnnotation = Math.max(0, inAnnotation - 1); pop(); break
      case CLIP: case EO_CLIP: s.pendingClip = true; break
      // (glyphsOnly: the glyphs and the state they are placed by alone; paths, shadings and images place no glyph)
      case PATH: {
        if (glyphsOnly) { s.pendingClip = false; break }
        const op = a[0], mm = a[2]
        if (!inAnnotation && !inMask) pathAt++
        const ok = mm && mm.length >= 4 && finite(mm[0], mm[1], mm[2], mm[3]) && mm[2] >= mm[0] && mm[3] >= mm[1]
        if (ok && PAINTS.has(op)) {
          const e = STROKES.has(op) ? s.lw / 2 : 0
          const had = boxes.length
          addBox(s.ctm, mm[0] - e, mm[1] - e, mm[2] + e, mm[3] + e, inAnnotation || inMask ? -1 : pathAt)
          // (a figure's path, its segments kept: whether it crosses a figure's label is its lines', not its box's)
          if (turned && boxes.length > had && (s.form > 0 || picture > 0) && !inAnnotation && !inMask) shapeOf(had / 4, op, a[1]?.[0])
        }
        // a clip takes effect after the path is painted (the canvas's pendingClip)
        if (s.pendingClip) { if (ok) clipTo(s.ctm, mm[0], mm[1], mm[2], mm[3]); else s.clip = [0, 0, -1, -1]; s.pendingClip = false }
        break
      }
      case SHADING:
        if (glyphsOnly) break
        // painted over the clip in force; with none, the page's background, left out (a clip not known: the page capped)
        if (known() && s.clip && s.clip[0] <= s.clip[2] && s.clip[1] <= s.clip[3]) put(s.clip[0], s.clip[1], s.clip[2], s.clip[3], -2)
        break
      case IMAGE: case INLINE_IMAGE: case MASK: case SOLID_MASK: if (!glyphsOnly) addBox(s.ctm, 0, 0, 1, 1, -3); break
      case IMAGE_REPEAT: case MASK_REPEAT: {
        if (glyphsOnly) break
        // [id, scaleX, scaleY, positions]; a mask's [mask, scaleX, skewX, skewY, scaleY, positions]
        const mask = fn === MASK_REPEAT
        const [sa, sb, sc, sd] = mask ? [a[1], a[2], a[3], a[4]] : [a[1], 0, 0, a[2]]
        const at = a[mask ? 5 : 3]
        if (!at || !(at.length >= 0)) break
        for (let i = 0; i + 1 < at.length && !stop; i += 2) addBox(mul(s.ctm, matrixOf([sa, sb, sc, sd, at[i], at[i + 1]])), 0, 0, 1, 1, -3)
        break
      }
      case MASK_GROUP: case INLINE_GROUP: {
        if (glyphsOnly) break
        const group = fn === MASK_GROUP ? a[0] : a[1]
        for (const img of Array.isArray(group) ? group : []) { if (stop) break; addBox(mul(s.ctm, matrixOf(img?.transform)), 0, 0, 1, 1, -3) }
        break
      }
      case INTENT: {
        const name = typeof a[0] === 'string' ? a[0] : a[0] && typeof a[0] === 'object' ? a[0].name : null
        const m = typeof name === 'string' ? POINT.exec(name) : null
        // (a picture's points apart, `pictures`, and a paragraph's, `paras`: no mark of any unit's, never among the points the
        // marks and the ownership read)
        if (m && (m[1] === PICTURE_START || m[1] === PICTURE_END)) { pictures.push({ name: m[1], glyph: glyphs.length, box: boxes.length / 4 }); picture = m[1] === PICTURE_START ? picture + 1 : Math.max(0, picture - 1); if (m[1] === PICTURE_START) pictureIds.push(++pictureSeq); else pictureIds.pop() }
        else if (m) (PARA_POINT.test(m[1]) ? paras : points).push({ name: m[1], glyph: glyphs.length, box: boxes.length / 4 })
        break
      }
      default:
    }
  }
  // (the merged boxes after the others, from `mergedAt` on, in the cells' order: rising, then across)
  const mergedAt = tiles ? boxes.length / 4 : null
  if (tiles) {
    for (let o = 0; o < tiles.length; o += 4) {
      if (Number.isNaN(tiles[o])) continue
      boxes.push(tiles[o], tiles[o + 1], tiles[o + 2], tiles[o + 3])
      if (indices) paths.push(MERGED)
    }
  }
  return { glyphs, boxes, points, boxAt, paras, ...(indices ? { paths, shows: showAt + 1 } : {}), ...(turned ? { turned: turnedOut, shapes, pictures, figures: figureBoxes } : {}), capped: fnArray.length > OPS_CAP || over || deep || many, timedOut: late, degraded: tiles !== null, mergedAt, rotated: false }
}

/** why a page's ink (pageInk's) is not read whole, or null where it is: 'rotated' (nothing read), 'capped' (past a cap) or
 *  'timedOut' (past the walk's backstop). What such a reading holds is a prefix of the page, or nothing: every reader keeps
 *  the page the original's (no unit located, owned or removed there) and never reads the prefix as the page */
export const unreadOf = ink => (ink?.rotated ? 'rotated' : ink?.capped ? 'capped' : ink?.timedOut ? 'timedOut' : null)

/** every column packGlyphs may keep */
export const GLYPH_COLUMNS = Object.freeze(['x0', 'x1', 'y', 'top', 'bottom', 'ix0', 'ix1', 'size', 'font', 'u', 'fill'])
/**
 * A page's glyphs (pageInk's, a Glyph each) packed as columns, the form a reading keeps them in past its page: { n, most,
 * and each of `columns` (GLYPH_COLUMNS, all where none are given) }, the i-th of each column the glyph `order[i]`
 * (indices into `glyphs`; with no order, each glyph in its own place, the content stream's order). Each number as the
 * Glyph holds it, but `ix0` and `ix1`, its ink across with its advance (the lesser and the greater of the two: an
 * italic's overhang past its advance); `font` the id `fontIds` gives its font's name, -1 where none is asked; `most` the
 * largest size. A Glyph is an object of ten fields, some 290 bytes in Node; its ten columns 76, the four the marks read
 * keeps 32 (the prepare memory note of 2026-10-15). The layout maker keeps arXiv's ink so, every column (make.mjs
 * glyphsOf); the marks read the marked compile's, the columns ownedOf reads (marks.mjs layoutMarksOf, stream.mjs)
 */
export function packGlyphs(glyphs, { order = null, fontIds = null, columns = GLYPH_COLUMNS } = {}) {
  const n = order ? order.length : glyphs.length
  const P = { n, most: 0 }
  for (const k of columns) P[k] = k === 'u' ? new Array(n) : k === 'font' || k === 'fill' ? new Int32Array(n).fill(-1) : new Float64Array(n)
  const { x0, x1, y, top, bottom, ix0, ix1, size, font, u, fill } = P
  for (let i = 0; i < n; i++) {
    const t = glyphs[order ? order[i] : i]
    if (x0) x0[i] = t.x0
    if (x1) x1[i] = t.x1
    if (y) y[i] = t.y
    if (top) top[i] = t.top
    if (bottom) bottom[i] = t.bottom
    if (ix0) ix0[i] = Math.min(t.x0, t.ix0 ?? t.x0)
    if (ix1) ix1[i] = Math.max(t.x1, t.ix1 ?? t.x1)
    if (size) size[i] = t.size
    if (font && fontIds) font[i] = fontIds(t.font)
    if (u) u[i] = t.u
    if (fill) fill[i] = Number.isInteger(t.fill) ? t.fill : NO_FILL
    if (t.size > P.most) P.most = t.size
  }
  return P
}
