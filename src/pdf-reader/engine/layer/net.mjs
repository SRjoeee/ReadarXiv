// The instant layer's completeness net (Plan 8b, Task 11; the instant layer's spec §4.5). A unit the layer draws must show
// everything the original showed there, once: every placeholder with a visible rendering drawn exactly once by its k (a
// crop of the original's ink, the page's own text, or kept in place), no character of the page carried twice, no kept
// rendering erased, no character drawn that its face has not, no bracket doubled. A unit that fails stays the original's,
// whole: it is neither erased nor drawn.
//
// - checkPieces: a translation's pieces, made from engine answers, refused within bounds before anything reads them;
// - netOf: a laid unit's checks, run by layUnit before it returns the unit;
// - lostIn and heldByNone: the checks that need no laying, which layUnit runs first so that a unit refused for them says why.
//
// Pure, as the layer is: no DOM, no clock, no randomness. An original module (no port statement), importing only relative
// modules, so that the reader's bundle holds it.
import { canDraw, faceFor } from '../font-roles.mjs'
import { PH_FLAG } from '../layout/file.mjs'
import { COLOUR_SHIFT, LAYER_COLOURS, STYLE } from './pieces.mjs'
import { BRACKETED, beside, bracketPairs, CLOSES, echoesOf, faceSize, OPENS, ownText, pageTextOf } from './tokens.mjs'

/** the most pieces a translated unit may have */
export const PIECES_MAX = 20_000
/** the most code units a text piece may have */
const TEXT_MAX = 16_000
/** a style's flags: STYLE's bits below COLOUR_SHIFT, a colour's index + 1 in LAYER_COLOURS above it */
const STYLE_END = (LAYER_COLOURS.length + 1) << COLOUR_SHIFT
/**
 * Whether a text holds a control character a text piece may not: C0 but its white space (the line feed, the tab, the
 * carriage return, the line and form feeds: the pipeline's pieces carry the source's, and trText and the tokens read them
 * as white space), DEL, C1, and the bidirectional controls that reorder what is drawn (embeddings, overrides, isolates and
 * the marks). The no-break space, the zero width space and the other invisible characters are text (none is drawn)
 */
function hasControl(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if ((c < 0x20 && (c < 0x09 || c > 0x0d)) || (c >= 0x7f && c <= 0x9f) || c === 0x061c || c === 0x200e || c === 0x200f || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return true
  }
  return false
}

/** an erase rectangle may meet a kept rendering by this much, in PDF units, across and up */
const ERASE_SLACK = 0.5
/** two placeholders' segments carry one character where they share more than this of the smaller */
const OVERLAP_SHARE = 0.5
/**
 * The most pairs of rectangles one check compares. The rows of a hostile file can make any pairwise check quadratic: past
 * this the unit cannot be shown to pass, and it stays the original's. A real unit compares a few hundred
 */
const PAIRS_MAX = 2_000_000

const visible = row => (row.flags & (PH_FLAG.EMPTY | PH_FLAG.LOST)) === 0
/** the unit's size: its lines' median, as the tokens take it */
function sizeOf(unit) {
  const sizes = []
  for (let i = 6; i < unit.lines.length; i += 8) sizes.push(unit.lines[i])
  sizes.sort((a, b) => a - b)
  return (sizes[(sizes.length - 1) >> 1] + sizes[sizes.length >> 1]) / 2
}

// ---------------------------------------------------------------- the pieces

/**
 * A unit's pieces as an answer gives them, as fresh TrPiece, or null: unless it is an array of at most PIECES_MAX pieces,
 * each a TrPiece of the right arity; every k an integer below the unit's pieces, and none twice; every style a non-negative
 * integer within STYLE's flags and the colour table; every text a string of at most 16,000 code units holding no control
 * character but the line feed; and the groups nested: every close after an open, every open closed (a SWITCH needs no
 * close), and the opens and closes paired as the source pairs them. A close names only its own piece, so the source's
 * pairs are read from the k's themselves: in the source the pieces stand in k order, where its groups' opens and closes
 * nest, so that matching them in k order gives its pairs, and the translation's nesting must give the same.
 */
export function checkPieces(pieces, unit) {
  try {
    return check(pieces, unit)
  } catch {
    // an exotic value (a getter, a proxy) that throws when read: refused, never thrown on
    return null
  }
}

