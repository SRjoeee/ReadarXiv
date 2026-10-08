// The layout file (prep/<mid>/layout-<sha256>.json, spec §4.2): arXiv's PDF as the layer lays over it, made by the layout
// maker from a paper and read by the container's service and the reader's main thread. It is untrusted, so it is refused
// within bounds before it is used: bytes, UTF-8, values and nesting counted before JSON.parse (json.mjs), then its shape
// and every bound with plain loops. A refusal is of the whole file, names its path, and describes a value by its type,
// never by its text. Coordinates are arXiv's PDF units, each page unrotated, y up as in PDF, pages 1-based: a rectangle is not
// empty, x0 < x1 and bottom < top. Every string is returned as it is; nothing here or downstream builds markup from one.
// Imports json.mjs and names.mjs alone: the reader loads it.
import { boundedJson, checkPages, checkViews, isInteger, isNumber, isObject, isVersionToken, LayoutRefusal } from './json.mjs'
import { NAME_KEYS } from './names.mjs'

export { LayoutRefusal } from './json.mjs'

/** the maker's version: raised with any change to what the layout maker writes under this schema; it enters a bundle's
 *  key (bundle.mjs VTAG) and the file as `layout`, which a reader reads for its shape alone: a file is refused by its
 *  `schema`, never by the maker that wrote it (the rules-as-data plan, §9.3), so a change of the schema's fields,
 *  bounds or meaning raises `schema` (and BUNDLE, which holds the file), not this.
 *  2: placeholders found by their own ink in the content stream, and the page text of citations and references;
 *  3: a text symbol the marking could not mark drawn as its character (PH_FLAG.TEXT), no row for a macro TeX said
 *  sets no ink, glyph boxes by their own ink, and the lines a unit's source does not write held (`held`); 4: babel's
 *  names located (`names`, the file's schema 2), and no unit's label holding one */
export const LAYOUT = '4'
/** the file's schema: 2 holds `names` */
export const LAYOUT_SCHEMA = 2
export const LAYOUT_CAP = 4 * 2 ** 20
export const LAYOUT_VALUES = 1_000_000
/** the deepest the file nests: its object, then lines, frames or erase (the arrays of entries), then an entry [id, rows],
 *  then its rows (a flat array of numbers): four brackets, and no other field of the schema reaches past three */
export const LAYOUT_DEPTH = 4
export const UNIT_KINDS = Object.freeze(['para', 'heading', 'caption', 'footnote', 'cell', 'abstract', 'theorem', 'figure', 'author'])
export const PH_KINDS = Object.freeze(['math', 'display', 'cite', 'ref', 'eqref', 'footnote', 'macro', 'url', 'code', 'other'])
export const LABEL_KINDS = Object.freeze(['number', 'item', 'caption', 'footnote'])
export const UNIT_FLAG = Object.freeze({ TITLE: 1, FRONT: 2, CENTRED: 4 })
/** babel's names (names.mjs), whose occurrences the file locates (`names`) */
export { NAME_KEYS } from './names.mjs'
/** a name's flags. CENTRED: centred in its column, as a unit is (UNIT_FLAG.CENTRED); CAPITALS: its glyphs capitals where
 *  its macro's own text is not (a class's case change, which the target's name takes too); RUN_IN: the lead of a unit's
 *  first line, which TeX sets right after it on that line (IEEEtran's "Abstract—…", amsthm's "Proof. …"), its row naming
 *  the unit */
export const NAME_FLAG = Object.freeze({ CENTRED: 1, CAPITALS: 2, RUN_IN: 4 })
/** a placeholder's flags. TEXT: a LaTeX text symbol (\%, \_) drawn as its one character, the file's pageText, where
 *  the unit's lines on arXiv's page show it (a macro's only, no segments: its ink is the line's, erased with it) */
export const PH_FLAG = Object.freeze({ SOURCE_BRACKETS: 1, NUMBERED: 2, RAISED: 4, LOWERED: 8, EMPTY: 16, LOST: 32, TEXT: 64 })

const KEYS = ['schema', 'layout', 'pdfjs', 'paper', 'left', 'views', 'fonts', 'units', 'lines', 'frames', 'erase', 'ph', 'labels', 'headings', 'pageText', 'held', 'names']
/** the placeholders the layer may draw as text in the page's face (Task 9's tokens), whose own text the file may hold */
export const PAGE_TEXT_KINDS = Object.freeze(['cite', 'ref', 'eqref'])
/** a page text's code units at most, and a file's in all */
export const TEXT_MAX = 256, PAGE_TEXT_ALL = 500_000
/** a page text: 1 to TEXT_MAX code units, and of white space only a space, as the text layer gives it: no control
 *  character (C0, DEL, C1), no bidi control, no line or paragraph separator, no byte order mark, no lone surrogate */
