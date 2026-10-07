// The add-on's manifest (layout/remove.mjs makeAddon's, with the kept ink under the units' rectangles, `dirty`, and the
// rules near the table cells' lines, `rules`, that the paper's add-on adds to it): what a reader knows of the
// text-removed pages that follow arXiv's own in the add-on's document. It is made from a paper, so it is untrusted and
// refused within bounds before it is used: bytes, UTF-8, values and nesting counted before JSON.parse (json.mjs), then
// its shape and every number with plain loops. A refusal is of the whole manifest, names its path and describes a value
// by its type; the reader then draws every unit the old way, as with no add-on. Two forms are read: the shipped one
// (compact: only the pages it removes, each named by its entry's `at`) and the check's (every set's page p at its fixed
// place, with the gate's outline table and the crops' colours); the layer bundle's reader (layer-proto/bundle.mjs) reads
// the manifest a bundle holds in the shipped form alone. No key of an object read names a prototype. Imports json.mjs
// alone, and no PDF object layer: the reader's door loads it.
import { boundedJson, COORD_MAX, isInteger, isNumber, isObject, LayoutRefusal, told } from './json.mjs'

/** the remover's version: raised with any change to what it writes; it enters the add-on's key (2: compact sets; 3: a
 *  Type 3 glyph's removed advance with its font matrix's translation, an unusable matrix refused; 4: a hex string read as
 *  PDF.js reads it, and a page refused past its budgets: what it holds by kind, what it decodes). Defined here, beside
 *  the manifest that names it, so that a reader checks a manifest without loading the remover (which re-exports it) */
export const REMOVAL = '4'
/** the add-on's bytes at most (the bytes after arXiv's: 32 KB for the 147-page thesis), its manifest's bytes and
 *  values */
export const ADDON_CAP = 4 * 2 ** 20
export const ADDON_MANIFEST_CAP = 256 * 1024
export const ADDON_MANIFEST_VALUES = 100_000
/** the deepest the manifest nests: its object, `page`, a page's entry, its `units`, a unit's boxes */
const DEPTH = 5
/** a refused page's reason at most, in code units (the maker cuts its own to it) */
const REFUSED_MAX = 200
/** the page sets an add-on may hold after arXiv's own pages, in their order (remove.mjs SETS and CHECK_SETS), and those
 *  the shipped add-on holds (SETS) */
const SET_NAMES = ['R', 'P', 'F', 'C'], SHIPPED_SETS = ['R']
const TOP = ['schema', 'removal', 'pages', 'sets', 'page', 'appended', 'stats'], TOP_CHECK = ['colours', 'outlines']
const ENTRY = ['refused', 'units', 'at', 'dirty', 'rules']
/** a PDF's bytes at most (a manifest's `appended`), and a count's (its stats) */
const BYTES_MAX = 2 ** 31
const STATS_MAX = 32, STAT_NAME = /^[a-z]{1,32}$/
/** the names an object's own key may not take, so that no copy of what is read is given another prototype */
const NOT_NAMES = ['__proto__', 'constructor', 'prototype']
/** a page as a key of `page` (read as a number once it is one), a unit's id as a key of a page's `units`, a crop's
 *  colour by page and crop, a font of the outline table */
const PAGE_KEY = /^[1-9]\d{0,4}$/, UNIT_KEY = /^(?:0|[1-9]\d{0,8})$/, COLOUR_KEY = /^([1-9]\d{0,4})\.(?:0|[1-9]\d{0,5})$/
const FONT_MAX = 128, CHAR_MAX = 256, OUTLINE_MAX = 2 ** 31
/** a box lies within its page's view by this, PDF units (the layout file's slack) */
const SLACK = 1

const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v)
const refuse = (path, why) => new LayoutRefusal(path, why)
const join = (path, k) => (path ? `${path}.${k}` : k)

/** an object whose keys are `required` and any of `optional`; a key of its own named by its first 20 code units */
function keysOf(v, required, optional, path) {
  if (!isObject(v)) throw refuse(path, `not an object (${kindOf(v)})`)
  for (let i = 0; i < required.length; i++) if (!Object.hasOwn(v, required[i])) throw refuse(join(path, required[i]), 'missing')
  const own = Object.keys(v)
  for (let i = 0; i < own.length; i++) if (!required.includes(own[i]) && !optional.includes(own[i])) throw refuse(join(path, told(own[i])), 'not a key of the schema')
  return v
}

/**
 * Boxes x0, y0, x1, y1 (stride 4) on page `page`: finite numbers, each box not empty (x0 < x1, y0 < y1), within the
 * page's view by SLACK where `views` is given (4 × pages numbers, the layout file's form), else within ±COORD_MAX.
 * Refused at the number that breaks it
 */
