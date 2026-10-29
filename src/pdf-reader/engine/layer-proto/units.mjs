// The paper's units as the layer's files hold them, and base64: what BUNDLE 3's file (bundle.mjs) and BUNDLE 4's units chunks
// (format.mjs) share. A unit is openPaper's, language-independent, its position dropped and a nested piece naming its inner
// unit by id (bundleUnitsOf, the writer's); a reader checks one unit at a time (unitStands) and drops one that does not stand.
// Imports the layout's parsers alone, never the run, the remover nor the front end: a reader loads it.
import { isInteger, isObject, LayoutRefusal, STRING_MAX } from '../layout/json.mjs'
import { OCR_KIND } from '../rules/content-classes.mjs'
import { placeStands } from './ocr-rows.mjs'

/** a unit's flags: the paper's title, the front matter, written back in the source's brackets, kept as it is (a name,
 *  live.mjs openPaper's `kept`) */
export const UNIT_FLAG_BITS = Object.freeze({ TITLE: 1, FRONT: 2, BRACKETED: 4, KEPT: 8 })
const FLAG_BITS = 15
/** a piece's tag: a text, a placeholder, a group's open and close, a nested unit */
const TEXT = 0, PH = 1, OPEN = 2, CLOSE = 3, NESTED = 4
/** a string as the engine's text holds it: its UTF-8 bytes read latin1 (mt.mjs plainSource decodes it), as a source unit's
 *  text piece is */
const engineText = s => (/^[\t\n\r -~]*$/.test(s) ? s : String.fromCharCode(...new TextEncoder().encode(s)))
/** the display edges a unit may have (mt.mjs displayEdges), in their order */
export const EDGES = Object.freeze(['lead', 'trail', 'inner'])
/** a unit's table cell's keys, in their order */
export const CELL = Object.freeze(['table', 'row', 'col', 'span', 'head'])
/** a structural name's unit (bundleUnitsOf): no page's ink, a word of the target's for the layer */
export const NAME_KIND = 'name'
/**
 * The hover's ids of babel's names (layout/file.mjs `names`: References, Abstract, Contents, …), which are no unit of the bundle's
 * (they are drawn in the target's word, R.labels, never translated): one an occurrence, NAME_ID_FROM + its occurrence, from past
 * every id a bundle holds (format.mjs UNIT_ID_MAX, 3 500 000, a chunk that comes after the head's included: no bundle id reaches
 * one, however the bundle grows) to below 2^31 (the view's token owners are an Int32Array). The layer draws a name's words under
 * it (run.mjs paintNames), the left lights the name's original by its box (view/shapes.mjs createShapes), as a heading
 */
export const NAME_ID_FROM = 2 ** 22
/** the greatest occurrence an id is made for: past it, a name is lit nowhere */
export const NAME_OCCURRENCE_MAX = 2 ** 31 - 1 - NAME_ID_FROM
/** an occurrence's hover id, or null for one that is not an occurrence or is past NAME_OCCURRENCE_MAX */
export const nameOccurrenceId = occurrence => (Number.isInteger(occurrence) && occurrence >= 0 && occurrence <= NAME_OCCURRENCE_MAX ? NAME_ID_FROM + occurrence : null)
/** whether a hover id is a babel name's occurrence's */
export const isNameOccurrence = id => Number.isInteger(id) && id >= NAME_ID_FROM
/** a unit's kind, a lower-case word */
const KIND = /^[a-z]{1,32}$/
/** an ink unit's kind (layout/ink-units.mjs INK_KIND's): `ink` and its class */
const INK_KIND = /^ink[a-z]{1,29}$/
/** a heading's depth (latex-front.mjs DEPTH: -1 a \part, 0 a \chapter …), with the readers' margin */
const DEPTH_MIN = -1, DEPTH_MAX = 9

const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v)

// ---------------------------------------------------------------- base64, the tail's
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const SEXTET = new Int8Array(128).fill(-1)
for (let i = 0; i < 64; i++) SEXTET[B64.charCodeAt(i)] = i

/** bytes as base64, padded */
export function toBase64(b) {
  let s = ''
  const whole = b.length - (b.length % 3)
  for (let i = 0; i < whole; i += 3) {
    const v = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2]
    s += B64[v >> 18] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + B64[v & 63]
  }
  if (b.length - whole === 1) s += `${B64[b[whole] >> 2]}${B64[(b[whole] & 3) << 4]}==`
  else if (b.length - whole === 2) { const v = (b[whole] << 8) | b[whole + 1]; s += `${B64[v >> 10]}${B64[(v >> 4) & 63]}${B64[(v & 15) << 2]}=` }
  return s
}
/** base64 as bytes: its length a multiple of 4, a byte at least and at most `cap` (refused before decoding), its
 *  characters of the alphabet, `=` padding the last quantum alone and the bits it pads 0, so that one spelling is read.
 *  Throws a LayoutRefusal at `path` */
