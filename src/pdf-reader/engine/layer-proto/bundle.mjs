// The layer bundle (the layer-only plan of 2026-10-08, §3; A2's E7): one JSON file a paper version, whatever the
// target, that both readers read with this one parser. It holds the paper's units (openPaper's, language-independent,
// their ids their indices), the original's side as the anchors locate it (`left`: v0's geometry), the layout file, and
// the add-on that removes the original's text (its manifest, and its bytes after arXiv's as base64), under the engine's
// versions, which its key names too. The engine writes it where a paper is prepared (writeBundle), once.
//
// A reader receives it from the network, so it is untrusted and read within bounds before anything is used: its bytes
// (BUNDLE_CAP), its UTF-8, its values and nesting counted before JSON.parse (BUNDLE_VALUES), then every check of §3.3 by
// plain loops, a value of the wrong type named by its type and never converted. A refusal is of the whole file
// (BundleRefusal: the reader shows the original, with no layer), but for a unit: one whose shape is wrong (a bad piece,
// a nested piece naming no unit before it) is dropped, null at its id, and the rest stand. The layout and the add-on's
// cell rules are checked by their own modules' rules (layout/file.mjs, layout/cell-rules.mjs).
//
// Imports the layout's parsers and the engine's versions alone: never the run (live.mjs), the remover, the layout's
// maker nor the front end, which a reader does not load. bundleUnitsOf, the writer's, reads openPaper's units and
// nothing more.
import { checkBoxes } from '../layout/cell-rules.mjs'
import { checkLayout, encodeLayout, isPaperId, LAYOUT, UNIT_KINDS, VERSION_MAX } from '../layout/file.mjs'
import { COORD_MAX, countValues, isInteger, isNumber, isObject, isVersionToken, LayoutRefusal, PAGES_MAX, STRING_MAX, told, utf8Strict } from '../layout/json.mjs'
import { PDFJS, PIPELINE_VERSION, REMOVAL } from '../pipeline/versions.mjs'
import { bundleUnitsOf, UNIT_FLAG_BITS, unitStands } from './units.mjs'

// (the units and base64 moved to units.mjs, which BUNDLE 4's chunks take too)
export { bundleUnitsOf, UNIT_FLAG_BITS }

/** the bundle's format: raised with any change to what it holds (the left's tokens and spans, with the highlight); 2 the
 *  layout file's schema 2, its babel names (D1a); 3 its schema 3, the paper's \lineskip and \lineskiplimit. The layout
 *  file's schema 4 (PH_FLAG.JOINED and PH_FLAG.OUTSIDE) is NOT a contract of its own: b3 now names two layout schemas and
 *  each reader's parseLayout refuses the other's, so a b3 bundle holding schema 4 is read by this engine's reader only (a
 *  released reader of schema 3 refuses it whole). That holds while no released reader asks b3 of content this engine
 *  makes: the web's pin does not move before BUNDLE 4 (format.mjs) lands, and the pin moves with BUNDLE 4 (M1), which
 *  names the contract anew (the controller's ruling of 2026-10-15) */
export const BUNDLE = '3'
/** a bundle's bytes at most (the 147-page thesis's is 1.18 MiB) and its values (the thesis holds 165,659) */
export const BUNDLE_CAP = 4 * 2 ** 20
export const BUNDLE_VALUES = 1_000_000
/** the deepest the bundle nests: its object, its units, a unit, its pieces, a piece's fields (the left's rectangle, the layout's
 *  rows and the rules' boxes are no deeper) */
const DEPTH = 7
/** a unit's string at most, in code units: layout/json.mjs's, the rows' and the text pieces' too */
export { STRING_MAX }
/** a rectangle of the left lies within its page's view by this, PDF units (the layout file's slack) */
const SLACK = 1
/** a PDF's bytes at most */
const BASE_MAX = 2 ** 31
const SHA256 = /^[0-9a-f]{64}$/
const KEYS = ['schema', 'paper', 'base', 'versions', 'units', 'left', 'layout', 'rules']
const VERSIONS = ['bundle', 'pipeline', 'layout', 'removal', 'pdfjs', 'image']
/** the reader's contract: the bundle's format and the PDF.js it reads the geometry with, what a reader asks by. A
 *  bundle of another is refused */