function boxes(v, page, views, path) {
  if (!Array.isArray(v) || v.length % 4 !== 0) throw refuse(path, `not boxes of 4 numbers (${kindOf(v)})`)
  const o = 4 * (page - 1)
  const xlo = views ? views[o] - SLACK : -COORD_MAX, ylo = views ? views[o + 1] - SLACK : -COORD_MAX
  const xhi = views ? views[o + 2] + SLACK : COORD_MAX, yhi = views ? views[o + 3] + SLACK : COORD_MAX
  for (let i = 0; i < v.length; i++) {
    const x = v[i], horizontal = i % 2 === 0
    if (!isNumber(x) || x < (horizontal ? xlo : ylo) || x > (horizontal ? xhi : yhi)) throw refuse(`${path}[${i}]`, `not a number within its page's view (${kindOf(x)})`)
    if (i % 4 >= 2 && x <= v[i - 2]) throw refuse(`${path}[${i}]`, 'an empty box')
  }
  return v
}

/**
 * A manifest already parsed (the layer bundle holds one): every bound parseAddonManifest checks past JSON.parse,
 * `pages` the paper's; `shipped`, the shipped add-on's alone (no check's set, outline table nor colours: a bundle's).
 * Its schema and remover; `sets`, none (compact) or each in SET_NAMES' order at (i + 1) × pages; an entry for exactly
 * each page 1 to `pages`: `ok`, a refused page's reason (1 to REFUSED_MAX code units) and nothing removed on it, a
 * removed page's `units` (boxes by unit id) and `at` (its pages in the add-on's document by set, each past arXiv's own,
 * within the document's pages — arXiv's, each set's, and one for each `at` — and each named once), and either's `dirty`
 * and `rules` (boxes); `appended` and `stats`, counts; the check's crops' `colours` (rgb by page and crop) and outline
 * table (a font's characters and their boxes in thousandths of an em, stride 5). Returns the manifest as it is; throws
 * LayoutRefusal
 */
