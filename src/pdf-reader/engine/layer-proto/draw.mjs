// A page's draw geometry (the E-C design note, ec-geometry-format.md): what the layer's drawing of a page reads of arXiv's PDF
// besides its operator list, shipped as data in the page's left part (`draw`) so that the browser reads and draws only the pages whose
// ink it needs: the text items (string, transform, width, height, font), the page's font table and the Link annotations. The shape
// is checked by the reader of a left part (checkDraw: bounds and types, plain loops, nothing evaluated) and built from PDF.js's own
// shapes by the writer (wireOf), which SHEDS (null: the browser reads that page itself) for every reason the reader would refuse.
// `drawInputsOf` gives the rows back in the layer's own input shapes. Imports the layout's number checks alone.
import { isInteger, isNumber, isObject } from '../layout/json.mjs'

/** items at most a page, a string's code units and all strings' together */
export const DRAW_ITEMS = 6_000, DRAW_STRING = 4_096, DRAW_STRINGS = 262_144
/** fonts a page, a font's name, fallback, and `mapped` (elements, each of at most DRAW_MAPPED_CHAR code units) */
export const DRAW_FONTS = 256, DRAW_NAME = 128, DRAW_FALLBACK = 64, DRAW_MAPPED = 8_192, DRAW_MAPPED_CHAR = 16
/** links a page, quads of a link (4 points each of 8 numbers: k), a url, a named dest, a zoom name, a dest's arguments, an overlaid text */
export const DRAW_LINKS = 4_000, DRAW_QUADS = 64, DRAW_URL = 4_096, DRAW_DEST = 512, DRAW_ZOOM = 16, DRAW_ARGS = 6, DRAW_OVERLAID = 1_024
/** the values a page's draw holds at most, and (the writer's alone: the reader cannot check it without writing it again) its bytes */
export const DRAW_VALUES = 80_000, DRAW_BYTES = 768 * 1024
/** the encoded draws the server holds at once (the pages read and not yet told to a part); a page past it ships no draw */
export const DRAW_HELD_MAX = 64 * 1024 * 1024
/** a number of the data is finite and within this either way */
export const DRAW_COORD = 1e7

/** a refusal of a draw at `path` of it (format.mjs makes a BundleRefusal of it) */
export class DrawRefusal extends Error {
  constructor(path, why) { super(path ? `${path}: ${why}` : why); this.name = 'DrawRefusal'; this.path = path; this.why = why }
}
const refuse = (path, why) => new DrawRefusal(path, why)
const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v)
const KEYS = ['fonts', 'items', 'links']

/** a number of the data: finite, within DRAW_COORD */
const num = (v, path) => { if (!isNumber(v) || Math.abs(v) > DRAW_COORD) throw refuse(path, `not a number within ±${DRAW_COORD} (${kindOf(v)})`); return v }
const str = (v, path, max) => { if (typeof v !== 'string' || v.length > max) throw refuse(path, `not a string of at most ${max} code units (${kindOf(v)})`); return v }
const strOrNull = (v, path, max) => (v === null ? null : str(v, path, max))
const arr = (v, path, max, exact = -1) => {
  if (!Array.isArray(v) || (exact >= 0 && v.length !== exact) || v.length > max) throw refuse(path, `not an array${exact >= 0 ? ` of ${exact}` : ` of at most ${max}`} (${kindOf(v)}${Array.isArray(v) ? ` of ${v.length}` : ''})`)
  return v
}

/**
 * A draw as received, checked: `{ fonts, items, links }` exactly; every row of its arity, every number finite within DRAW_COORD, every
 * index in range, every string within its cap, a dest in one of its three forms, the values (as JSON counts them) within DRAW_VALUES.
 * Returns the value itself. Throws DrawRefusal
 */