export function isPageText(s) {
  if (typeof s !== 'string' || s.length < 1 || s.length > TEXT_MAX) return false
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x061c || c === 0x200e || c === 0x200f || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff) return false
    if (c >= 0xd800 && c <= 0xdbff) { const d = s.charCodeAt(i + 1); if (!(d >= 0xdc00 && d <= 0xdfff)) return false; i++; continue }
    if (c >= 0xdc00 && c <= 0xdfff) return false
  }
  return true
}
const PAPER_KEYS = ['id', 'version', 'pages']
/** a new-style arXiv identifier (10 characters), or an old one: its archive, 2 to 16 letters (the longest, astro-ph,
 *  cond-mat or plasm-ph, has 8; the rest is margin), a subject class, a slash and 7 digits, so 27 characters at most. The
 *  version is the paper's own field, never a suffix of the id */
const PAPER_ID = /^(?:\d{4}\.\d{4,5}|[a-z-]{2,16}(?:\.[A-Z]{2})?\/\d{7})$/
export const isPaperId = id => typeof id === 'string' && PAPER_ID.test(id)
/** a paper's version at most */
export const VERSION_MAX = 1000
const PDFJS_MAX = 32, LEFT_MAX = 128, FONTS_MAX = 512, FONT_MAX = 128
const PIECES_MAX = 10000, DEPTH_MIN = -1, DEPTH_MAX = 5, DEPTH_NONE = 9
const LINES_UNIT = 2000, LINES_ALL = 200000, SIZE_MAX = 200
const SHARE_MAX = 1000, ERASE_LINE = 16, SEGS_INLINE = 4, SEGS_DISPLAY = 64, LABELS_UNIT = 4, SRC_MAX = 4000
/** a file's names at most: a heading a babel name sets is a few a paper, a thesis's some tens */
export const NAMES_MAX = 10_000
const NAME_BITS = NAME_FLAG.CENTRED | NAME_FLAG.CAPITALS | NAME_FLAG.RUN_IN
/** a name's row: its values */
const NAME_ROW = 15
/** a rectangle lies within its page's view by this, PDF units */
const SLACK = 1
const UNIT_BITS = UNIT_FLAG.TITLE | UNIT_FLAG.FRONT | UNIT_FLAG.CENTRED
const PH_BITS = 127
const HEADING = UNIT_KINDS.indexOf('heading'), DISPLAY = PH_KINDS.indexOf('display'), MACRO = PH_KINDS.indexOf('macro')
const PAGE_TEXT = new Set(PAGE_TEXT_KINDS.map(k => PH_KINDS.indexOf(k)))
const ID_MAX = Number.MAX_SAFE_INTEGER

// ---------------------------------------------------------------- refusals
/** what a value is, for a refusal: its type, never its text */
const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v)
/** an untrusted name in a path: its first 20 code units */
const clip = s => (s.length > 20 ? `${s.slice(0, 20)}…` : s)
const refuse = (path, why) => new LayoutRefusal(path, why)
/** name[i][k], or name[i][sub][k] for an entry's rows: built only once a refusal is certain */
const at = (name, i, sub, k) => (sub < 0 ? `${name}[${i}][${k}]` : `${name}[${i}][${sub}][${k}]`)

/** an object with exactly `keys`; an extra key is named by its first 20 code units */
function exactKeys(v, keys, path) {
  if (!isObject(v)) throw refuse(path, `not an object (${kindOf(v)})`)
  const name = k => (path ? `${path}.${k}` : k)
  for (let i = 0; i < keys.length; i++) if (!Object.hasOwn(v, keys[i])) throw refuse(name(keys[i]), 'missing')
  const own = Object.keys(v)
  if (own.length !== keys.length) for (let i = 0; i < own.length; i++) if (!keys.includes(own[i])) throw refuse(name(clip(own[i])), 'not a key of the schema')
  return v
}

/** a string of lo to hi characters, each printable ASCII (0x20–0x7e) */
function printable(v, lo, hi) {
  if (typeof v !== 'string' || v.length < lo || v.length > hi) return false
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i)
    if (c < 0x20 || c > 0x7e) return false
  }
  return true
}

/** an array, or a refusal naming its type */
function array(v, path) {
  if (!Array.isArray(v)) throw refuse(path, `not an array (${kindOf(v)})`)
  return v
}

/** an entry [id, rows] of lines, frames or erase: the id above the last entry's and a unit of units, the rows `stride`
 *  numbers each, at least one row; gives the unit's index in units */
function entry(e, i, name, last, slot, stride) {
  if (!Array.isArray(e) || e.length !== 2) throw refuse(`${name}[${i}]`, `not [id, rows] (${kindOf(e)})`)
  const id = e[0]
  if (!isInteger(id, last + 1, ID_MAX)) throw refuse(`${name}[${i}][0]`, 'not an id above the last')
  const u = slot.get(id)
  if (u === undefined) throw refuse(`${name}[${i}][0]`, 'not a unit of units')
  const r = e[1]
  if (!Array.isArray(r) || r.length === 0 || r.length % stride !== 0) throw refuse(`${name}[${i}][1]`, `not rows of ${stride} numbers, at least one`)
  return u
}