export function checkAddonManifest(m, { pages, views = null, shipped = false }) {
  const setNames = shipped ? SHIPPED_SETS : SET_NAMES
  keysOf(m, TOP, shipped ? [] : TOP_CHECK, '')
  if (m.schema !== 1) throw refuse('schema', 'not 1')
  if (m.removal !== REMOVAL) throw refuse('removal', `not '${REMOVAL}'`)
  if (m.pages !== pages) throw refuse('pages', `not the paper's ${pages}`)

  const sets = keysOf(m.sets, [], setNames, 'sets'), names = Object.keys(sets)
  for (let i = 0; i < names.length; i++) {
    // (the remover writes them in SET_NAMES' order, each a block of `pages` after the one before)
    if (names[i] !== SET_NAMES[i] || sets[names[i]] !== (i + 1) * pages) throw refuse(`sets.${names[i]}`, `not ${SET_NAMES[i]} at ${(i + 1) * pages}`)
  }

  const page = m.page
  if (!isObject(page)) throw refuse('page', `not an object (${kindOf(page)})`)
  const keys = Object.keys(page)
  if (keys.length !== pages) {
    for (let i = 0; i < keys.length; i++) if (!PAGE_KEY.test(keys[i]) || Number(keys[i]) > pages) throw refuse(`page.${told(keys[i])}`, `not a page 1 to ${pages}`)
    throw refuse('page', `not an entry for each of ${pages} pages`)
  }
  // each `at`, checked against the document's pages once every entry is read
  const ats = [], atPaths = []
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i], path = `page.${told(k)}`
    if (!PAGE_KEY.test(k) || Number(k) > pages) throw refuse(path, `not a page 1 to ${pages}`)
    const p = Number(k)
    const e = keysOf(page[k], ['ok'], ENTRY, path)
    if (typeof e.ok !== 'boolean') throw refuse(`${path}.ok`, `not a boolean (${kindOf(e.ok)})`)
    if (e.ok) {
      if (Object.hasOwn(e, 'refused')) throw refuse(`${path}.refused`, 'on a removed page')
    } else {
      if (typeof e.refused !== 'string' || e.refused.length < 1 || e.refused.length > REFUSED_MAX) throw refuse(`${path}.refused`, `not 1 to ${REFUSED_MAX} code units (${kindOf(e.refused)})`)
      for (const x of ['units', 'at', 'dirty']) if (Object.hasOwn(e, x)) throw refuse(`${path}.${x}`, 'on a refused page')
    }
    if (Object.hasOwn(e, 'units')) {
      const units = e.units
      if (!isObject(units)) throw refuse(`${path}.units`, `not an object (${kindOf(units)})`)
      for (const id of Object.keys(units)) {
        if (!UNIT_KEY.test(id)) throw refuse(`${path}.units.${told(id)}`, 'not a unit\'s id')
        boxes(units[id], p, views, `${path}.units.${id}`)
      }
    }
    if (Object.hasOwn(e, 'at')) {
      const at = keysOf(e.at, [], setNames, `${path}.at`)
      for (const s of Object.keys(at)) { ats.push(at[s]); atPaths.push(`${path}.at.${s}`) }
    }
    if (Object.hasOwn(e, 'dirty')) boxes(e.dirty, p, views, `${path}.dirty`)
    if (Object.hasOwn(e, 'rules')) boxes(e.rules, p, views, `${path}.rules`)
  }
  // the add-on's document: arXiv's pages, each set's block of them, and the pages named by `at`
  const total = pages * (1 + names.length) + ats.length, seen = new Set()
  for (let i = 0; i < ats.length; i++) {
    if (!isInteger(ats[i], pages + 1, total)) throw refuse(atPaths[i], `not a page of the add-on's ${pages + 1} to ${total}`)
    if (seen.has(ats[i])) throw refuse(atPaths[i], 'a page named twice')
    seen.add(ats[i])
  }

  if (!isInteger(m.appended, 0, BYTES_MAX)) throw refuse('appended', `not a count of bytes 0 to ${BYTES_MAX}`)
  const stats = m.stats
  if (!isObject(stats)) throw refuse('stats', `not an object (${kindOf(stats)})`)
  const counted = Object.keys(stats)
  if (counted.length > STATS_MAX) throw refuse('stats', `more than ${STATS_MAX} counts`)
  for (const k of counted) {
    if (!STAT_NAME.test(k) || NOT_NAMES.includes(k)) throw refuse(`stats.${told(k)}`, 'not a count\'s name')
    if (!isInteger(stats[k], 0, Number.MAX_SAFE_INTEGER)) throw refuse(`stats.${k}`, 'not a count')
  }

  if (Object.hasOwn(m, 'colours')) {
    const colours = m.colours
    if (!isObject(colours)) throw refuse('colours', `not an object (${kindOf(colours)})`)
    for (const k of Object.keys(colours)) {
      const c = colours[k], at = COLOUR_KEY.exec(k)
      if (!at || Number(at[1]) > pages) throw refuse(`colours.${told(k)}`, `not a page 1 to ${pages} and a crop`)
      if (!Array.isArray(c) || c.length !== 3 || !isInteger(c[0], 0, 255) || !isInteger(c[1], 0, 255) || !isInteger(c[2], 0, 255)) throw refuse(`colours.${k}`, `not [r, g, b] 0 to 255 (${kindOf(c)})`)
    }
  }
  if (Object.hasOwn(m, 'outlines')) {
    const outlines = m.outlines
    if (!isObject(outlines)) throw refuse('outlines', `not an object (${kindOf(outlines)})`)
    for (const font of Object.keys(outlines)) {
      const row = outlines[font], path = `outlines.${told(font)}`
      if (font.length < 1 || font.length > FONT_MAX || NOT_NAMES.includes(font)) throw refuse(path, `not a font's name of 1 to ${FONT_MAX} code units`)
      if (!Array.isArray(row) || row.length % 5 !== 0) throw refuse(path, `not characters of a key and 4 numbers (${kindOf(row)})`)
      for (let j = 0; j < row.length; j += 5) {
        if (typeof row[j] !== 'string' || row[j].length < 1 || row[j].length > CHAR_MAX) throw refuse(`${path}[${j}]`, `not a character's key of 1 to ${CHAR_MAX} code units (${kindOf(row[j])})`)
        for (let q = 1; q <= 4; q++) if (!isInteger(row[j + q], -OUTLINE_MAX, OUTLINE_MAX)) throw refuse(`${path}[${j + q}]`, 'not an integer in thousandths of an em')
      }
    }
  }
  return m
}

/** bytes, then UTF-8, then values and nesting counted, then JSON.parse, then every bound (checkAddonManifest's), `pages`
 *  the paper's and, where given, `views` each page's view (a box then within it); throws LayoutRefusal */
export function parseAddonManifest(bytes, o) {
  if (!(bytes instanceof Uint8Array)) throw refuse('', `not bytes (${kindOf(bytes)})`)
  return checkAddonManifest(boundedJson(bytes, { cap: ADDON_MANIFEST_CAP, values: ADDON_MANIFEST_VALUES, depth: DEPTH }), o)
}