function check(pieces, unit) {
  if (!Array.isArray(pieces) || pieces.length > PIECES_MAX) return null
  const count = unit?.pieces
  if (!Number.isInteger(count) || count < 0) return null
  const out = new Array(pieces.length)
  const seen = new Set()
  const open = [], pairs = []
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]
    if (!Array.isArray(p)) return null
    const t = p[0]
    if (t === 0) {
      const s = p[1]
      if (p.length !== 2 || typeof s !== 'string' || s.length > TEXT_MAX || hasControl(s)) return null
      out[i] = [0, s]
      continue
    }
    if ((t !== 1 && t !== 2 && t !== 3) || p.length !== (t === 2 ? 3 : 2)) return null
    const k = p[1]
    if (!Number.isInteger(k) || k < 0 || k >= count || seen.has(k)) return null
    seen.add(k)
    if (t === 1) out[i] = [1, k]
    else if (t === 3) {
      if (!open.length) return null
      pairs.push(open.pop(), k)
      out[i] = [3, k]
    } else {
      const style = p[2]
      if (!Number.isInteger(style) || style < 0 || style >= STYLE_END) return null
      if ((style & STYLE.SWITCH) === 0) open.push(k)
      out[i] = [2, k, style]
    }
  }
  // an open still open here is the source's (a unit cut inside its groups): it holds to the unit's end, as the tokens take it
  return pairs.length && !sourcePairs(pairs, open) ? null : out
}

/** whether the pairs (open, close, open, close, …) are those the k's give the source: its opens (those left open too) and
 *  closes matched in k order */
function sourcePairs(pairs, left) {
  const marks = []
  for (let i = 0; i < pairs.length; i += 2) marks.push(2 * pairs[i], 2 * pairs[i + 1] + 1)
  for (const k of left) marks.push(2 * k)
  marks.sort((a, b) => a - b)
  const stack = [], openOf = new Map()
  for (const m of marks) {
    if ((m & 1) === 0) stack.push(m >> 1)
    else if (!stack.length) return false
    else openOf.set(m >> 1, stack.pop())
  }
  for (let i = 0; i < pairs.length; i += 2) if (openOf.get(pairs[i + 1]) !== pairs[i]) return false
  return true
}

// ---------------------------------------------------------------- before laying

/** whether the layout lost a placeholder of the unit: its ink is somewhere it was not found, and erasing the unit would
 *  take it with nothing to draw it back, whether or not the translation holds it */
export function lostIn(unit) {
  for (const row of unit.ph.values()) if (row.flags & PH_FLAG.LOST) return true
  return false
}

/** whether a text piece holds a character that no face of the role set holds (its CJK faces, every face it falls back
 *  through, its Latin faces) */
export function heldByNone(pieces, roles) {
  const faces = Object.keys(roles?.fallbacks ?? {})
  if (roles?.cjk) for (const f of [roles.cjk.body, roles.cjk.bold, roles.cjk.italic, roles.cjk.boldItalic]) if (f) faces.push(f)
  for (const p of pieces) if (p[0] === 0 && !canDraw(p[1], faces, roles)) return true
  return false
}

// ---------------------------------------------------------------- the laid unit

/**
 * Why a laid unit may not be drawn, or null; the first of, in this order:
 * - 'lost': a placeholder of the unit is LOST;
 * - 'missing', 'twice': a visible placeholder (a row neither EMPTY nor LOST) is not in the laid unit exactly once by k, as
 *   a crop, as page text, or kept (a display). A crop is drawn from its own page's pixels: one set on a page that is not
 *   its every segment's has nothing to be drawn from, and counts for none;
 * - 'overlap': two of the unit's placeholders' segments share more than half of the smaller (a page character carried
 *   twice);
 * - 'erase': an erase rectangle of the unit meets a display's segment or a label of any unit on its page by more than
 *   0.5 pt, across and up;
 * - 'glyph': a drawn character is not in its face (canDraw);
 * - 'brackets': an opening bracket of the translation right before a drawn citation or reference that begins with its own
 *   bracket, or a closing one right after one that ends with its own (a doubled bracket); an echo of a citation's own,
 *   which the tokens do not draw (tokens.mjs echoesOf), is none.
 */
export function netOf(input, laid, tr) {
  const unit = input.file.unit(laid.id)
  if (!unit) return 'missing'
  if (lostIn(unit)) return 'lost'
  const pieces = Array.isArray(tr?.pieces) ? tr.pieces : []
  return drawnOnce(unit, laid) ?? pageTexts(input, unit, laid, pieces) ?? overlapIn(unit) ?? erasing(input.file, unit) ?? glyphs(laid, input.roles) ?? brackets(input, unit, laid, pieces)
}

/** a text's width in ems in a face, as the fit measures it: the measure at 100 px, × the face's size correction */
const emOf = input => (text, face, caps) => (input.measure(text, face, caps) / 100) * faceSize(face)

