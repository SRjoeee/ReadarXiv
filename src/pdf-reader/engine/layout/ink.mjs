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
// own space). arXiv's PDF is untrusted: no more than OPS_CAP operations are read, a matrix or a number that is not one
// places nothing, and nothing here throws on a malformed list.
// Imports nothing: the maker runs it in a Worker or in Node alike.

/** the operations read on a page at most: a heavy vector page (a plot of every point of a dataset) holds hundreds of
 *  thousands, and the text that is laid over lies before or among the first of them */
export const OPS_CAP = 150_000

/** where a font gives no ascent or descent (an old Type 3 font gives none worth reading), as anchors.mjs reads them */
const ASCENT = 0.75, DESCENT = -0.22
/** a glyph's run counts as level when its rise across is under this share of its advance */
const LEVEL = 1e-3
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

/** a fresh graphics state: the page's own, or an annotation's */
const fresh = () => ({
  ctm: IDENTITY, clip: null, lw: 1, font: null, fontId: '', size: 0, dir: 1, cs: 0, ws: 0, hs: 1, rise: 0, leading: 0, tr: 0,
  tm: IDENTITY, x: 0, y: 0, lx: 0, ly: 0, pendingClip: false,
})

/**
 * A glyph's own ink in em, [x0, y0, x1, y1] from its origin, y up: the extremes of its outline, as PDF.js gives it where
 * it draws glyphs as paths (`<font's loadedName>_path_<fontChar>` in the common objects, a FontPathInfo: in Node, where
 * the font face is disabled by default, or wherever the document is opened with `disableFontFace`). The outline's points
 * and its curves' control points bound it, and a font's outline has a point at each extreme (TrueType's and CFF's own
 * rule), so the box is its ink. [] for a glyph of no outline (a space drawn); null where no outline is given (a Type 3
 * font, the browser's default): the font's declared ascent and descent then
 */