export function checkDraw(v, path = 'draw') {
  if (!isObject(v)) throw refuse(path, `not an object (${kindOf(v)})`)
  const own = Object.keys(v)
  for (const k of KEYS) if (!Object.hasOwn(v, k)) throw refuse(`${path}.${k}`, 'missing')
  if (own.length !== KEYS.length) for (const k of own) if (!KEYS.includes(k)) throw refuse(`${path}.${k.slice(0, 20)}`, 'not a key of the schema')
  let values = 4
  const fonts = arr(v.fonts, `${path}.fonts`, DRAW_FONTS)
  for (let i = 0; i < fonts.length; i++) {
    const f = arr(fonts[i], `${path}.fonts[${i}]`, 4, 4), at = `${path}.fonts[${i}]`
    strOrNull(f[0], `${at}[0]`, DRAW_NAME); strOrNull(f[1], `${at}[1]`, DRAW_FALLBACK)
    if (f[2] !== 0 && f[2] !== 1 && f[2] !== 2) throw refuse(`${at}[2]`, 'not 0, 1 or 2')
    if (f[3] !== null) {
      const m = arr(f[3], `${at}[3]`, DRAW_MAPPED)
      for (let j = 0; j < m.length; j++) str(m[j], `${at}[3][${j}]`, DRAW_MAPPED_CHAR)
      values += m.length + 1
    } else values++
    values += 5
  }
  const items = arr(v.items, `${path}.items`, DRAW_ITEMS)
  let chars = 0
  for (let i = 0; i < items.length; i++) {
    const it = arr(items[i], `${path}.items[${i}]`, 9, 9), at = `${path}.items[${i}]`
    chars += str(it[0], `${at}[0]`, DRAW_STRING).length
    if (chars > DRAW_STRINGS) throw refuse(`${path}.items`, `more than ${DRAW_STRINGS} code units of text`)
    for (let j = 1; j <= 7; j++) num(it[j], `${at}[${j}]`)
    if (!isInteger(it[8], -1, fonts.length - 1)) throw refuse(`${at}[8]`, `not a font of the table (-1 to ${fonts.length - 1})`)
    values += 10
  }
  const links = arr(v.links, `${path}.links`, DRAW_LINKS)
  for (let i = 0; i < links.length; i++) {
    const l = arr(links[i], `${path}.links[${i}]`, 8, 8), at = `${path}.links[${i}]`
    const rect = arr(l[0], `${at}[0]`, 4, 4)
    for (let j = 0; j < 4; j++) num(rect[j], `${at}[0][${j}]`)
    if (l[1] !== null) {
      const q = arr(l[1], `${at}[1]`, 8 * DRAW_QUADS)
      if (q.length === 0 || q.length % 8 !== 0) throw refuse(`${at}[1]`, 'not 8 numbers a quad, one at least')
      for (let j = 0; j < q.length; j++) num(q[j], `${at}[1][${j}]`)
      values += q.length
    }
    strOrNull(l[2], `${at}[2]`, DRAW_URL)
    values += destCheck(l[3], `${at}[3]`)
    strOrNull(l[4], `${at}[4]`, DRAW_OVERLAID)
    if (l[5] !== null) num(l[5], `${at}[5]`)
    if (l[6] !== null && !isInteger(l[6], 0, 255)) throw refuse(`${at}[6]`, 'not null or an integer 0 to 255')
    if (l[7] !== null) {
      const c = arr(l[7], `${at}[7]`, 3, 3)
      for (let j = 0; j < 3; j++) if (!isInteger(c[j], 0, 255)) throw refuse(`${at}[7][${j}]`, 'not an integer 0 to 255')
      values += 3
    }
    values += 12
  }
  if (values > DRAW_VALUES) throw refuse(path, `more than ${DRAW_VALUES} values`)
  return v
}

/** a dest: null, a name, or the flat explicit form [0, num, gen, zoom, ...args] (page by reference) / [1, index, 0, zoom, ...args]
 *  (page by index); returns the values it holds */
function destCheck(d, path) {
  if (d === null) return 0
  if (typeof d === 'string') { if (d.length > DRAW_DEST) throw refuse(path, `a name of more than ${DRAW_DEST} code units`); return 1 }
  if (!Array.isArray(d) || d.length < 4 || d.length > 4 + DRAW_ARGS) throw refuse(path, `not null, a name or an explicit dest of 4 to ${4 + DRAW_ARGS} (${kindOf(d)})`)
  if (d[0] !== 0 && d[0] !== 1) throw refuse(`${path}[0]`, 'not 0 (a reference) or 1 (a page index)')
  if (!isInteger(d[1], 0, 2 ** 31 - 1)) throw refuse(`${path}[1]`, 'not a number or an index 0 to 2^31 − 1')
  if (d[0] === 0 ? !isInteger(d[2], 0, 65535) : d[2] !== 0) throw refuse(`${path}[2]`, d[0] === 0 ? 'not a generation 0 to 65535' : 'not 0')
  str(d[3], `${path}[3]`, DRAW_ZOOM)
  if (d[3].length < 1) throw refuse(`${path}[3]`, 'an empty zoom name')
  for (let j = 4; j < d.length; j++) if (d[j] !== null) num(d[j], `${path}[${j}]`)
  return d.length
}

/** a number as the data keeps it: -0 written 0 */
const clean = v => (v === 0 ? 0 : v)
const list = v => (v == null ? null : Array.from(v))

/**
 * A draw built from PDF.js's own shapes (the caller's `draw`: `{ fonts: [[name, fallback, type3, mapped]], items: [[str, a, b, d,
 * e, f, width, height, font]], links: [[rect, quads, url, dest, overlaid, bw, bs, color]] }`, rects, quads and colours possibly typed
 * arrays, `mapped` an iterable of strings or null), copied to plain values, -0 made 0, a quads list of a length that is not a
 * multiple of 8 made null (the layer falls back to the rect); then checked. Returns the draw, or null for ANY reason the reader would
 * refuse it, and for text past DRAW_BYTES: the writer sheds, never throws
 */