export function fromBase64(s, cap, path) {
  const fail = why => new LayoutRefusal(path, why)
  if (typeof s !== 'string') throw fail(`not a string (${kindOf(s)})`)
  if (s.length === 0 || s.length % 4 !== 0) throw fail('not base64: none, or not a multiple of 4 characters')
  const pad = s.charCodeAt(s.length - 1) !== 61 ? 0 : s.charCodeAt(s.length - 2) === 61 ? 2 : 1
  const n = (s.length / 4) * 3 - pad
  if (n > cap) throw fail(`more than ${cap} bytes`)
  const out = new Uint8Array(n)
  const at = i => { const c = s.charCodeAt(i); return c < 128 ? SEXTET[c] : -1 }
  let o = 0
  for (let i = 0; i < s.length; i += 4) {
    const last = i + 4 === s.length
    const a = at(i), b = at(i + 1), c = last && pad === 2 ? 0 : at(i + 2), d = last && pad > 0 ? 0 : at(i + 3)
    if (a < 0 || b < 0 || c < 0 || d < 0) throw fail(`not base64 at character ${i}`)
    if (last && ((pad === 2 && (b & 15) !== 0) || (pad === 1 && (c & 3) !== 0))) throw fail('not base64: padded bits not 0')
    const v = (a << 18) | (b << 12) | (c << 6) | d
    out[o++] = v >> 16
    if (o < n) out[o++] = (v >> 8) & 255
    if (o < n) out[o++] = v & 255
  }
  return out
}

// ---------------------------------------------------------------- the writer's
/** a piece as openPaper reads it, its positions dropped: a nested piece names its inner unit by id */
function pieceOf(p, idOf) {
  switch (p.t) {
    case 'text': return p.src === undefined ? [TEXT, p.s] : [TEXT, p.s, p.src]
    case 'ph': return [PH, p.src]
    case 'open': return [OPEN, p.id, p.src]
    case 'close': return [CLOSE, p.id, p.src]
    case 'nested': {
      const id = idOf.get(p.unit)
      if (id === undefined) throw new Error('a nested piece whose unit is not one of the paper\'s')
      return [NESTED, p.pre, id, p.post]
    }
    default: throw new Error(`a piece the front end does not make (${String(p.t).slice(0, 20)})`)
  }
}

/**
 * The bundle's units from openPaper's paper: each unit [kind, flags, depth or null, its table cell or null, its display
 * edges or null, its pieces], by its index. Its flags TITLE, FRONT and BRACKETED as the front end set them, KEPT where
 * the paper keeps it (`kept`, nameCells); its edges displayEdges' (mt.mjs), restated here so that the reader's parse
 * loads no front end (a test holds the two equal). Language-independent and deterministic: every object written in one
 * order. Throws on a piece the front end does not make.
 * After the source's units, the paper's structural names (openPaper's `names`: source/paper-names.mjs), each a unit of kind
 * `name` of one text piece, its name: translated with the paper's units and cached by its text as any unit, never laid (it is
 * no page's ink), read by the layer as the target's word for that name (PDF-READER §19.14). The source's units keep their ids
 */
export function bundleUnitsOf(paper) {
  const idOf = new Map()
  paper.units.forEach((u, i) => idOf.set(u, i))
  // (each name as the engine's text, as a source unit's text piece holds it: a UTF-8 file's accented name as its bytes)
  const names = (paper.names ?? []).map(s => [NAME_KIND, 0, null, null, null, [[TEXT, engineText(s)]]])
  return [...paper.units.map(u => {
    const flags = (u.title ? UNIT_FLAG_BITS.TITLE : 0) | (u.front ? UNIT_FLAG_BITS.FRONT : 0) | (u.bracketed ? UNIT_FLAG_BITS.BRACKETED : 0) | (paper.kept.has(u) ? UNIT_FLAG_BITS.KEPT : 0)
    const c = u.cell
    const edges = {}
    for (const k of EDGES) if (typeof u[k] === 'string') edges[k] = u[k]
    return [
      u.kind, flags, u.depth ?? null,
      c ? { table: c.table, row: c.row, col: c.col, span: c.span, head: c.head } : null,
      Object.keys(edges).length ? edges : null,
      u.pieces.map(p => pieceOf(p, idOf)),
    ]
  }), ...names]
}