export function outlineBox(commonObjs, font, fontChar) {
  if (!font || typeof font.loadedName !== 'string' || typeof fontChar !== 'string' || typeof commonObjs?.has !== 'function') return null
  const id = `${font.loadedName}_path_${fontChar}`
  let path = null
  try { if (commonObjs.has(id)) path = commonObjs.get(id)?.path } catch { return null }
  if (!path || typeof path.length !== 'number') return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  // DrawOPS: moveTo 0 and lineTo 1 a point, curveTo 2 three, quadraticCurveTo 3 two, closePath 4 none
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

/**
 * A page's ink: { glyphs, boxes, points, boxAt, capped, rotated }. `glyphs`: each glyph shown with a Unicode string,
 * upright and painted (render mode not 3 or 7), as a Glyph, whatever its Unicode: a symbolic font's glyph that PDF.js
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
 * list held more than OPS_CAP operations, and those past it were not read. `rotated`: the page's /Rotate is not 0, and
 * nothing is read (the layer lays over no rotated page).
 * `indices` (the text remover's, layout/remove.mjs): each glyph also carries where the content stream shows it: `n`, its
 * text-showing operation's place among the page's own (an annotation's appearance not counted: -1 there), and `k`, its
 * place among that operation's glyphs, and `blank: true` where its Unicode is blank; and `paths` gives, for each box,
 * its path's place among the page's own painted paths (constructPath), or its kind: -1 a path of an annotation's
 * appearance, -2 a shading, -3 an image, -4 a glyph set rotated or mirrored; and `shows` counts the page's own
 * text-showing operations. Off, the answer is the maker's, unchanged.
 * `outlines` (the text removal's, the reader's side): the outline boxes of the paper's glyphs by font and character
 * (outlineTable's, made where PDF.js gives the outlines: in Node), for a glyph whose outline this reading has not (the
 * browser draws a font as a font face, and gives no outline): its box is then the server's, exactly. `collect`: a Map
 * this reading's outline boxes are added to, by outlineKey
 */
export function pageInk(OPS, ops, commonObjs, { rotate, indices = false, outlines: given = null, collect = null }) {
  const turn = (((Number(rotate) % 360) + 360) % 360)
  if (turn !== 0) return { glyphs: [], boxes: [], points: [], boxAt: [], ...(indices ? { paths: [], shows: 0 } : {}), capped: false, rotated: true }
  const fnArray = ops?.fnArray ?? [], argsArray = ops?.argsArray ?? []
  const n = Math.min(fnArray.length, OPS_CAP)
  const glyphs = [], boxes = [], points = [], boxAt = [], paths = []
  // (indices: the showing operation's place and the glyph's within it; the painted path's place; inside an annotation, -1)
  let showAt = -1, pathAt = -1, inAnnotation = 0, curShow = -1, glyphAt = -1
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
  } = OPS
  const STROKES = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])
  const PAINTS = new Set([...STROKES, OPS.fill, OPS.eoFill])
  let s = fresh()
  const stack = []
  const push = () => stack.push({ ...s })
  const pop = () => { const t = stack.pop(); if (t) s = t }

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
  const addBox = (m, x0, y0, x1, y1, path = -1) => { const b = boxOf(m, x0, y0, x1, y1, s.clip); if (b) { boxes.push(b[0], b[1], b[2], b[3]); if (indices) paths.push(path) } }
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
    const key = `${s.fontId}|${g.fontChar}|${g.width}`
    if (!outlines.has(key)) {
      let box = outlineBox(commonObjs, s.font, g.fontChar)
      if (box === null && given) box = given.get(outlineKey(s.font, s.fontId, g)) ?? null
      else if (box !== null && collect) {
        // (two glyphs of one key, rare: the box of both, which a swap covers either with)
        const k = outlineKey(s.font, s.fontId, g), had = collect.get(k)
        collect.set(k, had && had.length === 4 && box.length === 4 ? [Math.min(had[0], box[0]), Math.min(had[1], box[1]), Math.max(had[2], box[2]), Math.max(had[3], box[3])] : had?.length === 4 ? had : box)
      }
      outlines.set(key, box)
    }
    return outlines.get(key)
  }
  const emit = (g, M, hs, xa, xb, ascent, descent) => {
    const u = g.unicode
    if (typeof u !== 'string' || (s.tr & 3) === 3) return
    const ty = s.y + s.rise, size = s.size
    const level = M[0] * hs > 0 && M[3] > 0 && Math.abs(M[1]) <= LEVEL * Math.abs(M[0])
    if (!level) { addBox(M, Math.min(xa, xb), ty + descent * size, Math.max(xa, xb), ty + ascent * size, -4); return }
    const ox = M[0] * xa + M[2] * ty + M[4], oy = M[1] * xa + M[3] * ty + M[5], ex = M[0] * xb + M[2] * ty + M[4]
    const sz = size * M[3]
    const name = typeof s.font.name === 'string' && s.font.name ? s.font.name : s.fontId
    const glyph = { u, x0: Math.min(ox, ex), x1: Math.max(ox, ex), y: oy, top: oy + ascent * sz, bottom: oy + descent * sz, size: sz, font: name, ix0: Math.min(ox, ex), ix1: Math.max(ox, ex) }
    const box = outlineOf(g)
    if (box?.length === 4) {
      // the outline across from the origin (its x in em × size, the horizontal scale and the direction), and up
      const a = M[0] * (xa + box[0] * size * hs) + M[2] * ty + M[4], b = M[0] * (xa + box[2] * size * hs) + M[2] * ty + M[4]
      glyph.ix0 = Math.min(a, b); glyph.ix1 = Math.max(a, b); glyph.top = oy + box[3] * sz; glyph.bottom = oy + box[1] * sz
    } else if (box) { glyph.top = glyph.bottom = oy; glyph.ix0 = glyph.ix1 = ox }
    if (indices) { glyph.n = curShow; glyph.k = glyphAt; if (!/\S/.test(u)) glyph.blank = true }
    if (finite(glyph.x0, glyph.x1, glyph.y, glyph.top, glyph.bottom, glyph.size, glyph.ix0, glyph.ix1)) { glyphs.push(glyph); boxAt.push(boxes.length / 4) }
  }

  /** showText as the canvas runs it (showText, showType3Text): each glyph's origin, its advance, the line moved on */
  const show = arr => {
    if (indices) { if (!inAnnotation) showAt++; curShow = inAnnotation ? -1 : showAt; glyphAt = -1 }
    const f = s.font
    if (!f || !Array.isArray(arr)) return
    const size = s.size, hs = s.hs * s.dir, vertical = !!f.vertical
    const own = matrixOf(f.fontMatrix), fm = own === BROKEN ? FONT_MATRIX : own
    const M = mul(s.ctm, s.tm)
    if (f.isType3Font) {
      // the canvas neither paints nor advances a Type 3 font's invisible text or one of size 0
      if (s.tr === 3 || size === 0) return
      for (const g of arr) {
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

  for (let j = 0; j < n; j++) {
    const fn = fnArray[j], a = argsArray[j] ?? []
    switch (fn) {
      case SAVE: push(); break
      case RESTORE: pop(); break
      case TRANSFORM: s.ctm = mul(s.ctm, matrixOf(a)); break
      case LINE_WIDTH: s.lw = num(a[0]); break
      case GSTATE:
        for (const e of Array.isArray(a[0]) ? a[0] : []) {
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
        if (a[0]) s.ctm = mul(s.ctm, matrixOf(a[0]))
        const bb = a[1]
        if (bb && bb.length >= 4) clipTo(s.ctm, num(bb[0]), num(bb[1]), num(bb[2]), num(bb[3]))
        break
      }
      case FORM_END: pop(); break
      case GROUP: push(); break
      case GROUP_END: pop(); break
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
      case PATH: {
        const op = a[0], mm = a[2]
        if (!inAnnotation) pathAt++
        const ok = mm && mm.length >= 4 && finite(mm[0], mm[1], mm[2], mm[3]) && mm[2] >= mm[0] && mm[3] >= mm[1]
        if (ok && PAINTS.has(op)) {
          const e = STROKES.has(op) ? s.lw / 2 : 0
          addBox(s.ctm, mm[0] - e, mm[1] - e, mm[2] + e, mm[3] + e, inAnnotation ? -1 : pathAt)
        }
        // a clip takes effect after the path is painted (the canvas's pendingClip)
        if (s.pendingClip) { if (ok) clipTo(s.ctm, mm[0], mm[1], mm[2], mm[3]); else s.clip = [0, 0, -1, -1]; s.pendingClip = false }
        break
      }
      case SHADING:
        // painted over the clip in force; with none, the page's background, left out
        if (s.clip && s.clip[0] <= s.clip[2] && s.clip[1] <= s.clip[3]) { boxes.push(s.clip[0], s.clip[1], s.clip[2], s.clip[3]); if (indices) paths.push(-2) }
        break
      case IMAGE: case INLINE_IMAGE: case MASK: case SOLID_MASK: addBox(s.ctm, 0, 0, 1, 1, -3); break
      case IMAGE_REPEAT: case MASK_REPEAT: {
        // [id, scaleX, scaleY, positions]; a mask's [mask, scaleX, skewX, skewY, scaleY, positions]
        const mask = fn === MASK_REPEAT
        const [sa, sb, sc, sd] = mask ? [a[1], a[2], a[3], a[4]] : [a[1], 0, 0, a[2]]
        const at = a[mask ? 5 : 3]
        if (!at || !(at.length >= 0)) break
        for (let i = 0; i + 1 < at.length; i += 2) addBox(mul(s.ctm, matrixOf([sa, sb, sc, sd, at[i], at[i + 1]])), 0, 0, 1, 1, -3)
        break
      }
      case MASK_GROUP: for (const img of Array.isArray(a[0]) ? a[0] : []) addBox(mul(s.ctm, matrixOf(img?.transform)), 0, 0, 1, 1, -3); break
      case INLINE_GROUP: for (const e of Array.isArray(a[1]) ? a[1] : []) addBox(mul(s.ctm, matrixOf(e?.transform)), 0, 0, 1, 1, -3); break
      case INTENT: {
        const name = typeof a[0] === 'string' ? a[0] : a[0] && typeof a[0] === 'object' ? a[0].name : null
        const m = typeof name === 'string' ? POINT.exec(name) : null
        if (m) points.push({ name: m[1], glyph: glyphs.length, box: boxes.length / 4 })
        break
      }
      default:
    }
  }
  return { glyphs, boxes, points, boxAt, ...(indices ? { paths, shows: showAt + 1 } : {}), capped: fnArray.length > OPS_CAP, rotated: false }
}