export const CTAG = `b${BUNDLE}-j${PDFJS}`
/** the content's: the contract, then the pipeline, the layout maker and the remover the server made it with (rules as
 *  data: the reader names its contract, the server the content); a bundle key's last part. A reader reads a bundle of a
 *  newer maker: those three are named, never compared */
export const VTAG = `${CTAG}-p${PIPELINE_VERSION}-l${LAYOUT}-r${REMOVAL}`
/** the versions a reader compares with its own */
const CONTRACT = [['bundle', BUNDLE], ['pdfjs', PDFJS]]
/** those it reads for their shape alone: the maker's, and the compiler image's (an image change rewrites nothing) */
const NAMED = ['pipeline', 'layout', 'removal', 'image']

/**
 * A bundle refused, and why. BUNDLE 3's refusals carry their whole message as `why` ("<path>: <what>"); BUNDLE 4's
 * (format.mjs) name the kind of object and the path: `o` { kind: 'units' | 'head' | 'part' | 'left' | 'catalog' | 'index',
 * path, data }, the message `<kind>: <path>: <why>` (`<kind>: <why>` for the object as a whole); `data`, where a refusal
 * carries figures (the bound and the size of `units-too-large`), is theirs, null otherwise
 */
export class BundleRefusal extends Error {
  constructor(why, o = null) {
    super(o === null ? why : `${o.kind}: ${o.path ? `${o.path}: ` : ''}${why}`)
    this.name = 'BundleRefusal'
    this.why = why
    this.kind = o === null ? null : o.kind
    this.path = o === null ? null : o.path
    this.data = o?.data ?? null
  }
}
const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v)
const fail = (path, why) => new BundleRefusal(path ? `${path}: ${why}` : why)
/** a layout module's refusal of the part at `path`, as the bundle's */
const within = (path, e) => (e instanceof LayoutRefusal ? fail(e.path ? `${path}.${e.path}` : path, e.why) : e)

/** an object with exactly `keys`; a key of its own named by its first 20 code units */
function exactKeys(v, keys, path) {
  if (!isObject(v)) throw fail(path, `not an object (${kindOf(v)})`)
  for (let i = 0; i < keys.length; i++) if (!Object.hasOwn(v, keys[i])) throw fail(path ? `${path}.${keys[i]}` : keys[i], 'missing')
  const own = Object.keys(v)
  if (own.length !== keys.length) for (let i = 0; i < own.length; i++) if (!keys.includes(own[i])) throw fail(path ? `${path}.${told(own[i])}` : told(own[i]), 'not a key of the schema')
  return v
}
/** the paper version's one path segment, as the web's keys spell it (an old identifier's slash as _) */
export const segmentOf = (id, version) => `${id.replace('/', '_')}v${version}`
/** our copy of arXiv's PDF a bundle was made over (the layer API's original route) */
export const originalUrl = (id, version) => `/api/v1/original/${segmentOf(id, version)}`

// ---------------------------------------------------------------- the writer's
/**
 * The bundle file's bytes (UTF-8 JSON) from its parts: `paper` { id, version, pages }; `base` { bytes, sha256, url },
 * arXiv's PDF it was made over and our copy's address; `image`, the compiler image's name; `units`, bundleUnitsOf's;
 * `left` { kinds, pages, units }, the original's side; `layout`, the layout file (written as its file is, encodeLayout)
 * or null; `rules`, the rules near its table cells by page ({ [page]: x0, y0, x1, y1 stride 4 }) or null. The versions are the
 * engine's, with the image. The same parts give the same bytes: every object of the bundle's own written in one order. Never
 * bytes past BUNDLE_CAP or BUNDLE_VALUES, which readBundle refuses: the layout (and its rules) is written null where the bundle
 * would be past either (the prepare reads the bundle back, and sees which it holds); a bundle past them with none throws
 * BundleRefusal
 */