/**
 * 'missing' where a page text is not its placeholder's own: what it draws is not what the placeholder's own text gives
 * (tokens.mjs pageTextOf: the layout's text, else the page's within the width band, its brackets dropped as the tokens drop
 * them). The page's text is read again here, and measured: a text item of a whole line is never the citation
 */
function pageTexts(input, unit, laid, pieces) {
  const at = new Map()
  pieces.forEach((p, i) => { if (p[0] === 1) at.set(p[1], i) })
  const em = emOf(input), size = sizeOf(unit)
  for (const line of laid.lines) {
    for (const it of line.items) {
      if (it.kind !== 'page-text') continue
      const row = unit.ph.get(it.ph), i = at.get(it.ph)
      if (!row || i === undefined) return 'missing'
      const shown = pageTextOf(row, pieces[i - 1], pieces[i + 1], { textIn: input.textIn, width: t => em(t, it.face, !!it.caps), size })
      if (shown === null || shown !== it.text) return 'missing'
    }
  }
  return null
}

/** 'missing' or 'twice' where a visible placeholder is not drawn exactly once */
function drawnOnce(unit, laid) {
  const times = new Map()
  const once = k => times.set(k, (times.get(k) ?? 0) + 1)
  for (const line of laid.lines) {
    for (const it of line.items) {
      if (it.kind === 'text' || it.ph === undefined) continue
      if (it.kind === 'crop') {
        const segs = unit.ph.get(it.ph)?.segs
        let here = !!segs && segs.length > 0
        for (let s = 0; here && s < segs.length; s += 6) if (segs[s] !== line.page) here = false
        if (!here) continue
      }
      once(it.ph)
    }
  }
  for (const [k, mode] of laid.drawn) if (mode === 'kept') once(k)
  for (const [k, row] of unit.ph) {
    if (!visible(row)) continue
    const n = times.get(k) ?? 0
    if (n === 0) return 'missing'
    if (n > 1) return 'twice'
  }
  return null
}

/** the share of the smaller of two rectangles (x0, y0, x1, y1) that they share */
function shared(a0, a1, a2, a3, b0, b1, b2, b3) {
  const w = Math.min(a2, b2) - Math.max(a0, b0), h = Math.min(a3, b3) - Math.max(a1, b1)
  if (w <= 0 || h <= 0) return 0
  const small = Math.min((a2 - a0) * (a3 - a1), (b2 - b0) * (b3 - b1))
  return small > 0 ? (w * h) / small : 1
}

/** 'overlap' where two placeholders' segments carry one character of the page: compared within a page, in order of their
 *  bottoms, each with those that start below its top */
function overlapIn(unit) {
  const segs = []
  for (const [k, row] of unit.ph) {
    if (!visible(row)) continue
    const s = row.segs
    // page, x0, baseline, x1, top, bottom
    for (let o = 0; o + 5 < s.length; o += 6) segs.push({ k, page: s[o], x0: s[o + 1], x1: s[o + 3], top: s[o + 4], bottom: s[o + 5] })
  }
  segs.sort((a, b) => a.page - b.page || a.bottom - b.bottom)
  let pairs = 0
  for (let i = 0; i < segs.length; i++) {
    const a = segs[i]
    for (let j = i + 1; j < segs.length; j++) {
      const b = segs[j]
      if (b.page !== a.page || b.bottom >= a.top) break
      if (++pairs > PAIRS_MAX) return 'overlap'
      if (b.k !== a.k && shared(a.x0, a.bottom, a.x1, a.top, b.x0, b.bottom, b.x1, b.top) > OVERLAP_SHARE) return 'overlap'
    }
  }
  return null
}

// the kept renderings of each page (every display's segments and every label of the units on it), as x0, y0, x1, y1,
// made once a file and page
const KEPT = new WeakMap()
/** a page's kept renderings: every display's segments and every label of the units on it (x0, y0, x1, y1, stride 4) */
export function keptOn(file, page) {
  let pages = KEPT.get(file)
  if (!pages) KEPT.set(file, (pages = new Map()))
  let out = pages.get(page)
  if (out) return out
  out = []
  for (const id of file.onPage(page)) {
    const u = file.unit(id)
    if (!u) continue
    for (const row of u.ph.values()) {
      if (row.kind !== 'display') continue
      const s = row.segs
      for (let o = 0; o + 5 < s.length; o += 6) if (s[o] === page) out.push(s[o + 1], s[o + 5], s[o + 3], s[o + 4])
    }
    // kind, page, x0, baseline, x1, top, bottom
    const L = u.labels
    for (let o = 0; o + 6 < L.length; o += 7) if (L[o + 1] === page) out.push(L[o + 2], L[o + 6], L[o + 4], L[o + 5])
  }
  pages.set(page, out)
  return out
}