/**
 * A page and a rectangle in r from o: the page at o, then x0, x1, baseline, top and bottom at their offsets from o. The
 * page one of the paper's; each coordinate a finite number within the page's view by SLACK; x0 < x1, bottom < top; with
 * `window`, the baseline from bottom − 1 to top + 1. Refused at the number that breaks it
 */
function checkBox(r, o, X0, X1, BASE, TOP, BOT, window, views, pages, name, i, sub) {
  const page = r[o]
  if (!isInteger(page, 1, pages)) throw refuse(at(name, i, sub, o), `not a page 1 to ${pages}`)
  const v = 4 * (page - 1)
  const xlo = views[v] - SLACK, ylo = views[v + 1] - SLACK, xhi = views[v + 2] + SLACK, yhi = views[v + 3] + SLACK
  const x0 = r[o + X0], x1 = r[o + X1], base = r[o + BASE], top = r[o + TOP], bottom = r[o + BOT]
  if (!isNumber(x0) || x0 < xlo || x0 > xhi) throw refuse(at(name, i, sub, o + X0), `not a number within its page's view (${kindOf(x0)})`)
  if (!isNumber(x1) || x1 < xlo || x1 > xhi) throw refuse(at(name, i, sub, o + X1), `not a number within its page's view (${kindOf(x1)})`)
  if (x1 <= x0) throw refuse(at(name, i, sub, o + X1), 'not right of x0')
  if (!isNumber(top) || top < ylo || top > yhi) throw refuse(at(name, i, sub, o + TOP), `not a number within its page's view (${kindOf(top)})`)
  if (!isNumber(bottom) || bottom < ylo || bottom > yhi) throw refuse(at(name, i, sub, o + BOT), `not a number within its page's view (${kindOf(bottom)})`)
  if (bottom >= top) throw refuse(at(name, i, sub, o + BOT), 'not below top')
  if (!isNumber(base) || base < ylo || base > yhi) throw refuse(at(name, i, sub, o + BASE), `not a number within its page's view (${kindOf(base)})`)
  if (window && (base < bottom - 1 || base > top + 1)) throw refuse(at(name, i, sub, o + BASE), 'not within 1 of its bottom and top')
  return page
}

/** a zero written -0 as 0, so that the file written again reads the same (JSON.stringify writes -0 as 0) */
function zeroes(r) {
  for (let j = 0; j < r.length; j++) if (r[j] === 0) r[j] = 0
}

// ---------------------------------------------------------------- the parser
/** bytes, then UTF-8, then values and nesting counted, then JSON.parse, then every bound; throws LayoutRefusal */
export function parseLayout(bytes) {
  if (!(bytes instanceof Uint8Array)) throw refuse('', `not bytes (${kindOf(bytes)})`)
  return checkLayout(boundedJson(bytes, { cap: LAYOUT_CAP, values: LAYOUT_VALUES, depth: LAYOUT_DEPTH }))
}

/** a file already parsed, within the bounds of what holds it (a layer bundle, layer-proto/bundle.mjs): every bound
 *  parseLayout checks past JSON.parse. Returns the value itself, its -0s written 0; throws LayoutRefusal */