export function wireOf(draw) {
  return wireText(draw)?.draw ?? null
}

const encoder = new TextEncoder()
/** wireOf's draw and its JSON (`text`, what a left part holds of it: format.mjs writeLeftPart `drawText`), or null. `plainItems`:
 *  the items are rows as the data holds them already (plain arrays, -0 written 0: pipeline/draw-data.mjs drawTextOf's), checked
 *  but not copied */
export function wireText(draw, { plainItems = false } = {}) {
  try {
    if (draw === null || draw === undefined) return null
    const out = {
      fonts: draw.fonts.map(f => [f[0] ?? null, f[1] ?? null, f[2], f[3] == null ? null : Array.from(f[3])]),
      items: plainItems ? draw.items : draw.items.map(it => [it[0], clean(it[1]), clean(it[2]), clean(it[3]), clean(it[4]), clean(it[5]), clean(it[6]), clean(it[7]), it[8]]),
      links: draw.links.map(l => {
        const quads = list(l[1])
        return [list(l[0]).map(clean), quads && quads.length > 0 && quads.length % 8 === 0 ? quads.map(clean) : null, l[2] ?? null, destOf(l[3]), l[4] ?? null, l[5] == null ? null : clean(l[5]), l[6] ?? null, list(l[7])]
      }),
    }
    checkDraw(out)
    const text = JSON.stringify(out)
    if (encoder.encode(text).length > DRAW_BYTES) return null
    return { draw: out, text }
  } catch (e) {
    if (e instanceof DrawRefusal || e instanceof TypeError || e instanceof RangeError) return null
    throw e
  }
}

/** an annotation's dest in the flat form: a name as is; PDF.js's explicit [ref|index, {name}, ...args] flattened, exact (never resolved) */
function destOf(d) {
  if (d == null) return null
  if (typeof d === 'string') return d
  if (Array.isArray(d) && d[1] && typeof d[1].name === 'string') {
    const page = d[0], zoom = d[1].name, args = d.slice(2).map(a => (a === undefined ? null : a))
    if (page && typeof page === 'object' && Number.isInteger(page.num) && Number.isInteger(page.gen)) return [0, page.num, page.gen, zoom, ...args]
    if (Number.isInteger(page)) return [1, page, 0, zoom, ...args]
  }
  return d
}

/** a font row's key by its content (a namespace of its own: never a page's index nor PDF.js's loaded name), 64 bits of FNV-1a over its JSON in two halves */
export function drawFontKey(row) {
  const s = JSON.stringify(row)
  let h1 = 0x811c9dc5, h2 = 0x9747b28c
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193); h2 = Math.imul(h2 ^ c, 0x85ebca6b) ^ (h2 >>> 13)
  }
  return `axt-draw-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}-${s.length}`
}

/**
 * The inputs the layer reads, back from a checked draw: `items` (str, transform [a, b, 0, d, e, f] — c is never read —, width, height,
 * fontName the font's content key or null), `styles` by that key (fontFamily the fallback), `fonts` a Map from the key to { name,
 * fallback, type3 (0, 1, 2), mapped: a Set of strings, or null for none (an empty Set is every char unmapped) }, and `annots`: the
 * Link annotations as getAnnotations gives them (dest as [{num,gen}|index, {name}, ...args] or a name)
 */
export function drawInputsOf(draw) {
  const keys = draw.fonts.map(drawFontKey)
  const fonts = new Map(draw.fonts.map((f, i) => [keys[i], { name: f[0], fallback: f[1], type3: f[2], mapped: f[3] === null ? null : new Set(f[3]) }]))
  const styles = Object.fromEntries(draw.fonts.map((f, i) => [keys[i], { fontFamily: f[1] }]))
  const items = draw.items.map(it => ({ str: it[0], transform: [it[1], it[2], 0, it[3], it[4], it[5]], width: it[6], height: it[7], fontName: it[8] < 0 ? null : keys[it[8]] }))
  const annots = draw.links.map(l => ({
    subtype: 'Link', rect: l[0], quadPoints: l[1], url: l[2], dest: destBack(l[3]), overlaidText: l[4],
    ...(l[5] === null && l[6] === null ? {} : { borderStyle: { width: l[5], style: l[6] } }), color: l[7],
  }))
  return { items, styles, fonts, annots }
}
function destBack(d) {
  if (!Array.isArray(d)) return d
  return [d[0] === 0 ? { num: d[1], gen: d[2] } : d[1], { name: d[3] }, ...d.slice(4)]
}