/** 'erase' where the unit's erase meets a kept rendering on its page */
function erasing(file, unit) {
  let pairs = 0
  for (let i = 0; i < unit.erase.length; i++) {
    const rects = unit.erase[i]
    if (!rects.length) continue
    const kept = keptOn(file, unit.lines[8 * i])
    for (let e = 0; e + 3 < rects.length; e += 4) {
      for (let q = 0; q + 3 < kept.length; q += 4) {
        if (++pairs > PAIRS_MAX) return 'erase'
        const w = Math.min(rects[e + 2], kept[q + 2]) - Math.max(rects[e], kept[q])
        const h = Math.min(rects[e + 3], kept[q + 3]) - Math.max(rects[e + 1], kept[q + 1])
        if (w > ERASE_SLACK && h > ERASE_SLACK) return 'erase'
      }
    }
  }
  return null
}

/** 'glyph' where a drawn text has a character its face has not: the texts of each face, asked once a face */
function glyphs(laid, roles) {
  const byFace = new Map()
  for (const line of laid.lines) {
    for (const it of line.items) {
      if (it.kind === 'crop') continue
      if (typeof it.face !== 'string' || typeof it.text !== 'string') return 'glyph'
      byFace.set(it.face, (byFace.get(it.face) ?? '') + it.text)
    }
  }
  for (const [face, text] of byFace) if (!canDraw(text, [face], roles)) return 'glyph'
  return null
}

/**
 * 'brackets' where a bracket of the translation doubles one the rendering beside it brings: an opening bracket right before
 * a placeholder whose rendering begins with one of its kind (round or square, of either width), or a closing one right
 * after one that ends with one of its kind (white space between them aside), where the translation leaves that bracket
 * unmatched, or matches it with one right on the rendering's other side (a pair of its own around the rendering alone).
 * One the translation matches further off is nesting, which passes: '(or (3.1))', and '([10, 25])' whose kinds differ.
 * The rendering is its page text, or a crop's own text (tokens.mjs ownText: the layout's, else the page's within the width
 * band); an equation reference's is '(…)' (amsmath's \eqref) where none reads. A citation or reference whose rendering
 * cannot be read has a bracket beside it that the translation leaves unmatched taken as doubled, whatever its kind. A
 * bracket that echoes a citation's own (tokens.mjs echoesOf: unmatched, beside a citation whose rendering brings one of
 * its kind or reads nowhere, the source bracketing it not) is not drawn, and doubles nothing
 */
function brackets(input, unit, laid, pieces) {
  const items = new Map()
  for (const line of laid.lines) for (const it of line.items) if (it.ph !== undefined && !items.has(it.ph)) items.set(it.ph, it)
  let partner = null
  const em = emOf(input), size = sizeOf(unit)
  const latin = faceFor(input.roles, { script: 'latin', cls: 'serif', design: input.roles.family, bold: false, italic: false, caps: false })
  const own = { textIn: input.textIn, width: t => em(t, latin, false), size }
  // a bracket that echoes a citation's own is drawn as nothing by the tokens (echoesOf): no bracket doubled there
  const echoes = echoesOf(pieces, unit, own)
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]
    if (p[0] !== 1) continue
    const item = items.get(p[1]), row = unit.ph.get(p[1])
    if (!item || !row) continue
    const b = beside(pieces, i - 1, true), a = beside(pieces, i + 1, false)
    const open = b && !echoes.has(b.key) && OPENS.get(b.ch), close = a && !echoes.has(a.key) && CLOSES.get(a.ch)
    if (!open && !close) continue
    partner ??= bracketPairs(pieces)
    let r = null
    if (item.kind === 'page-text') r = item.text ?? null
    else {
      r = ownText(row, own)
      if (r === null && row.kind === 'eqref') r = '(\u2026)'
    }
    if (r === null || !r.length) {
      // its rendering unread: a citation beside a bracket the translation leaves unmatched (one the source brackets: the
      // others are echoes)
      if (BRACKETED.has(row.kind) && ((open && partner.get(b.key) === null) || (close && partner.get(a.key) === null))) return 'brackets'
      continue
    }
    if (open && OPENS.get(r[0]) === open && (partner.get(b.key) === null || (a && partner.get(b.key) === a.key))) return 'brackets'
    if (close && CLOSES.get(r[r.length - 1]) === close && (partner.get(a.key) === null || (b && partner.get(a.key) === b.key))) return 'brackets'
  }
  return null
}