export function checkLayout(value) {
  // (its schema first: a file of another names other fields, and is refused for what it is)
  if (isObject(value) && Object.hasOwn(value, 'schema') && value.schema !== LAYOUT_SCHEMA) throw refuse('schema', `not ${LAYOUT_SCHEMA}`)
  const f = exactKeys(value, KEYS, '')
  if (f.schema !== LAYOUT_SCHEMA) throw refuse('schema', `not ${LAYOUT_SCHEMA}`)
  if (!isVersionToken(f.layout)) throw refuse('layout', `not a version, 1 to 32 letters, digits or points (${kindOf(f.layout)})`)
  if (!printable(f.pdfjs, 1, PDFJS_MAX)) throw refuse('pdfjs', `not 1 to ${PDFJS_MAX} printable ASCII characters (${kindOf(f.pdfjs)})`)
  const paper = exactKeys(f.paper, PAPER_KEYS, 'paper')
  if (!isPaperId(paper.id)) throw refuse('paper.id', `not an arXiv identifier (${kindOf(paper.id)})`)
  if (!isInteger(paper.version, 1, VERSION_MAX)) throw refuse('paper.version', `not an integer 1 to ${VERSION_MAX}`)
  const pages = checkPages(paper.pages, 'paper.pages')
  if (!printable(f.left, 0, LEFT_MAX)) throw refuse('left', `not 0 to ${LEFT_MAX} printable ASCII characters (${kindOf(f.left)})`)
  const views = checkViews(f.views, pages, 'views')
  zeroes(views)

  const fonts = array(f.fonts, 'fonts')
  if (fonts.length > FONTS_MAX) throw refuse('fonts', `more than ${FONTS_MAX} names`)
  for (let i = 0; i < fonts.length; i++) if (!printable(fonts[i], 1, FONT_MAX)) throw refuse(`fonts[${i}]`, `not 1 to ${FONT_MAX} printable ASCII characters (${kindOf(fonts[i])})`)

  // units: by id, their index in units; each unit's kind, pieces and line rows by that index
  const units = array(f.units, 'units'), n = units.length
  const slot = new Map(), kindAt = new Uint8Array(n), piecesAt = new Uint16Array(n), rowsAt = new Array(n).fill(null)
  let last = -1
  for (let i = 0; i < n; i++) {
    const u = units[i]
    if (!Array.isArray(u) || u.length !== 5) throw refuse(`units[${i}]`, `not [id, kind, depth, flags, pieces] (${kindOf(u)})`)
    const id = u[0], kind = u[1], depth = u[2], flags = u[3], pieces = u[4]
    if (!isInteger(id, last + 1, ID_MAX)) throw refuse(`units[${i}][0]`, 'not an id above the last')
    if (!isInteger(kind, 0, UNIT_KINDS.length - 1)) throw refuse(`units[${i}][1]`, 'not a kind of UNIT_KINDS')
    if (!isInteger(depth, DEPTH_MIN, DEPTH_MAX) && depth !== DEPTH_NONE) throw refuse(`units[${i}][2]`, `not a depth ${DEPTH_MIN} to ${DEPTH_MAX}, or ${DEPTH_NONE}`)
    if (!isInteger(flags, 0, UNIT_BITS)) throw refuse(`units[${i}][3]`, 'not flags of UNIT_FLAG')
    if (!isInteger(pieces, 0, PIECES_MAX)) throw refuse(`units[${i}][4]`, `not a count 0 to ${PIECES_MAX}`)
    zeroes(u)
    last = u[0]
    slot.set(last, i)
    kindAt[i] = kind
    piecesAt[i] = pieces
  }

  const lines = array(f.lines, 'lines'), nFonts = fonts.length
  let total = 0
  last = -1
  for (let i = 0; i < lines.length; i++) {
    const e = lines[i], u = entry(e, i, 'lines', last, slot, 8), r = e[1]
    if (r.length > 8 * LINES_UNIT) throw refuse(`lines[${i}][1]`, `more than ${LINES_UNIT} lines`)
    total += r.length / 8
    if (total > LINES_ALL) throw refuse('lines', `more than ${LINES_ALL} lines`)
    for (let j = 0; j < r.length; j += 8) {
      checkBox(r, j, 1, 2, 3, 4, 5, true, views, pages, 'lines', i, 1)
      const size = r[j + 6]
      if (!isNumber(size) || size <= 0 || size > SIZE_MAX) throw refuse(at('lines', i, 1, j + 6), `not a size above 0 to ${SIZE_MAX} (${kindOf(size)})`)
      if (!isInteger(r[j + 7], 0, nFonts - 1)) throw refuse(at('lines', i, 1, j + 7), 'not an index of fonts')
    }
    zeroes(r)
    if (e[0] === 0) e[0] = 0
    last = e[0]
    rowsAt[u] = r
  }

  // frames: page, column, first line, lines, share, below. They cover the unit's lines in order, each on its page
  const frames = array(f.frames, 'frames'), framed = new Uint8Array(n)
  last = -1
  for (let i = 0; i < frames.length; i++) {
    const e = frames[i], u = entry(e, i, 'frames', last, slot, 6), r = e[1], own = rowsAt[u]
    if (own === null) throw refuse(`frames[${i}][0]`, 'a unit without lines')
    const count = own.length / 8
    let next = 0, share = -1
    for (let j = 0; j < r.length; j += 6) {
      const page = r[j]
      if (!isInteger(page, 1, pages)) throw refuse(at('frames', i, 1, j), `not a page 1 to ${pages}`)
      const column = r[j + 1]
      if (column !== 0 && column !== 1 && column !== 2) throw refuse(at('frames', i, 1, j + 1), 'not a column 0, 1 or 2')
      if (r[j + 2] !== next) throw refuse(at('frames', i, 1, j + 2), j === 0 ? 'not 0' : "not the line after the last frame's")
      const k = r[j + 3]
      if (!isInteger(k, 1, count - next)) throw refuse(at('frames', i, 1, j + 3), "not 1 to the unit's lines left")
      for (let l = next; l < next + k; l++) if (own[8 * l] !== page) throw refuse(at('frames', i, 1, j), 'not the page of its lines')
      const s = r[j + 4]
      if (j === 0 ? s !== -1 : !isInteger(s, Math.max(share, 0), SHARE_MAX)) throw refuse(at('frames', i, 1, j + 4), j === 0 ? 'not -1 for the first frame' : `not a share from the last to ${SHARE_MAX}`)
      share = s
      const below = r[j + 5], v = 4 * (page - 1)
      if (!isNumber(below) || below < 0 || below > views[v + 3] - views[v + 1]) throw refuse(at('frames', i, 1, j + 5), `not 0 to its page's height (${kindOf(below)})`)
      next += k
    }
    if (next !== count) throw refuse(`frames[${i}][1]`, "not covering the unit's lines")
    zeroes(r)
    if (e[0] === 0) e[0] = 0
    last = e[0]
    framed[u] = 1
  }
  for (let u = 0; u < n; u++) if (rowsAt[u] !== null && framed[u] === 0) throw refuse('frames', `none for unit ${units[u][0]}, which has lines`)

  // erase: line, x0, y0, x1, y1, on the line's page
  const erase = array(f.erase, 'erase'), erasedLines = new Map()
  last = -1
  for (let i = 0; i < erase.length; i++) {
    const e = erase[i], u = entry(e, i, 'erase', last, slot, 5), r = e[1], own = rowsAt[u]
    if (own === null) throw refuse(`erase[${i}][0]`, 'a unit without lines')
    const count = own.length / 8, onLine = new Uint8Array(count)
    for (let j = 0; j < r.length; j += 5) {
      const line = r[j]
      if (!isInteger(line, 0, count - 1)) throw refuse(at('erase', i, 1, j), "not a line of the unit's")
      if (++onLine[line] > ERASE_LINE) throw refuse(at('erase', i, 1, j), `more than ${ERASE_LINE} rectangles on its line`)
      ;(erasedLines.get(u) ?? erasedLines.set(u, new Set()).get(u)).add(line)
      const v = 4 * (own[8 * line] - 1)
      const xlo = views[v] - SLACK, ylo = views[v + 1] - SLACK, xhi = views[v + 2] + SLACK, yhi = views[v + 3] + SLACK
      for (let c = 1; c <= 4; c++) {
        const x = r[j + c], lo = c % 2 === 1 ? xlo : ylo, hi = c % 2 === 1 ? xhi : yhi
        if (!isNumber(x) || x < lo || x > hi) throw refuse(at('erase', i, 1, j + c), `not a number within its line's view (${kindOf(x)})`)
        if (c >= 3 && x <= r[j + c - 2]) throw refuse(at('erase', i, 1, j + c), 'an empty rectangle')
      }
    }
    zeroes(r)
    if (e[0] === 0) e[0] = 0
    last = e[0]
  }

  // placeholders: unit, k, kind, flags, then per segment: page, x0, baseline, x1, top, bottom
  const ph = array(f.ph, 'ph'), seen = new Set(), pageTexts = new Set(), symbols = new Set()
  for (let i = 0; i < ph.length; i++) {
    const r = ph[i]
    if (!Array.isArray(r) || r.length < 4 || (r.length - 4) % 6 !== 0) throw refuse(`ph[${i}]`, `not 4 + 6 × n numbers (${kindOf(r)})`)
    const u = slot.get(r[0])
    if (u === undefined) throw refuse(`ph[${i}][0]`, 'not a unit of units')
    const k = r[1]
    if (!isInteger(k, 0, piecesAt[u] - 1)) throw refuse(`ph[${i}][1]`, "not a piece below its unit's pieces")
    const key = u * (PIECES_MAX + 1) + k
    if (seen.has(key)) throw refuse(`ph[${i}][1]`, 'a piece twice in its unit')
    seen.add(key)
    const kind = r[2], flags = r[3]
    if (!isInteger(kind, 0, PH_KINDS.length - 1)) throw refuse(`ph[${i}][2]`, 'not a kind of PH_KINDS')
    if (!isInteger(flags, 0, PH_BITS)) throw refuse(`ph[${i}][3]`, 'not flags of PH_FLAG')
    const empty = (flags & PH_FLAG.EMPTY) !== 0, lost = (flags & PH_FLAG.LOST) !== 0, symbol = (flags & PH_FLAG.TEXT) !== 0
    if (empty && lost) throw refuse(`ph[${i}][3]`, 'EMPTY and LOST together')
    if (symbol && (empty || lost || kind !== MACRO || r.length !== 4)) throw refuse(`ph[${i}]`, 'TEXT but on a macro alone, with no segments')
    if ((flags & PH_FLAG.NUMBERED) !== 0 && kind !== DISPLAY) throw refuse(`ph[${i}][3]`, 'NUMBERED on a kind not display')
    const segs = (r.length - 4) / 6, most = kind === DISPLAY ? SEGS_DISPLAY : SEGS_INLINE
    if (empty || lost || symbol ? segs !== 0 : segs < 1 || segs > most) throw refuse(`ph[${i}]`, empty || lost || symbol ? 'segments on an EMPTY, LOST or TEXT placeholder' : `not 1 to ${most} segments`)
    for (let o = 4; o < r.length; o += 6) checkBox(r, o, 1, 3, 2, 4, 5, false, views, pages, 'ph', i, -1)
    zeroes(r)
    if (!empty && !lost && PAGE_TEXT.has(kind)) pageTexts.add(key)
    if (symbol) { pageTexts.add(key); symbols.add(key) }
  }

  // labels: unit, kind, page, x0, baseline, x1, top, bottom, a rectangle as a line's
  const labels = array(f.labels, 'labels'), onUnit = new Uint8Array(n)
  for (let i = 0; i < labels.length; i++) {
    const r = labels[i]
    if (!Array.isArray(r) || r.length !== 8) throw refuse(`labels[${i}]`, `not [unit, kind, page, x0, baseline, x1, top, bottom] (${kindOf(r)})`)
    const u = slot.get(r[0])
    if (u === undefined) throw refuse(`labels[${i}][0]`, 'not a unit of units')
    if (++onUnit[u] > LABELS_UNIT) throw refuse(`labels[${i}][0]`, `more than ${LABELS_UNIT} labels on its unit`)
    if (!isInteger(r[1], 0, LABEL_KINDS.length - 1)) throw refuse(`labels[${i}][1]`, 'not a kind of LABEL_KINDS')
    checkBox(r, 2, 1, 3, 2, 4, 5, true, views, pages, 'labels', i, -1)
    zeroes(r)
  }

  const headings = array(f.headings, 'headings'), named = new Uint8Array(n)
  for (let i = 0; i < headings.length; i++) {
    const e = headings[i]
    if (!Array.isArray(e) || e.length !== 2) throw refuse(`headings[${i}]`, `not [id, src] (${kindOf(e)})`)
    const u = slot.get(e[0])
    if (u === undefined) throw refuse(`headings[${i}][0]`, 'not a unit of units')
    if (kindAt[u] !== HEADING) throw refuse(`headings[${i}][0]`, 'not a heading unit')
    if (named[u] === 1) throw refuse(`headings[${i}][0]`, 'a heading twice')
    named[u] = 1
    const src = e[1]
    if (typeof src !== 'string' || src.length > SRC_MAX) throw refuse(`headings[${i}][1]`, `not a string of at most ${SRC_MAX} code units (${kindOf(src)})`)
    if (e[0] === 0) e[0] = 0
  }

  // page texts: unit, k, its own text; of a found placeholder of a page-text kind, rising by unit and k
  const texts = array(f.pageText, 'pageText')
  let lastKey = -1, all = 0
  for (let i = 0; i < texts.length; i++) {
    const e = texts[i]
    if (!Array.isArray(e) || e.length !== 3) throw refuse(`pageText[${i}]`, `not [id, k, text] (${kindOf(e)})`)
    const u = slot.get(e[0])
    if (u === undefined) throw refuse(`pageText[${i}][0]`, 'not a unit of units')
    if (u * (PIECES_MAX + 1) < Math.floor(lastKey / (PIECES_MAX + 1)) * (PIECES_MAX + 1)) throw refuse(`pageText[${i}][0]`, 'not a unit from the last on')
    const key = u * (PIECES_MAX + 1) + e[1]
    if (!isInteger(e[1], 0, PIECES_MAX) || !pageTexts.has(key)) throw refuse(`pageText[${i}][1]`, 'not a found placeholder of a page-text kind, nor a TEXT one')
    if (key <= lastKey) throw refuse(`pageText[${i}][1]`, 'not a piece above the last')
    lastKey = key
    const text = e[2]
    if (!isPageText(text)) throw refuse(`pageText[${i}][2]`, `not 1 to ${TEXT_MAX} code units of text (${kindOf(text)})`)
    all += text.length
    if (all > PAGE_TEXT_ALL) throw refuse('pageText', `more than ${PAGE_TEXT_ALL} code units`)
    if (e[0] === 0) e[0] = 0
    symbols.delete(key)
  }
  if (symbols.size) throw refuse('pageText', 'a TEXT placeholder with no text')

  // held: a unit's lines its source does not write (no slot, never erased), by index rising, never its first; none
  // erased
  const held = array(f.held, 'held')
  last = -1
  for (let i = 0; i < held.length; i++) {
    const e = held[i], u = entry(e, i, 'held', last, slot, 1), r = e[1], own = rowsAt[u]
    if (own === null) throw refuse(`held[${i}][0]`, 'a unit without lines')
    const count = own.length / 8
    let prev = 0
    for (let j = 0; j < r.length; j++) {
      if (!isInteger(r[j], prev + 1, count - 1)) throw refuse(at('held', i, 1, j), "not a line of the unit's after the last, nor its first")
      if (erasedLines.get(u)?.has(r[j])) throw refuse(at('held', i, 1, j), 'a line with an erase')
      prev = r[j]
    }
    if (e[0] === 0) e[0] = 0
    last = e[0]
  }

  // names: occurrence, key, page, x0, baseline, x1, top, bottom, size, font, flags, unit, glue, column x0, column x1; by
  // occurrence rising, at most NAMES_MAX, each a rectangle as a line's. unit: the unit a RUN_IN name leads (one of the
  // file's), else -1; glue: the original's space between its joint and the unit's text (0 where not RUN_IN); the column:
  // its TeX column's text edges on the page, the room a name has
  const names = array(f.names, 'names')
  if (names.length > NAMES_MAX) throw refuse('names', `more than ${NAMES_MAX} names`)
  last = -1
  for (let i = 0; i < names.length; i++) {
    const r = names[i]
    if (!Array.isArray(r) || r.length !== NAME_ROW) throw refuse(`names[${i}]`, `not [occurrence, key, page, x0, baseline, x1, top, bottom, size, font, flags, unit, glue, column x0, column x1] (${kindOf(r)})`)
    if (!isInteger(r[0], last + 1, ID_MAX)) throw refuse(`names[${i}][0]`, 'not an occurrence above the last')
    if (!isInteger(r[1], 0, NAME_KEYS.length - 1)) throw refuse(`names[${i}][1]`, 'not a key of NAME_KEYS')
    checkBox(r, 2, 1, 3, 2, 4, 5, true, views, pages, 'names', i, -1)
    const size = r[8]
    if (!isNumber(size) || size <= 0 || size > SIZE_MAX) throw refuse(`names[${i}][8]`, `not a size above 0 to ${SIZE_MAX} (${kindOf(size)})`)
    if (!isInteger(r[9], 0, nFonts - 1)) throw refuse(`names[${i}][9]`, 'not an index of fonts')
    if (!isInteger(r[10], 0, NAME_BITS)) throw refuse(`names[${i}][10]`, 'not flags of NAME_FLAG')
    const runIn = (r[10] & NAME_FLAG.RUN_IN) !== 0, v = 4 * (r[2] - 1), width = views[v + 2] - views[v]
    if (runIn ? !(isInteger(r[11], 0, ID_MAX) && slot.has(r[11])) : r[11] !== -1) throw refuse(`names[${i}][11]`, runIn ? 'not a unit of the file' : 'not -1, the name leading no unit')
    if (!isNumber(r[12]) || r[12] < 0 || r[12] > width || (!runIn && r[12] !== 0)) throw refuse(`names[${i}][12]`, runIn ? 'not a glue 0 to the page\'s width' : 'not 0, the name leading no unit')
    if (!isNumber(r[13]) || !isNumber(r[14]) || r[13] < views[v] - 1 || r[14] > views[v + 2] + 1 || r[13] >= r[14]) throw refuse(`names[${i}][13]`, "not a column's edges on the page")
    zeroes(r)
    last = r[0]
  }
  return f
}