export function writeBundle({ paper, base, image, units, left, layout, rules = null }) {
  const J = JSON.stringify
  const versions = { bundle: BUNDLE, pipeline: PIPELINE_VERSION, layout: LAYOUT, removal: REMOVAL, pdfjs: PDFJS, image }
  const head = `{"schema":1,"paper":${J({ id: paper.id, version: paper.version, pages: paper.pages })},"base":${J({ bytes: base.bytes, sha256: base.sha256, url: base.url })},"versions":${J(versions)},"units":${J(units)},"left":${J({ kinds: left.kinds, pages: left.pages, units: left.units })}`
  const pagesOf = r => (r === null || !Object.keys(r).length ? null : Object.fromEntries(Object.keys(r).map(Number).sort((x, y) => x - y).map(p => [p, r[p]])))
  const tries = [[layout, layout === null ? null : pagesOf(rules)]]
  if (layout !== null) tries.push([null, null])
  for (const [l, r] of tries) {
    const text = `${head},"layout":${l === null ? 'null' : encodeLayout(l)},"rules":${J(r)}}`
    const bytes = new TextEncoder().encode(text)
    if (bytes.length <= BUNDLE_CAP && countValues(text, BUNDLE_VALUES, DEPTH) <= BUNDLE_VALUES) return bytes
  }
  throw new BundleRefusal(`more than ${BUNDLE_CAP} bytes or ${BUNDLE_VALUES} values with no layout`)
}

/** a paper version's bundle under this engine's versions: `layer/<id>v<n>/<VTAG>.json`, VTAG
 *  `b<BUNDLE>-j<PDFJS>-p<PIPELINE>-l<LAYOUT>-r<REMOVAL>`, an old identifier's slash written _ (the web's keys). Throws a
 *  RangeError on an identifier or a version that is not one */
export function bundleKey(paper, version) {
  if (!isPaperId(paper)) throw new RangeError(`not an arXiv identifier (${told(paper)})`)
  if (!isInteger(version, 1, VERSION_MAX)) throw new RangeError(`not a paper's version 1 to ${VERSION_MAX} (${told(version)})`)
  return `layer/${segmentOf(paper, version)}/${VTAG}.json`
}

// ---------------------------------------------------------------- the reader's
/** a string's UTF-8 bytes, counted no further than past `max` (a lone surrogate as U+FFFD's three) */
function utf8Length(s, max) {
  let n = 0
  for (let i = 0; i < s.length && n <= max; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++ }
    else n += 3
  }
  return n
}
/** the bundle's text: bytes (or a string) as received, refused past `cap` bytes before they are decoded */
function textOf(json, cap) {
  if (typeof json === 'string') {
    if (utf8Length(json, cap) > cap) throw fail('', `more than ${cap} bytes`)
    return json
  }
  if (!(json instanceof Uint8Array)) throw fail('', `not bytes nor a string (${kindOf(json)})`)
  if (json.length > cap) throw fail('', `more than ${cap} bytes`)
  try { return utf8Strict(json) } catch (e) { throw within('', e) }
}

const isText = s => typeof s === 'string' && s.length <= STRING_MAX

/**
 * The bundle as received, read: bytes (or a string) within `caps.bytes` (BUNDLE_CAP), UTF-8, its values within
 * `caps.values` (BUNDLE_VALUES) and its nesting counted before JSON.parse, then every check of §3.3: its schema; its
 * format and PDF.js the reader's (its contract, CTAG), the maker's versions and the image tokens, never compared; its
 * paper; its base's digest 64 hex digits, its bytes 1 to 2^31, its address our copy's; each unit (unitStands), one that
 * does not dropped; the left's kinds (a unit's each), pages (boxes, the paper's) and units ([id, stream, rects] of the
 * bundle's units, each rectangle a box within its page's view, as the layout file's are); the layout by its file's
 * rules (layout/file.mjs checkLayout), of the bundle's paper, PDF.js and units, its pages' views the left's; the
 * rules by page (layout/cell-rules.mjs checkBoxes: each box within its page's view as the left gives it), null where the layout
 * is. Returns the bundle with each unit dropped null at its id and `dropped` those ids rising; throws BundleRefusal
 */