/**
 * The ink units as the bundle holds them (docs/route/orphan-text.md §8): each [kind, flags, depth, cell, edges, pieces, echo], its
 * kind INK_KIND's, its echo the source unit whose row it is drawn with (null: a translation of its own); written in a chunk of
 * INK_UNITS_FORMAT after the source units' (format.mjs writeUnitChunks `start`). `ink` the wrap's (layout/wrap.mjs wrapFinal
 * `ink.units`): no nested piece
 */
export function inkBundleUnitsOf(ink) {
  return ink.map(u => [u.kind, 0, null, null, null, u.pieces.map(p => pieceOf(p, new Map())), u.echo ?? null])
}

/** a bitmap figure's label as the bundle holds it (PDF-READER §19.15): [inkocr, flags, null, null, null, [its text], null, place],
 *  its text the engine's (its UTF-8 bytes read latin1), `flags` KEPT where it is only names */
export const ocrBundleUnit = (text, flags, place) => [OCR_KIND, flags, null, null, null, [[TEXT, engineText(text)]], null, place]

// ---------------------------------------------------------------- the reader's
const isText = s => typeof s === 'string' && s.length <= STRING_MAX

/**
 * Whether unit `u` (the file's `units[i]`) stands: its shape [kind, flags, depth, cell, edges, pieces] (and, with `ink`, an ink
 * unit's [..., echo]: its kind an ink kind, its echo null or an earlier unit that stands; a bitmap figure's label's [..., null,
 * place], ocr-rows.mjs, of kind `inkocr` alone), its kind a
 * lower-case word, every string within STRING_MAX, each piece one of the six of its tag's shape; a nested piece's unit
 * one before it that stands (`stands`), so that no unit nests itself. A group's open and close are not paired: the front
 * end makes an open with no close (`\multirow{`, whose close the next cell holds) and a close with no open before it (a
 * part with no text dropped with its open: the corpus's 2212.06817, 2608.03063, 2608.15761), and every reader of a unit
 * takes either alone (mt.mjs serialize)
 */
export function unitStands(u, i, stands, { ink = false } = {}) {
  if (!Array.isArray(u) || !(u.length === 6 || (ink && (u.length === 7 || u.length === 8)))) return false
  const kind = u[0], flags = u[1], depth = u[2], cell = u[3], edges = u[4], pieces = u[5]
  if (typeof kind !== 'string' || kind.length > 32 || !KIND.test(kind)) return false
  // (an ink unit, of a chunk of INK_UNITS_FORMAT alone: its kind an ink kind, its echo null or a unit before it that stands)
  if (u.length >= 7 && !(INK_KIND.test(kind) && (u[6] === null || (isInteger(u[6], 0, i - 1) && stands[u[6]] === 1)))) return false
  // (a bitmap figure's label, and it alone, carries its place after its echo, none: ocr-rows.mjs)
  if ((u.length === 8) !== (kind === OCR_KIND)) return false
  if (u.length === 8 && (u[6] !== null || !placeStands(u[7]))) return false
  if (!isInteger(flags, 0, FLAG_BITS)) return false
  if (depth !== null && !isInteger(depth, DEPTH_MIN, DEPTH_MAX)) return false
  if (cell !== null) {
    if (!isObject(cell)) return false
    const own = Object.keys(cell)
    if (own.length !== CELL.length) return false
    for (let k = 0; k < own.length; k++) if (!CELL.includes(own[k])) return false
    if (!isInteger(cell.table, 0, Number.MAX_SAFE_INTEGER) || !isInteger(cell.row, 0, Number.MAX_SAFE_INTEGER) || !isInteger(cell.col, 0, Number.MAX_SAFE_INTEGER)) return false
    if (!isInteger(cell.span, 1, Number.MAX_SAFE_INTEGER) || typeof cell.head !== 'boolean') return false
  }
  if (edges !== null) {
    if (!isObject(edges)) return false
    const own = Object.keys(edges)
    if (own.length === 0) return false
    for (let k = 0; k < own.length; k++) if (!EDGES.includes(own[k]) || !isText(edges[own[k]])) return false
  }
  if (!Array.isArray(pieces)) return false
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k]
    if (!Array.isArray(p)) return false
    switch (p[0]) {
      case TEXT:
        if (!((p.length === 2 || p.length === 3) && isText(p[1]) && (p.length === 2 || isText(p[2])))) return false
        break
      case PH:
        if (!(p.length === 2 && isText(p[1]))) return false
        break
      case OPEN:
      case CLOSE:
        if (!(p.length === 3 && isInteger(p[1], 0, Number.MAX_SAFE_INTEGER) && isText(p[2]))) return false
        break
      case NESTED:
        if (!(p.length === 4 && isText(p[1]) && isInteger(p[2], 0, i - 1) && stands[p[2]] && isText(p[3]))) return false
        break
      default:
        return false
    }
  }
  return true
}