// ---------------------------------------------------------------- the writer
const r2 = v => Math.round(v * 100) / 100
/** rows of `stride` with the coordinates (offsets `exact` excepted) to a hundredth */
const rounded = (rows, stride, exact) => rows.map((v, j) => (exact.includes(j % stride) ? v : r2(v)))
const LINE_EXACT = [0, 7], FRAME_EXACT = [0, 1, 2, 3, 4], ERASE_EXACT = [0], LABEL_EXACT = [0, 1, 2], NAME_EXACT = [0, 1, 2, 9, 10, 11]

/** the file as written: keys in the schema's order, numbers to a hundredth, no white space */
export function encodeLayout(file) {
  const { schema, layout, pdfjs, paper, left, views, fonts, units, lines, frames, erase, ph, labels, headings, pageText, held, names } = file
  return JSON.stringify({
    schema, layout, pdfjs,
    paper: { id: paper.id, version: paper.version, pages: paper.pages },
    left,
    views: views.map(r2),
    fonts,
    units,
    lines: lines.map(([id, rows]) => [id, rounded(rows, 8, LINE_EXACT)]),
    frames: frames.map(([id, rows]) => [id, rounded(rows, 6, FRAME_EXACT)]),
    erase: erase.map(([id, rows]) => [id, rounded(rows, 5, ERASE_EXACT)]),
    // unit, k, kind and flags as they are; each segment's page too
    ph: ph.map(r => r.map((v, j) => (j < 4 || (j - 4) % 6 === 0 ? v : r2(v)))),
    labels: labels.map(r => rounded(r, 8, LABEL_EXACT)),
    headings,
    pageText,
    held,
    names: names.map(r => rounded(r, NAME_ROW, NAME_EXACT)),
  })
}