export function readBundle(json, caps = {}) {
  const cap = caps.bytes ?? BUNDLE_CAP, most = caps.values ?? BUNDLE_VALUES
  const text = textOf(json, cap)
  let n
  try { n = countValues(text, most, DEPTH) } catch (e) { throw within('', e) }
  if (n > most) throw fail('', `more than ${most} values`)
  let b
  try { b = JSON.parse(text) } catch { throw fail('', 'not JSON') }

  exactKeys(b, KEYS, '')
  if (b.schema !== 1) throw fail('schema', 'not 1')
  const versions = exactKeys(b.versions, VERSIONS, 'versions')
  for (const [k, want] of CONTRACT) if (versions[k] !== want) throw fail(`versions.${k}`, `not this reader's '${want}'`)
  for (const k of NAMED) if (!isVersionToken(versions[k])) throw fail(`versions.${k}`, `not a version, 1 to 32 letters, digits or points (${kindOf(versions[k])})`)

  const paper = exactKeys(b.paper, ['id', 'version', 'pages'], 'paper')
  if (!isPaperId(paper.id)) throw fail('paper.id', `not an arXiv identifier (${kindOf(paper.id)})`)
  if (!isInteger(paper.version, 1, VERSION_MAX)) throw fail('paper.version', `not an integer 1 to ${VERSION_MAX}`)
  if (!isInteger(paper.pages, 1, PAGES_MAX)) throw fail('paper.pages', `not an integer 1 to ${PAGES_MAX}`)
  const pages = paper.pages
  const base = exactKeys(b.base, ['bytes', 'sha256', 'url'], 'base')
  if (!isInteger(base.bytes, 1, BASE_MAX)) throw fail('base.bytes', `not an integer 1 to ${BASE_MAX}`)
  if (typeof base.sha256 !== 'string' || base.sha256.length !== 64 || !SHA256.test(base.sha256)) throw fail('base.sha256', `not 64 lower-case hex digits (${kindOf(base.sha256)})`)
  if (base.url !== originalUrl(paper.id, paper.version)) throw fail('base.url', `not our copy of the paper's PDF, ${originalUrl(paper.id, paper.version)}`)

  const units = b.units
  if (!Array.isArray(units)) throw fail('units', `not an array (${kindOf(units)})`)
  const stands = new Uint8Array(units.length), dropped = []
  for (let i = 0; i < units.length; i++) {
    if (unitStands(units[i], i, stands)) stands[i] = 1
    else { units[i] = null; dropped.push(i) }
  }

  const left = exactKeys(b.left, ['kinds', 'pages', 'units'], 'left')
  const kinds = left.kinds
  if (!Array.isArray(kinds) || kinds.length !== units.length) throw fail('left.kinds', `not ${units.length} kinds, one a unit (${kindOf(kinds)})`)
  for (let i = 0; i < kinds.length; i++) {
    if (!isText(kinds[i])) throw fail(`left.kinds[${i}]`, `not a string of at most ${STRING_MAX} code units (${kindOf(kinds[i])})`)
    if (stands[i] === 1 && kinds[i] !== units[i][0]) throw fail(`left.kinds[${i}]`, 'not its unit\'s kind')
  }
  const boxes = left.pages
  if (!Array.isArray(boxes) || boxes.length !== pages) throw fail('left.pages', `not ${pages} pages (${kindOf(boxes)})`)
  // each page's view, x0, y0, x1, y1 (stride 4): what the manifest's boxes lie within
  const views = new Array(4 * pages)
  for (let p = 0; p < pages; p++) {
    const box = boxes[p]
    if (!Array.isArray(box) || box.length !== 4) throw fail(`left.pages[${p}]`, `not a page's box [x0, y0, x1, y1] (${kindOf(box)})`)
    for (let q = 0; q < 4; q++) {
      const v = box[q]
      if (!isNumber(v) || Math.abs(v) > COORD_MAX) throw fail(`left.pages[${p}][${q}]`, `not a number within ±${COORD_MAX} (${kindOf(v)})`)
      if (q >= 2 && v <= box[q - 2]) throw fail(`left.pages[${p}][${q}]`, 'an empty box')
      views[4 * p + q] = v
    }
  }
  const wires = left.units
  if (!Array.isArray(wires)) throw fail('left.units', `not an array (${kindOf(wires)})`)
  let last = -1
  for (let i = 0; i < wires.length; i++) {
    const w = wires[i], path = `left.units[${i}]`
    if (!Array.isArray(w) || w.length !== 3) throw fail(path, `not [id, stream, rects] (${kindOf(w)})`)
    if (!isInteger(w[0], last + 1, units.length - 1)) throw fail(`${path}[0]`, 'not a unit\'s id above the last')
    last = w[0]
    if (!isInteger(w[1], 0, Number.MAX_SAFE_INTEGER)) throw fail(`${path}[1]`, 'not a token\'s index')
    const rects = w[2]
    if (!Array.isArray(rects) || rects.length === 0) throw fail(`${path}[2]`, `not a rectangle or more (${kindOf(rects)})`)
    for (let j = 0; j < rects.length; j++) {
      const r = rects[j]
      if (!Array.isArray(r) || r.length !== 5) throw fail(`${path}[2][${j}]`, `not [page, x0, y0, x1, y1] (${kindOf(r)})`)
      if (!isInteger(r[0], 1, pages)) throw fail(`${path}[2][${j}][0]`, `not a page 1 to ${pages}`)
      // (a box not empty, within its page's view as the layout file's are: x0, y0, x1, y1, each across or up)
      const v = 4 * (r[0] - 1)
      for (let q = 1; q < 5; q++) {
        const x = r[q], up = (q - 1) % 2
        if (!isNumber(x) || x < views[v + up] - SLACK || x > views[v + 2 + up] + SLACK) throw fail(`${path}[2][${j}][${q}]`, `not a number within its page's view (${kindOf(x)})`)
        if (q >= 3 && x <= r[q - 2]) throw fail(`${path}[2][${j}][${q}]`, 'an empty box')
      }
    }
  }

  let layout = null
  if (b.layout !== null) {
    try { layout = checkLayout(b.layout) } catch (e) { throw within('layout', e) }
    const lp = layout.paper
    if (lp.id !== paper.id || lp.version !== paper.version || lp.pages !== pages) throw fail('layout.paper', 'not the bundle\'s paper')
    // (its geometry read by the PDF.js the bundle names, the reader's own)
    if (layout.pdfjs !== versions.pdfjs) throw fail('layout.pdfjs', `not the bundle's PDF.js '${versions.pdfjs}'`)
    // (its pages' views the left's, by the point a box may lie past them: the two sides read one page)
    for (let i = 0; i < views.length; i++) if (Math.abs(layout.views[i] - views[i]) > SLACK) throw fail(`layout.views[${i}]`, `not the left's page ${Math.floor(i / 4) + 1} within ${SLACK} pt`)
    // its units the bundle's: each one's kind and pieces, where it stands, those the layout file located
    for (let i = 0; i < layout.units.length; i++) {
      const [id, kind, , , count] = layout.units[i]
      if (id >= units.length) throw fail(`layout.units[${i}][0]`, 'not a unit of the bundle')
      if (stands[id] === 0) continue
      if (UNIT_KINDS[kind] !== units[id][0]) throw fail(`layout.units[${i}][1]`, 'not its unit\'s kind')
      if (count !== units[id][5].length) throw fail(`layout.units[${i}][4]`, 'not its unit\'s pieces')
    }
  }

  let rules = null
  if (b.rules !== null) {
    if (layout === null) throw fail('rules', 'not null where the layout is none')
    if (!isObject(b.rules) || Array.isArray(b.rules) || !Object.keys(b.rules).length) throw fail('rules', `not an object of pages (${kindOf(b.rules)})`)
    rules = {}
    for (const k of Object.keys(b.rules)) {
      const p = /^[1-9]\d{0,4}$/.test(k) ? Number(k) : NaN
      if (!isInteger(p, 1, pages)) throw fail(`rules.${told(k)}`, `not a page 1 to ${pages}`)
      if (!Array.isArray(b.rules[k]) || !b.rules[k].length) throw fail(`rules.${k}`, `not boxes (${kindOf(b.rules[k])})`)
      try { rules[p] = checkBoxes(b.rules[k], p, views, k) } catch (e) { throw within('rules', e) }
    }
  }
  return { schema: 1, paper, base, versions, units, left, layout, rules, dropped }
}