// ---------------------------------------------------------------- the index
const NONE = Object.freeze(new Float64Array(0))
const NO_UNITS = Object.freeze([])
const NO_HELD = Object.freeze([])
const NO_NAMES = Object.freeze([])

/** a parsed file's index, in one pass over each array; every typed array holds numbers copied from the file */
export function indexLayout(file) {
  const { units, lines, frames, erase, ph, labels, headings, views, fonts, pageText, held, names } = file
  const pages = file.paper.pages
  const byId = new Map()
  for (let i = 0; i < units.length; i++) {
    const [id, kind, depth, flags, pieces] = units[i]
    byId.set(id, {
      id, kind: UNIT_KINDS[kind], depth,
      title: (flags & UNIT_FLAG.TITLE) !== 0, front: (flags & UNIT_FLAG.FRONT) !== 0, centred: (flags & UNIT_FLAG.CENTRED) !== 0,
      pieces, lines: NONE, frames: NONE, erase: [], ph: new Map(), labels: NONE, heading: null, held: NO_HELD,
    })
  }
  for (let i = 0; i < lines.length; i++) {
    const unit = byId.get(lines[i][0]), rows = lines[i][1]
    unit.lines = Float64Array.from(rows)
    unit.erase = new Array(rows.length / 8).fill(NONE)
  }
  // a unit is listed once on a page however many frames it has there: ids rise, so its pushes to a page are adjacent
  const onPage = new Array(pages + 1).fill(NO_UNITS)
  for (let i = 0; i < frames.length; i++) {
    const id = frames[i][0], rows = frames[i][1]
    byId.get(id).frames = Float64Array.from(rows)
    for (let j = 0; j < rows.length; j += 6) {
      const p = rows[j]
      if (onPage[p] === NO_UNITS) onPage[p] = []
      const list = onPage[p]
      if (list[list.length - 1] !== id) list.push(id)
    }
  }
  for (let p = 1; p <= pages; p++) Object.freeze(onPage[p])
  for (let i = 0; i < erase.length; i++) {
    const unit = byId.get(erase[i][0]), rows = erase[i][1], perLine = []
    for (let j = 0; j < rows.length; j += 5) (perLine[rows[j]] ??= []).push(rows[j + 1], rows[j + 2], rows[j + 3], rows[j + 4])
    for (let l = 0; l < perLine.length; l++) if (perLine[l] !== undefined) unit.erase[l] = Float64Array.from(perLine[l])
  }
  const textOf = new Map()
  for (let i = 0; i < pageText.length; i++) textOf.set(`${pageText[i][0]}|${pageText[i][1]}`, pageText[i][2])
  for (let i = 0; i < ph.length; i++) {
    const r = ph[i], segs = new Float64Array(r.length - 4)
    for (let j = 4; j < r.length; j++) segs[j - 4] = r[j]
    byId.get(r[0]).ph.set(r[1], { kind: PH_KINDS[r[2]], flags: r[3], segs, text: textOf.get(`${r[0]}|${r[1]}`) ?? null })
  }
  const labelsOf = new Map()
  for (let i = 0; i < labels.length; i++) {
    const r = labels[i], id = r[0]
    let list = labelsOf.get(id)
    if (list === undefined) labelsOf.set(id, (list = []))
    for (let j = 1; j < 8; j++) list.push(r[j])
  }
  for (const [id, list] of labelsOf) byId.get(id).labels = Float64Array.from(list)
  for (let i = 0; i < headings.length; i++) byId.get(headings[i][0]).heading = headings[i][1]
  for (let i = 0; i < held.length; i++) byId.get(held[i][0]).held = Object.freeze([...held[i][1]])
  for (const unit of byId.values()) {
    Object.freeze(unit.erase)
    Object.freeze(unit)
  }
  // each page's names, in the file's order
  const namesOn = new Array(pages + 1).fill(NO_NAMES)
  for (let i = 0; i < names.length; i++) {
    const r = names[i], p = r[2]
    if (namesOn[p] === NO_NAMES) namesOn[p] = []
    namesOn[p].push(Object.freeze({ occurrence: r[0], key: NAME_KEYS[r[1]], page: p, x0: r[3], baseline: r[4], x1: r[5], top: r[6], bottom: r[7], size: r[8], font: r[9], centred: (r[10] & NAME_FLAG.CENTRED) !== 0, capitals: (r[10] & NAME_FLAG.CAPITALS) !== 0, unit: r[11], glue: r[12], cx0: r[13], cx1: r[14] }))
  }
  for (let p = 1; p <= pages; p++) Object.freeze(namesOn[p])
  const viewOf = new Array(pages + 1)
  for (let p = 1; p <= pages; p++) viewOf[p] = Object.freeze(views.slice(4 * (p - 1), 4 * p))
  return Object.freeze({
    file,
    unit: id => byId.get(id) ?? null,
    onPage: page => onPage[page] ?? NO_UNITS,
    names: page => namesOn[page] ?? NO_NAMES,
    view: page => {
      const v = Number.isInteger(page) ? viewOf[page] : undefined
      if (v === undefined) throw new RangeError('not a page of the file')
      return v
    },
    font: index => {
      if (!Number.isInteger(index) || index < 0 || index >= fonts.length) throw new RangeError('not a font of the file')
      return fonts[index]
    },
  })
}
