// The layer's wire format, BUNDLE 4 (the prepare pipeline's bundle 4 contract; BUNDLE 3's one file is bundle.mjs): a paper's
// layer is five kinds of object, each written once and read by its own reader, all within bounds. The units chunks hold the
// paper's units (openPaper's, language-independent); the head binds the paper, the original, the versions and the chunks;
// a part holds what the layer needs of some pages (the original's side of the units it places, their layout rows, the views,
// the rules near its table cells); a left part holds one page's tokens, spans and word pairs; the catalog lists
// them all and says how far the parts go. Every object's first two keys are `bundle` and `kind`; it is named by its digest.
//
// A reader receives an object from the network, so it is untrusted and read within bounds before anything is used, in this
// order: the bytes (a Uint8Array, as many as its ref says and its kind's cap allows, refused before they are hashed), the
// digest (SHA-256 of the exact bytes, refused before they are decoded), the UTF-8, the values and the nesting (counted before
// JSON.parse), the shape by plain loops (a value of the wrong type named by its type, never converted), and what the object
// must agree with: the index, the chain of the parts told before it. A refusal is BundleRefusal with the kind of object and
// the path in it. A memory-class error (pipeline/memory.mjs) is never wrapped: it goes on as itself.
//
// The writers are the readers' mirror: each builds its object in the order of the schema, counts what it writes as the
// reader will, and checks the shape rules it can see with the reader's own checks, so that it never emits what its reader
// refuses (a throw is BundleRefusal, a defect of the caller's input and no silent loss). The same input gives the same bytes.
//
// Imports the layout's parsers, the engine's versions, the units, and the rows' and the translation's readings of a unit
// (for `records`, below) alone: never the run, the remover, the layout's maker nor the front end, which a reader does not load.
import { checkBoxes } from '../layout/cell-rules.mjs'
import { checkLayoutPart, checkLineskip, isPaperId, LAYOUT, LAYOUT_SCHEMA, layoutPartRows, mergeLayout, UNIT_KINDS, VERSION_MAX } from '../layout/file.mjs'
import { COORD_MAX, countValues, isInteger, isNumber, isObject, isVersionToken, LayoutRefusal, PAGES_MAX, told } from '../layout/json.mjs'
import { BASE_KINDS, countOf, DELTA_MAX_BYTES, deltaSection, replacedWhy, WRAP_STATS, wrapWhy } from '../layout/delta-wire.mjs'
import { isMemoryError } from '../pipeline/memory.mjs'
import { OCR, PDFJS, PIPELINE_VERSION, REMOVAL } from '../pipeline/versions.mjs'
import { groupOf } from '../translate/groups.mjs'
import { plainSource } from '../translate/mt.mjs'
import { BundleRefusal, originalUrl, segmentOf } from './bundle.mjs'
import { FIGURE_KIND, OCR_KIND } from '../rules/content-classes.mjs'
import { checkDraw, DrawRefusal, wireOf } from './draw.mjs'
import { checkFigures } from './figure-rows.mjs'
import { sourceUnitsOf } from './rows.mjs'
import { CELL, EDGES, unitStands } from './units.mjs'
import { CLASS_IDS } from '../rules/content-classes.mjs'

// ---------------------------------------------------------------- the versions and the bounds
/** the format: raised with any change to the shape of a head, part, left part or catalog, and with it the CTAG. 6: a part
 *  with no layout says why (`layout: { refused, why }`, LAYOUT_REFUSED), where 5's held a bare null (R1 of 2026-10-19): a
 *  reader of 5 refuses the new shape, so the contract is named anew; nothing deployed reads 5 (the owner's rule: no
 *  migration), and a bundle of 5 is simply not found under 6's CTAG and is prepared again. 7: each text item of a left part's
 *  draw carries its characters' fills (draw.mjs, the item's tenth value: layout/fills.mjs itemFills, E1 of 2026-10-19), which a
 *  reader of 6 refuses; a bundle of 6 is not found under 7's CTAG and is prepared again. 8 (layer route step 2, our compile
 *  the base page): the head's `base` says whose PDF the layer is drawn over (`source`: 'ours', the final pass of our marked
 *  compile, with its check, or 'arxiv', with why our base was refused) and `orig` names arXiv's PDF beside ours; the catalog
 *  names the base object (`base`); a part with no layout may say `final` or `boxes` too (LAYOUT_REFUSED). A reader of 7
 *  refuses the new keys. 9 (REMOVAL 8, the per-unit erasure): a part carries its pages' cell rules (`rules`) in place of the
 *  text-removed PDF's add-on (`addon`, its manifest and tail), no tail follows a part, and our base page is wrapped by optional
 *  content (the head's `base.stats`, `unhidden`, `labelKept`): a reader of 8 refuses a part of 9, and this one a part of 8, so
 *  a bundle of 8 is not found under 9's CTAG and is prepared again. The head's and the catalog's shapes are 8's. This reader
 *  reads 7's objects as well (BUNDLES_READ): a head of 7 is one over arXiv's PDF. 10 (docs/route/orphan-text.md §8): the ink units,
 *  text no source unit owns made units of our glyphs, after the source units' in a chunk of INK_UNITS_FORMAT, of kinds UNIT_KINDS
 *  names after the source units' (a reader of 9 refuses their layout rows), and the head's base of ours carries its content
 *  classes' ledger (`ledger`); and in the same unreleased 10 (the content class `figures`, stage 5) a part may carry its
 *  pages' figure units (`figures`, figure-rows.mjs: each an ink unit of kind `inkfigures`, its place on its page), the key there
 *  only where the part has one, so that a part with none is written as before; this reader reads 9's objects unchanged (none
 *  holds any of them). 11 (the owner's rule of 2026-10-29, docs/PDF-READER.md §19.12: a figure's labels of one group at one
 *  size, each at its original's edge, a translation into the free line beside it): a figure row carries its set and its room
 *  (figure-rows.mjs FIGURE_ROW, three values more), which a reader of 10 refuses; a bundle of 10 is not found under 11's CTAG
 *  and is prepared again. The head's, the left parts' and the catalog's shapes are 10's. This reader reads 10's objects too,
 *  a row of 10's each unit its own set with no room (FIGURE_ROW_10): as 10 drew it */
export const BUNDLE5 = '11'
/** the formats this reader takes: its own, and 7's (a bundle drawn over arXiv's PDF, whose objects 9 reads unchanged: its
 *  head is read as `base.source` 'arxiv', with no `orig`), 9's and 10's. Every object of a bundle is of its head's format */
export const BUNDLES_READ = Object.freeze(['7', '9', '10', BUNDLE5])
/** the formats whose parts may carry figure units (`figures`, figure-rows.mjs: 10's rows without a set or a room) */
const FIGURES_READ = Object.freeze(['10', BUNDLE5])
/** a units chunk's own format (amendment M12): raised only by a change to the chunk's shape, so that a change to a part's
 *  shape renames no unit identity and redoes no translation */
export const UNITS_FORMAT = '1'
/** the ink units' chunk's format (docs/route/orphan-text.md §8): UNITS_FORMAT's, an ink unit's tuple with its echo besides
 *  (units.mjs inkBundleUnitsOf); the source units' chunks stay UNITS_FORMAT's, byte for byte */
export const INK_UNITS_FORMAT = '2'
/** the units chunks' formats this reader takes */
export const UNITS_FORMATS_READ = Object.freeze([UNITS_FORMAT, INK_UNITS_FORMAT])
/** the reader's contract, `b<BUNDLE5>-j<PDFJS>`: what a reader asks by. Named with the 5 beside bundle.mjs's CTAG (BUNDLE
 *  3's) whatever BUNDLE5's value: the web's service and readers import BUNDLE5, CTAG5 and VTAG5 by these names */
export const CTAG5 = `b${BUNDLE5}-j${PDFJS}`
/** the content's: the contract, then the pipeline, the layout maker, the remover and (BUNDLE5 10's, PDF-READER §19.15) the bitmap
 *  figures' recogniser the server made it with; a key's directory (and the catalog's name). A reader reads objects of a newer
 *  maker: those are named, never compared */
export const VTAG5 = `${CTAG5}-p${PIPELINE_VERSION}-l${LAYOUT}-r${REMOVAL}-o${OCR}`

/** a units chunk's bytes at most, its values, and its nesting: the object, `units`, a unit, its pieces, a piece */
export const UNITS_CAP = 2 * 2 ** 20, UNITS_VALUES = 400_000
const UNITS_DEPTH = 5
/** the chunks a paper's units may fill at most, and their bytes and values in all (amendment M2'): an ABUSE GUARD, not a limit
 *  on a paper's length, sized at 10 times the longest real book and more (G3's units are 2,458,984 bytes and 161,607 values).
 *  If a guard would bind before memory does on a real paper, the answer is per chunk, never a lower total. They are here
 *  and nowhere else */
export const CHUNKS_MAX = 20, UNITS_TOTAL_BYTES = 32 * 2 ** 20, UNITS_TOTAL_VALUES = 3_500_000
/** the last unit id a paper the guard accepts can hold (every unit is at least one value), and the most ids a service forwards as `dropped` (amendments M19, M21) */
export const UNIT_ID_MAX = UNITS_TOTAL_VALUES, DROPPED_MAX = 148_000
/** the head's: the object, `units` and a ref in it, or `base`, its `check` and its page counts */
export const HEAD_CAP = 1024 * 1024, HEAD_VALUES = 64_000
const HEAD_DEPTH = 4
/** a part's: the object, its layout part, a table of it, a row, a row's values; `rules`, a page's boxes */
export const PART_CAP = 6 * 2 ** 20, PART_VALUES = 1_000_000
const PART_DEPTH = 7
/** a left part's: the object, `spans` or `pairs`, an entry, its ranges or runs */
export const LEFT_CAP = 2 * 1024 * 1024, LEFT_VALUES = 320_000
const LEFT_DEPTH = 5
/** the catalog's: the object, a list, a ref */
export const CATALOG_CAP = 2 * 2 ** 20, CATALOG_VALUES = 200_000
const CATALOG_DEPTH = 3
/** a part's content at most: the cap less 64 KiB for the digests and the rest. The cut holds a part to it, so that a part's size is
 *  bounded by the cut and not by the paper */
export const CONTENT_MAX = PART_CAP - 64 * 1024
/** a left part's tokens at most (a page of a dense paper holds thousands), and the tokens its spans may name, per token */
export const TOKENS_PAGE = 15_000, SPANNED_PER_TOKEN = 2
/** the tokens' wire: integers of TOKEN_SCALE (thousandths of a PDF unit), delta-coded, a decoded value past ±TOKEN_LIMIT
 *  PDF units no PDF's */
export const TOKEN_SCALE = 1000, TOKEN_LIMIT = 100_000
/** why a part has no layout, as the part records it in place of its layout (`layout: { refused, why }`, `why` WHY_MAX code
 *  units at most), for a reader to say and a sweep to count, never to draw by: TeX's — `compile` (the paper's own source does
 *  not make arXiv's pages here: a missing package, an error of its own, a compile the host stopped; and every cause nobody
 *  judged: a marked original of fewer pages than arXiv's PDF where the host gave the guard no page count, no compile left to
 *  tell whose fault it is, a compile that threw), `texlive` (as compile, the paper declaring another TeX Live year than the
 *  box's), `engine` (a compiler the host does not run, as `engines` or its answer names it) —; ours — `marks` (the marked original is not the paper and the layout guard could not mend it, or the mark probe,
 *  the marks' reading or the maker failed) —; and `carry` (no unit of our compile laid: no page with a unit on it arXiv's
 *  page, layout/make.mjs drawable); BUNDLE 8's, where our compile is no base page — `final` (the final pass of the
 *  marked original failed, or did not place every mark where the draft did, or the compile budget held none), `boxes` (a page
 *  of ours is not arXiv's size, or the page counts differ), `wrap` (our pages could not be wrapped by optional content: layout/
 *  wrap.mjs wrapFinal's refusal, `wrap-<code>` in the why). A part with `layout: null` is one whose producer recorded no
 *  reason (5's shape, cutBundle with none given) */
export const LAYOUT_REFUSED = Object.freeze(['compile', 'carry', 'engine', 'texlive', 'marks', 'final', 'boxes', 'wrap'])
/** whose PDF a layer is drawn over (the head's `base.source`): our compile's final pass, or arXiv's (a fallback, or a bundle of 7) */
export const BASE_SOURCES = Object.freeze(['ours', 'arxiv'])
/** how a base of ours is held (the head's `base.kind`, BUNDLE 8): `delta`, an incremental update over arXiv's PDF (the
 *  composed document arXiv's bytes and the delta: layout/delta.mjs), or `full`, our whole PDF (no `kind` on
 *  the wire: a head without one reads as `full`), the delta's fallback. The delta's bounds and its replaced pages' list:
 *  layout/delta-wire.mjs */
export { BASE_KINDS, DELTA_MAX_BYTES }
export { DELTA_MAX_SHARE, REPLACED_MAX, deltaSection, replacedWhy } from '../layout/delta-wire.mjs'
/** why a head's base is arXiv's in a bundle of 8 (`base.why`): the paper's refusal, a code of LAYOUT_REFUSED, which every part
 *  with no layout says too */
export const BASE_WHYS = LAYOUT_REFUSED
/**
 * Whether a head's layer draws: its base is ours (BUNDLE 8, the final pass of the marked original the layout file was made over).
 * The one predicate every reader and host asks (`base` a head's base, readHead's): a head of 7 (arXiv's PDF, as every base was)
 * and every head over arXiv's PDF, with a why or none, draw nothing (design note §3.5, §3.6)
 */
export const layerDraws = base => base !== null && typeof base === 'object' && base.source === 'ours'
/** the limits a refusal may name that another try may not meet again (`limit`): the box's wall clock and the compile budget;
 *  its cpu, file-size and disk limits meet the same paper on the same box again */
export const RETRY_LIMITS = Object.freeze(['wall', 'budget'])
/**
 * Whether a refusal of our base page (markedOfPaper's or layoutMarksOfPaper's paper refusal, or its `base` refusal) may be
 * transient, so that the host retries the paper (once, the host's rule) rather than commit a fallback head for good: exactly
 * where it names the box's wall clock or the compile budget as what stopped it (`limit` 'wall' or 'budget', RETRY_LIMITS; the
 * name is limitOf's: the box's own, 'time' for another host's timeout, or 'budget').
 *   code      retryable where                                               for good where
 *   compile   the marked original or the paper's own source was stopped by  the paper's own source fails as itself (TeX's
 *             the wall clock; no compile left in the budget to tell whose   error, its pages), TeX never ran in it, or a cpu,
 *             fault it is (the paper's own source not compiled)             file-size or disk limit stopped it
 *   final     the final pass was stopped by the wall clock, or the budget   a check failed (a mark moved, another page count
 *             held no compile for it                                        or box), the pass did not run through or threw,
 *                                                                           or a cpu, file-size or disk limit stopped it
 *   carry, marks, boxes, engine, texlive   never                            always (texlive after every served tree)
 * A fault of the host's machinery (a failed allocation, a jail that fails) is no refusal: it is thrown, and retried as before
 */
export const baseRefusalRetryable = r => r !== null && typeof r === 'object' && RETRY_LIMITS.includes(r.limit)
export const WHY_MAX = 300
/** a why as a record holds it: a run of control characters (a TeX log's raw bytes, a terminal's escapes) one space, within
 *  WHY_MAX */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters a why is kept without
export const whyText = s => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, WHY_MAX)
/** whether a part's `layout` as given or on the wire is a refusal's record, not a layout part (which holds no `refused`) */
export const isLayoutRefusal = v => isObject(v) && Object.hasOwn(v, 'refused')
/** why the parts end before the paper does (the catalog's `end.refused`), amendment M4: FINAL, the paper's own, which a new
 *  build does not change (a writer's bound, a refused part); BUILD-SCOPED, of the build's resources, which another build may
 *  not meet (memory, an engine failure, the deadline) */
export const FINAL_END_WHYS = Object.freeze(['bound', 'part'])
export const BUILD_END_WHYS = Object.freeze(['memory', 'internal', 'deadline'])
export const END_WHYS = Object.freeze([...FINAL_END_WHYS, ...BUILD_END_WHYS])
/** whether an ending is final: no other build of the engine would end otherwise */
export const isFinalEnd = why => FINAL_END_WHYS.includes(why)

/** a left rectangle of a part lies within its page's view by this, PDF units (the layout file's slack): the producer's own
 *  (pipeline/left-side.mjs) clips to the view what lies past it */
export const RECT_SLACK = 1
const SHA256 = /^[0-9a-f]{64}$/
const BASE_MAX = 2 ** 31
const ID_MAX = Number.MAX_SAFE_INTEGER
/** the version tokens of a head, in order; the reader compares `pdfjs` with its own and reads the rest as tokens. A head of 10 (and
 *  its catalog) names the bitmap figures' recogniser too (`ocr`, pipeline/versions.mjs OCR); one of 7 or 9 does not */
const VERSION_KEYS_9 = ['pipeline', 'layout', 'removal', 'pdfjs', 'image']
const VERSION_KEYS = [...VERSION_KEYS_9, 'ocr']
const versionKeysOf = bundle => (bundle === BUNDLE5 ? VERSION_KEYS : VERSION_KEYS_9)
const NAMED_VERSIONS = ['pipeline', 'layout', 'removal', 'image', 'ocr']

// ---------------------------------------------------------------- refusals and small checks
const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v)
const refuse = (kind, path, why) => new BundleRefusal(why, { kind, path })
const sub = (path, k) => (path ? `${path}.${k}` : k)
const isDigest = v => typeof v === 'string' && v.length === 64 && SHA256.test(v)
const r2 = v => Math.round(v * 100) / 100
const r3 = v => Math.round(v * 1000) / 1000
/** a number on the wire's grid (TOKEN_SCALE: thousandths of a PDF unit), as the views and rectangles of a part are written */
export const onGrid = r3

/** a layout module's refusal at `path` of the object, as the format's; any other error as it is */
function inside(kind, path, fn) {
  try { return fn() } catch (e) {
    if (e instanceof LayoutRefusal) throw new BundleRefusal(e.why, { kind, path: e.path ? sub(path, e.path) : path, ...(e.bound ? { data: { bound: e.bound } } : {}) })
    throw e
  }
}

/** an object with exactly `keys`; a key of its own named by its first 20 code units */
function exactKeys(kind, v, keys, path) {
  if (!isObject(v)) throw refuse(kind, path, `not an object (${kindOf(v)})`)
  for (let i = 0; i < keys.length; i++) if (!Object.hasOwn(v, keys[i])) throw refuse(kind, sub(path, keys[i]), 'missing')
  const own = Object.keys(v)
  if (own.length !== keys.length) for (let i = 0; i < own.length; i++) if (!keys.includes(own[i])) throw refuse(kind, sub(path, told(own[i])), 'not a key of the schema')
  return v
}

/** the object's first two keys: the format (`bundle`, one of BUNDLES_READ; a units chunk's own `format`) and the kind it is;
 *  refused for what it is before its other keys are looked at; `optional`: keys that may be there besides `keys`. `of`: the
 *  format the object must be of (its head's), where it is known */
function envelope(kind, v, keys, optional = [], of = null) {
  const tag = kind === 'units' ? 'format' : 'bundle', want = kind === 'units' ? UNITS_FORMATS_READ : of === null ? BUNDLES_READ : [of]
  if (!isObject(v)) throw refuse(kind, '', `not an object (${kindOf(v)})`)
  if (!want.includes(v[tag])) throw refuse(kind, tag, `not this reader's ${want.map(w => `'${w}'`).join(' or ')} (${typeof v[tag] === 'string' ? told(v[tag]) : kindOf(v[tag])})`)
  if (v.kind !== kind) throw refuse(kind, 'kind', `not a ${kind} (${typeof v.kind === 'string' ? told(v.kind) : kindOf(v.kind)})`)
  exactKeys(kind, v, optional.length ? [...keys, ...optional.filter(k => Object.hasOwn(v, k))] : keys, '')
}

function digestField(kind, v, path) {
  if (!isDigest(v)) throw refuse(kind, path, `not 64 lower-case hex digits (${kindOf(v)})`)
  return v
}

/** a paper { id, version } or { id, version, pages } */
function paperOf(kind, p, path, withPages) {
  exactKeys(kind, p, withPages ? ['id', 'version', 'pages'] : ['id', 'version'], path)
  if (!isPaperId(p.id)) throw refuse(kind, sub(path, 'id'), `not an arXiv identifier (${kindOf(p.id)})`)
  if (!isInteger(p.version, 1, VERSION_MAX)) throw refuse(kind, sub(path, 'version'), `not an integer 1 to ${VERSION_MAX}`)
  if (withPages && !isInteger(p.pages, 1, PAGES_MAX)) throw refuse(kind, sub(path, 'pages'), `not an integer 1 to ${PAGES_MAX}`)
  return p
}

/** the versions of a head or a catalog of format `bundle`: the PDF.js the reader's own, the others tokens */
function versionsOf(kind, v, path, bundle) {
  const keys = versionKeysOf(bundle)
  exactKeys(kind, v, keys, path)
  if (v.pdfjs !== PDFJS) throw refuse(kind, sub(path, 'pdfjs'), `not this reader's '${PDFJS}'`)
  for (const k of NAMED_VERSIONS) if (keys.includes(k) && !isVersionToken(v[k])) throw refuse(kind, sub(path, k), `not a version, 1 to 32 letters, digits or points (${kindOf(v[k])})`)
  return v
}

/** a reference to an object: its kind, its digest and bytes (1 to `max`) and, by `shape`, its position: `from` and `to` (a
 *  range) or `page` (amendment M1: a ref is { kind, sha256, bytes, from?, to?, page? } and holds no key) */
function refOf(kind, r, path, refKind, shape, max) {
  const keys = shape === 'range' ? ['kind', 'from', 'to', 'sha256', 'bytes'] : shape === 'page' ? ['kind', 'page', 'sha256', 'bytes'] : ['kind', 'sha256', 'bytes']
  exactKeys(kind, r, keys, path)
  if (r.kind !== refKind) throw refuse(kind, sub(path, 'kind'), `not a ref to a ${refKind} (${typeof r.kind === 'string' ? told(r.kind) : kindOf(r.kind)})`)
  digestField(kind, r.sha256, sub(path, 'sha256'))
  if (!isInteger(r.bytes, 1, max)) throw refuse(kind, sub(path, 'bytes'), `not an integer 1 to ${max}`)
  return r
}

/** the refs of a list of ranges of `refKind`: `lo` to `hi` refs, contiguous from `first`, each within `last`; gives the last
 *  `to` */
function rangesOf(kind, list, path, { refKind, lo, hi, first, last, max }) {
  if (!Array.isArray(list)) throw refuse(kind, path, `not an array (${kindOf(list)})`)
  if (list.length < lo || list.length > hi) throw refuse(kind, path, `not ${lo} to ${hi} refs (${list.length})`)
  let next = first
  for (let i = 0; i < list.length; i++) {
    const p = `${path}[${i}]`, r = refOf(kind, list[i], p, refKind, 'range', max)
    if (r.from !== next) throw refuse(kind, `${p}.from`, `not ${next}, the one after the last`)
    if (!isInteger(r.to, r.from, last)) throw refuse(kind, `${p}.to`, `not an integer ${r.from} to ${last}`)
    next = r.to + 1
  }
  return next - 1
}

// ---------------------------------------------------------------- digest, bytes in, bytes out
const HEX = '0123456789abcdef'
/** SHA-256 of `bytes`, 64 lower-case hex digits (Web Crypto: Node, browsers, Workers) */
async function digestOf(bytes) {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
  let s = ''
  for (let i = 0; i < d.length; i++) s += HEX[d[i] >> 4] + HEX[d[i] & 15]
  return s
}

/**
 * The first steps of every reader, in the order of refusal: not a Uint8Array (a TypeError); more bytes than its ref says or
 * its kind's cap allows (nothing hashed or decoded); a digest that is not its ref's (nothing decoded; a catalog fetched by
 * name has no ref, and its digest is computed and given); malformed UTF-8; more values or more nesting than the kind's
 * (counted before JSON.parse); not JSON. Gives the value and the digest
 */
async function opened(kind, bytes, ref, def, caps) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError(`${kind}: not a Uint8Array (${kindOf(bytes)})`)
  if (ref !== null && (!isObject(ref) || !isDigest(ref.sha256) || !Number.isSafeInteger(ref.bytes) || ref.bytes < 0)) throw new TypeError(`${kind}: not a ref { sha256, bytes }`)
  // (a ref wherever a digest is checked, caps that are positive integers: the host's options are not trusted to turn a check off)
  if (ref === null && kind !== 'catalog') throw new TypeError(`${kind}: a ref { kind, sha256, bytes } is required`)
  const lower = (v, name) => {
    if (v === undefined) return Infinity
    if (!Number.isSafeInteger(v) || v < 1) throw new TypeError(`${kind}: caps.${name} is not a positive integer (${kindOf(v)})`)
    return v
  }
  const cap = Math.min(def.cap, lower(caps?.bytes, 'bytes')), most = Math.min(def.values, lower(caps?.values, 'values'))
  if (ref !== null && ref.kind !== kind) throw refuse(kind, 'ref', `a ref to a ${typeof ref.kind === 'string' ? told(ref.kind) : kindOf(ref.kind)}, not a ${kind}`)
  if (ref !== null && bytes.length !== ref.bytes) throw refuse(kind, '', `${bytes.length} bytes, not the ref's ${ref.bytes}`)
  if (bytes.length > cap) throw refuse(kind, '', `${bytes.length} bytes, more than ${cap}`)
  const sha256 = await digestOf(bytes)
  if (ref !== null && sha256 !== ref.sha256) throw refuse(kind, '', 'not the digest of its ref')
  // (strict UTF-8: a TextDecoder's TypeError is the bytes' malformation; anything else, a memory-class error among it, is not)
  let text
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch (e) {
    if (e instanceof TypeError) throw refuse(kind, '', 'malformed UTF-8')
    throw e
  }
  const n = inside(kind, '', () => countValues(text, most, def.depth))
  if (n > most) throw refuse(kind, '', `more than ${most} values`)
  let value
  try { value = JSON.parse(text) } catch (e) {
    if (isMemoryError(e)) throw e
    throw refuse(kind, '', 'not JSON')
  }
  return { value, sha256, values: n }
}

const encoder = new TextEncoder()
/** a text already built, counted as the reader will (bytes, values, nesting), digested and keyed; `pos` ({ from, to } or
 *  { page }) is the object's place, on its ref and on the result. `contentOf` gives, of the bytes, the content where the kind
 *  bounds that too (a part's) */
async function finish(kind, text, def, paper, pos, contentOf = null, vtag = null, pre = null) {
  const bytes = pre?.bytes ?? encoder.encode(text)
  // (`data.bound` tells which bound a writer's output passed, for the cut, which closes a part before it does)
  const past = (why, bound, size, max) => new BundleRefusal(why, { kind, path: '', data: { bound, size, max } })
  if (bytes.length > def.cap) throw past(`${bytes.length} bytes, past ${def.cap}`, 'bytes', bytes.length, def.cap)
  const n = pre?.values ?? inside(kind, '', () => countValues(text, def.values, def.depth))
  if (n > def.values) throw past(`more than ${def.values} values`, 'values', n, def.values)
  if (contentOf !== null) {
    const content = contentOf(bytes.length)
    if (content > CONTENT_MAX) throw past(`${content} bytes of content, past ${CONTENT_MAX}`, 'content', content, CONTENT_MAX)
  }
  const sha256 = await digestOf(bytes)
  const key = kind === 'catalog' ? catalogKey(paper.id, paper.version, vtag) : keyOf(paper.id, paper.version, CTAG5, sha256)
  return { kind, bytes, sha256, key, ref: { kind, ...pos, sha256, bytes: bytes.length }, ...pos, values: n }
}
const written = (kind, obj, def, paper, pos, contentOf = null, vtag = null) => finish(kind, JSON.stringify(obj), def, paper, pos, contentOf, vtag)

/** the VTAG the versions of a head or a catalog make, of its format (this writer's, or the catalog's as read): what names the
 *  catalog, for its writer and for its reader */
const vtagOf = (v, bundle = BUNDLE5) => `b${bundle}-j${v.pdfjs}-p${v.pipeline}-l${v.layout}-r${v.removal}${v.ocr === undefined ? '' : `-o${v.ocr}`}`

// ---------------------------------------------------------------- keys
const CTAG_FORM = /^b[0-9]+-j[0-9A-Za-z.]+$/
const VTAG_FORM = /^b[0-9]+-j[0-9A-Za-z.]+-p[0-9A-Za-z.]+-l[0-9A-Za-z.]+-r[0-9A-Za-z.]+(?:-o[0-9A-Za-z.]+)?$/
function segOf(paper, version) {
  if (!isPaperId(paper)) throw new RangeError(`not an arXiv identifier (${told(paper)})`)
  if (!isInteger(version, 1, VERSION_MAX)) throw new RangeError(`not a paper's version 1 to ${VERSION_MAX} (${told(version)})`)
  return segmentOf(paper, version)
}

/**
 * The name of an object (amendment M1: every kind but the catalog is named by its whole digest, so that the object's name
 * holds nothing that could disagree with it, and a units chunk is shared by every VTAG of its CTAG): `layer/<seg>/<ctag>/
 * <sha256>.json`, `seg` being `<id>v<n>`, an old identifier's slash written _ (the web stores it as `layer3/…`). Throws a
 * RangeError on an identifier, a version, a ctag or a digest that is not one
 */
export function keyOf(paper, version, ctag, sha256) {
  const seg = segOf(paper, version)
  if (typeof ctag !== 'string' || !CTAG_FORM.test(ctag)) throw new RangeError(`not a CTAG (${told(ctag)})`)
  if (!isDigest(sha256)) throw new RangeError('not a digest')
  return `layer/${seg}/${ctag}/${sha256}.json`
}

/** the catalog's name: `layer/<seg>/<vtag>.json`, the content's VTAG naming it (the web stores it as `layer3/…`). Throws a
 *  RangeError on what is not a paper version or a VTAG */
export function catalogKey(paper, version, vtag) {
  const seg = segOf(paper, version)
  if (typeof vtag !== 'string' || !VTAG_FORM.test(vtag)) throw new RangeError(`not a VTAG (${told(vtag)})`)
  return `layer/${seg}/${vtag}.json`
}

/** the name of a base page of ours (BUNDLE 8: the final pass of the marked original, which the layer is drawn over):
 *  `base/<seg>/<sha256>.pdf`, named by its whole digest, immutable, as R2 holds it (the catalog's `base.key`). Throws a
 *  RangeError on an identifier, a version or a digest that is not one */
export function baseKey(paper, version, sha256) {
  const seg = segOf(paper, version)
  if (!isDigest(sha256)) throw new RangeError('not a digest')
  return `base/${seg}/${sha256}.pdf`
}

/** the name of a delta (BUNDLE 8, our base held as an update over arXiv's PDF): a bundle object beside the units chunks, content-
 *  addressed under the CTAG, `layer/<seg>/<ctag>/<sha256>.delta` (keyOf's directory and digest, its own suffix: its bytes are a
 *  PDF section, not JSON), never a /base/ PDF. Throws a RangeError on an identifier, a version or a digest that is not one */
export const deltaKey = (paper, version, sha256) => `${keyOf(paper, version, CTAG5, sha256).slice(0, -'.json'.length)}.delta`

/** a key taken apart: `{ paper, version, ctag, sha256 }` for an object, `{ paper, version, vtag }` for a catalog; null for
 *  what keyOf and catalogKey would not write (a leading zero, upper-case hex, a slash where a _ goes) */
export function keyParts(key) {
  if (typeof key !== 'string' || key.length > 300) return null
  const obj = /^layer\/([^/]+)\/([^/]+)\/([^/]+)\.json$/.exec(key), cat = /^layer\/([^/]+)\/([^/]+)\.json$/.exec(key)
  const m = obj ?? cat
  if (m === null) return null
  const seg = /^(.+)v([1-9]\d{0,3})$/.exec(m[1])
  if (seg === null) return null
  const paper = seg[1].replace('_', '/'), version = Number(seg[2])
  try {
    if (obj) {
      const parts = { paper, version, ctag: m[2], sha256: m[3] }
      return keyOf(paper, version, parts.ctag, parts.sha256) === key ? parts : null
    }
    const parts = { paper, version, vtag: m[2] }
    return catalogKey(paper, version, parts.vtag) === key ? parts : null
  } catch { return null }
}

/** the last page of the part that begins at page `a` of `N` in the doubling schedule: 1, 2–3, 4–7, … and N (min(N, 2a − 1)) */
export function partTarget(a, N) {
  if (!isInteger(a, 1, ID_MAX) || !isInteger(N, 1, ID_MAX)) throw new RangeError('not a page and a page count')
  return Math.min(N, 2 * a - 1)
}

// ---------------------------------------------------------------- units chunks
const UNITS_KEYS = ['format', 'kind', 'paper', 'pipeline', 'ids', 'units']
const UNITS_DEF = { cap: UNITS_CAP, values: UNITS_VALUES, depth: UNITS_DEPTH }

/**
 * A units chunk as received: within its caps and its ref, its envelope (`format` UNITS_FORMAT, `kind` units) and shape;
 * `before` the chunk before it, null for the first. Its `ids` [from, to] begin at 0 or at the last `to` + 1, it holds exactly
 * those units, and it is of the paper and the pipeline of the chunk before. A unit that does not stand (unitStands: a bad
 * shape, a nested piece naming no unit before it that stands, in this chunk or an earlier one) is null at its id and listed in
 * `dropped`, and the rest stand. Throws BundleRefusal, a TypeError for bytes that are not a Uint8Array
 */
export async function readUnitsChunk(bytes, { ref, before = null, dropped: droppedBefore, bodies = true, caps }) {
  const K = 'units'
  if (before !== null && !(isObject(before) && before.kind === 'units' && before.stands instanceof Uint8Array && Number.isInteger(before.to))) throw new TypeError('units: `before` is not the chunk read before')
  // (amendment M19: a chunk read alone, `before` null, is told the ids below its `from` that did not stand; every other earlier id stands)
  if (droppedBefore !== undefined) {
    if (before !== null) throw new TypeError('units: `dropped` is for a chunk read with no `before`')
    if (!Array.isArray(droppedBefore)) throw new TypeError('units: `dropped` is not an array of ids')
    if (droppedBefore.length > DROPPED_MAX) throw refuse(K, 'dropped', `more than ${DROPPED_MAX} ids`)
    const from = ref.from ?? 0
    for (let i = 0, last = -1; i < droppedBefore.length; i++) {
      const d = droppedBefore[i]
      if (!Number.isSafeInteger(d) || d <= last || d >= from) throw new TypeError('units: `dropped` is not ids rising, each below the chunk\'s `from`')
      last = d
    }
  }
  if (typeof bodies !== 'boolean') throw new TypeError('units: `bodies` is not a boolean')
  // (nothing is sized by the ids before they are known to be a paper's: ids are 0 to UNIT_ID_MAX)
  for (const k of ['from', 'to']) if (ref[k] !== undefined && !isInteger(ref[k], 0, UNIT_ID_MAX)) throw refuse(K, 'ref', `the ref's ${k} is not an id 0 to ${UNIT_ID_MAX}`)
  const { value: v, sha256, values } = await opened(K, bytes, ref, UNITS_DEF, caps)
  envelope(K, v, UNITS_KEYS)
  const paper = paperOf(K, v.paper, 'paper', false)
  if (!isVersionToken(v.pipeline)) throw refuse(K, 'pipeline', `not a version, 1 to 32 letters, digits or points (${kindOf(v.pipeline)})`)
  const ids = v.ids
  if (!Array.isArray(ids) || ids.length !== 2) throw refuse(K, 'ids', `not [from, to] (${kindOf(ids)})`)
  if (!isInteger(ids[0], 0, UNIT_ID_MAX)) throw refuse(K, 'ids[0]', `not an id 0 to ${UNIT_ID_MAX}`)
  if (!isInteger(ids[1], ids[0], UNIT_ID_MAX)) throw refuse(K, 'ids[1]', `not an integer from \`from\` up to ${UNIT_ID_MAX}`)
  if (Array.isArray(ids) && ((ref.from !== undefined && ref.from !== ids[0]) || (ref.to !== undefined && ref.to !== ids[1]))) throw refuse(K, 'ref', `the ref's ids ${ref.from ?? '?'} to ${ref.to ?? '?'} are not the chunk's ${ids[0]} to ${ids[1]}`)
  const want = before === null ? (ref.from ?? 0) : before.to + 1
  if (before === null && droppedBefore !== undefined && ref.from === undefined && droppedBefore.length) throw new TypeError('units: `dropped` needs the ref\'s `from`')
  if (ids[0] !== want) throw refuse(K, 'ids[0]', `not ${want}${before === null ? ', the first unit' : ', the one after the last chunk\'s'}`)
  if (before !== null && (before.paper.id !== paper.id || before.paper.version !== paper.version)) throw refuse(K, 'paper', 'not the paper of the chunk before')
  if (before !== null && before.pipeline !== v.pipeline) throw refuse(K, 'pipeline', 'not the pipeline of the chunk before')
  const from = ids[0], to = ids[1], units = v.units
  if ((ref.from !== undefined && ref.from !== from) || (ref.to !== undefined && ref.to !== to)) throw refuse(K, 'ref', `the ref's ids ${ref.from ?? '?'} to ${ref.to ?? '?'} are not the chunk's ${from} to ${to}`)
  if (!Array.isArray(units)) throw refuse(K, 'units', `not an array (${kindOf(units)})`)
  if (units.length !== to - from + 1) throw refuse(K, 'units', `not the ${to - from + 1} units of ids ${from} to ${to}`)
  const stands = new Uint8Array(to + 1), dropped = []
  if (before !== null) stands.set(before.stands)
  else {
    stands.fill(1, 0, from)
    if (droppedBefore !== undefined) for (const d of droppedBefore) stands[d] = 0
  }
  for (let i = 0; i < units.length; i++) {
    if (unitStands(units[i], from + i, stands, { ink: v.format === INK_UNITS_FORMAT })) stands[from + i] = 1
    else { units[i] = null; dropped.push(from + i) }
  }
  // (a paper with more dropped units than a service forwards is junk: the chain is read as the standalone start would be told it)
  let lost = 0
  for (let i = 0; i <= to; i++) if (stands[i] === 0) lost++
  if (lost > DROPPED_MAX) throw refuse(K, 'dropped', `more than ${DROPPED_MAX} units that do not stand`)
  const out = { kind: 'units', sha256, bytes: bytes.length, values, paper: { id: paper.id, version: paper.version }, pipeline: v.pipeline, from, to, units, dropped, stands }
  if (!bodies) {
    // (bodies-free, amendment M21: what the index keeps of each unit, worked out now, and the bodies let go with the parsed text)
    out.part = partOf(units, from, stands)
    // (the piece count of each unit, for the layout's cross-check against a part: M24)
    out.pieces = Uint32Array.from(units, u => (u === null ? 0 : u[5].length))
    out.units = units.map(u => (u === null ? null : true))
  }
  return out
}

/** a unit as written: its objects (the table cell, the display edges) in the schema's order, whatever order they came in */
function unitText(u) {
  const cell = u[3] === null ? null : Object.fromEntries(CELL.map(k => [k, u[3][k]]))
  let edges = null
  if (u[4] !== null) { edges = {}; for (const k of EDGES) if (Object.hasOwn(u[4], k)) edges[k] = u[4][k] }
  // (an ink unit's echo after its pieces; a bitmap figure's label's place after that: units.mjs unitStands)
  return JSON.stringify(u.length === 8 ? [u[0], u[1], u[2], cell, edges, u[5], u[6], u[7]] : u.length === 7 ? [u[0], u[1], u[2], cell, edges, u[5], u[6]] : [u[0], u[1], u[2], cell, edges, u[5]])
}

/** the flags of a unit's record (amendment M15): the bundle's own unit flags (UNIT_FLAG_BITS: TITLE, FRONT, BRACKETED, KEPT) and
 *  AUTHOR, set where the unit's kind is `author` (rows.mjs toTranslate keeps the KEPT names alone, whatever the target, since
 *  TRANSLATE_VERSION 6; a reader's toggles tell a unit's class by its record's `kind`, rules/content-classes.mjs UNIT_CLASS) */
export const RECORD_FLAG = Object.freeze({ TITLE: 1, FRONT: 2, BRACKETED: 4, KEPT: 8, AUTHOR: 16 })
/** a record's `depth` for a unit that has none (a heading's depth runs from -1, a \part, so -1 cannot be it), and its `kind` for
 *  a kind that is none of UNIT_KINDS, or a unit that does not stand */
export const DEPTH_NONE = -128, KIND_NONE = 255

/**
 * The units' records, once (amendment M15): columns of one entry a unit, its id the index. `kind` the unit's UNIT_KINDS index;
 * `flags` RECORD_FLAG; `depth` a heading's; `plainLength` the plain source text's length (mt.mjs plainSource: what the host's
 * batching estimates from; 0 for no text); `cells` the table cells' place (the fields groupOf reads), `headings` the plain
 * source of the heading units. The units are read as rows.mjs reads them, so that every predicate is the engine's own. A unit
 * that does not stand has KIND_NONE, no flags, DEPTH_NONE and no length
 */
function recordsOf(units, from = 0, standsBefore = null) {
  const n = units.length
  const kind = new Uint8Array(n).fill(KIND_NONE), flags = new Uint8Array(n), depth = new Int8Array(n).fill(DEPTH_NONE), plainLength = new Uint32Array(n)
  const cells = new Map(), headings = new Map()
  // (a chunk alone: all a nested piece asks of an earlier unit is that it stands, so the units are worked on with the earlier ids
  // they name alone, as stand-ins that stand where the chunks before say, and the ids made local: nothing is sized by `from`)
  const { list, at } = from === 0 ? { list: units, at: 0 } : localUnits(units, from, standsBefore)
  const source = sourceUnitsOf({ units: list })
  for (let i = 0; i < n; i++) {
    const b = units[i]
    if (b === null) continue
    const k = UNIT_KINDS.indexOf(b[0])
    if (k >= 0) kind[i] = k
    flags[i] = b[1] | (b[0] === 'author' ? RECORD_FLAG.AUTHOR : 0)
    if (b[2] !== null) depth[i] = b[2]
    const u = source[at + i]
    if (!u) continue
    const plain = plainSource(u)
    plainLength[i] = plain.length
    if (u.cell) cells.set(from + i, u.cell)
    if (b[0] === 'heading') headings.set(from + i, plain)
  }
  return { kind, flags, depth, plainLength, cells, headings }
}

/**
 * The table groups of a paper (amendment M18): the consistency group of each unit that is a cell, by the engine's own
 * groups.mjs groupOf over the cells the records hold. `of[id]` is the unit's group number (-1: none), numbered by first
 * member; `count` the groups; `members[g]` the ids of group g, rising. A pure function of the cells, so the cut and the
 * reader agree
 */
export function groupsOfCells(cells, n) {
  const of = new Int32Array(n).fill(-1), number = new Map(), members = []
  for (const [id, cell] of cells) {
    const key = groupOf({ cell })
    if (key === null) continue
    let g = number.get(key)
    if (g === undefined) { g = members.length; number.set(key, g); members.push([]) }
    of[id] = g
    members[g].push(id)
  }
  return { of, count: members.length, members }
}
/** the groups of units as bundleUnitsOf gives them (the cut's input) */
export const groupsOfUnits = units => groupsOfCells(recordsOf(units).cells, units.length)
const groupsOfIndex = new WeakMap()
function indexGroups(index) {
  let g = groupsOfIndex.get(index)
  if (g === undefined) groupsOfIndex.set(index, g = groupsOfCells(index.records.cells, index.units.length))
  return g
}

const STANDS = Object.freeze(['para', 0, null, null, null, []])
/**
 * A chunk's units with the earlier ids they name made local (rows.mjs reads a nested piece as the unit of that index, and asks
 * it to be there): a slot for a unit that does not stand, one stand-in for each earlier unit that stands and is named, then the
 * chunk's own units, their nested pieces renumbered. Returns the list and where the chunk's first unit is in it
 */
function localUnits(units, from, standsBefore) {
  const named = new Map()
  for (const u of units) {
    if (u === null) continue
    for (const p of u[5]) if (p[0] === 4 && p[2] < from && standsBefore[p[2]] === 1 && !named.has(p[2])) named.set(p[2], 0)
  }
  const ids = [...named.keys()].sort((a, b) => a - b)
  ids.forEach((id, k) => named.set(id, k + 1))
  const at = ids.length + 1
  const list = [null, ...ids.map(() => STANDS), ...units.map(u => {
    if (u === null || !u[5].some(p => p[0] === 4)) return u
    return [u[0], u[1], u[2], u[3], u[4], u[5].map(p => (p[0] === 4 ? [4, p[1], p[2] < from ? (named.get(p[2]) ?? 0) : p[2] - from + at, p[3]] : p))]
  })]
  return { list, at }
}
/** what a chunk read without bodies keeps (amendment M21): each unit's kind, its records, and the earlier units its nested pieces name */
function partOf(units, from, stands) {
  const kinds = units.map(u => (u === null ? null : u[0]))
  const external = new Set()
  for (const u of units) {
    if (u === null) continue
    for (const p of u[5]) if (p[0] === 4 && p[2] < from) external.add(p[2])
  }
  return { kinds, records: recordsOf(units, from, stands), external: [...external].sort((a, b) => a - b) }
}

/** the units' total past its bound (amendment M2): `units-too-large`, the bound and the size as data */
const tooLarge = (what, bound, size) => new BundleRefusal('units-too-large', { kind: 'units', path: '', data: { what, bound, size } })

/**
 * The paper's units (bundleUnitsOf's) as chunks, greedy by unit id: a chunk takes the next unit while its bytes and its values
 * stay within UNITS_CAP and UNITS_VALUES, else the unit opens the next chunk. Throws BundleRefusal (`kind` 'units') naming the
 * unit that is past either alone (and its `id`), or `units-too-large` (its `data` { what, bound, size }) where the chunks are
 * more than CHUNKS_MAX, or their bytes or values in all past UNITS_TOTAL_BYTES or UNITS_TOTAL_VALUES. Each chunk gives its
 * `values`, as the reader counts them
 */
export async function writeUnitChunks({ paper, units, start = 0, before = null, ink = start > 0 }) {
  const K = 'units'
  // (`before`: the chunks written before these, chunkTotals', so that the bounds are of all the chunks a head lists)
  const b0 = before ?? { chunks: 0, bytes: 0, values: 0 }
  const p = { id: paper.id, version: paper.version }
  if (!isPaperId(p.id) || !isInteger(p.version, 1, VERSION_MAX)) throw new RangeError('not a paper version')
  // (the ink units' chunks from `start`, after the source units', of INK_UNITS_FORMAT; every other one of UNITS_FORMAT, as before;
  // `ink` a chunk of ink units whatever its first id: the bitmap figures' labels of a paper of no source unit)
  if (!isInteger(start, 0, UNIT_ID_MAX)) throw new RangeError('start: not an id')
  const format = ink ? INK_UNITS_FORMAT : UNITS_FORMAT
  const head = (from, to) => `{"format":"${format}","kind":"units","paper":${JSON.stringify(p)},"pipeline":${JSON.stringify(PIPELINE_VERSION)},"ids":[${start + from},${start + to}],"units":[`
  // (the envelope's values do not depend on the digits of `ids`; its bytes do)
  const envelopeBytes = (from, to) => encoder.encode(head(from, to)).length + 2
  const envelopeValues = countValues(`${head(0, 0)}]}`)
  const texts = [], out = [], stands = new Uint8Array(start + units.length).fill(1, 0, start)
  let from = 0, bytes = 0, values = 0, totalBytes = 0, totalValues = 0
  const close = async to => {
    out.push(await finish(K, `${head(from, to)}${texts.slice(from, to + 1).join(',')}]}`, UNITS_DEF, p, { from: start + from, to: start + to }))
    const c = out[out.length - 1]
    totalBytes += c.bytes.length
    totalValues += c.values
    if (b0.chunks + out.length > CHUNKS_MAX) throw tooLarge('chunks', CHUNKS_MAX, b0.chunks + out.length)
    if (b0.bytes + totalBytes > UNITS_TOTAL_BYTES) throw tooLarge('bytes', UNITS_TOTAL_BYTES, b0.bytes + totalBytes)
    if (b0.values + totalValues > UNITS_TOTAL_VALUES) throw tooLarge('values', UNITS_TOTAL_VALUES, b0.values + totalValues)
  }
  for (let i = 0; i < units.length; i++) {
    if (!unitStands(units[i], start + i, stands, { ink })) throw Object.assign(refuse(K, '', `unit ${start + i}: does not stand (a shape the reader would drop, or a nested unit that does not stand)`), { id: start + i })
    stands[start + i] = 1
    const text = unitText(units[i])
    const size = encoder.encode(text).length, count = inside(K, '', () => countValues(text, UNITS_VALUES, UNITS_DEPTH - 2))
    texts.push(text)
    const fits = () => envelopeBytes(from, i) + bytes + (i > from ? 1 : 0) + size <= UNITS_CAP && envelopeValues + values + count <= UNITS_VALUES
    if (i > from && !fits()) { await close(i - 1); from = i; bytes = 0; values = 0 }
    if (!fits()) {
      const b = envelopeBytes(i, i) + size, v = envelopeValues + count
      throw Object.assign(refuse(K, '', `unit ${i}: ${b} bytes and ${v} values alone, past a chunk's ${UNITS_CAP} / ${UNITS_VALUES}`), { id: i })
    }
    bytes += (i > from ? 1 : 0) + size
    values += count
  }
  if (units.length) await close(units.length - 1)
  return out
}
/** written chunks' count, bytes and values, as writeUnitChunks' `before` takes them */
export const chunkTotals = chunks => ({ chunks: chunks.length, bytes: chunks.reduce((n, c) => n + c.bytes.length, 0), values: chunks.reduce((n, c) => n + c.values, 0) })

/**
 * The units of chunks read in order, head-less (amendment M3; the head's indexOf takes the same): each chunk after the one
 * before it (its `from` the last `to` + 1, the first 0), of one paper and one pipeline, read as one chain (each chunk's
 * `stands` begins as the one before's); no more than CHUNKS_MAX chunks, and their bytes and values in all within UNITS_TOTAL_BYTES and UNITS_TOTAL_VALUES.
 * Gives every unit (null where dropped), its kind (null likewise) and the ids dropped, their `records` (M15), and the windowed access amendment M3'
 * asks for: `index`, each chunk's { from, to }; `chunkOf(id)`, the chunk holding a unit; `externalRefs(k)`, the ids below chunk
 * k's `from` that its nested pieces name (rising), so that a reader holding one chunk at a time knows which earlier units it
 * needs. Throws BundleRefusal
 */
export function unitsOfChunks(chunks, { bodies = true } = {}) {
  const K = 'index'
  if (typeof bodies !== 'boolean') throw new TypeError('units: `bodies` is not a boolean')
  if (chunks.length > CHUNKS_MAX) throw refuse(K, 'units', `more than ${CHUNKS_MAX} chunks (${chunks.length})`)
  const units = [], kinds = [], dropped = []
  let before = null, total = 0, totalBytes = 0
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i], path = `units[${i}]`
    if (c.from !== (before === null ? 0 : before.to + 1)) throw refuse(K, path, 'not the units after the last chunk\'s')
    if (before !== null && (c.paper.id !== before.paper.id || c.paper.version !== before.paper.version)) throw refuse(K, path, 'not the paper of the chunk before')
    if (before !== null && c.pipeline !== before.pipeline) throw refuse(K, path, 'not the pipeline of the chunk before')
    if (before !== null) for (let q = 0; q < before.stands.length; q++) if (c.stands[q] !== before.stands[q]) throw refuse(K, path, 'not read after the chunk before it (its nested units)')
    totalBytes += c.bytes
    if (totalBytes > UNITS_TOTAL_BYTES) throw tooLarge('bytes', UNITS_TOTAL_BYTES, totalBytes)
    total += c.values
    if (total > UNITS_TOTAL_VALUES) throw tooLarge('values', UNITS_TOTAL_VALUES, total)
    if (bodies && c.part !== undefined) throw new TypeError('units: the chunks were read without bodies')
    if (c.part !== undefined) for (let q = 0; q < c.units.length; q++) { units.push(c.units[q]); kinds.push(c.part.kinds[q]) }
    else for (let q = 0; q < c.units.length; q++) { units.push(c.units[q]); kinds.push(c.units[q] === null ? null : c.units[q][0]) }
    for (let q = 0; q < c.dropped.length; q++) dropped.push(c.dropped[q])
    if (dropped.length > DROPPED_MAX) throw refuse(K, 'dropped', `more than ${DROPPED_MAX} units that do not stand`)
    before = c
  }
  const index = chunks.map(c => ({ from: c.from, to: c.to }))
  // (windowed access, amendment M3': which chunk holds a unit, and which earlier units a chunk's nested pieces name)
  const chunkOf = id => {
    if (!Number.isInteger(id) || id < 0 || id >= units.length) throw new RangeError('not a unit of the chunks')
    let lo = 0, hi = index.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (index[mid].from <= id) lo = mid; else hi = mid - 1 }
    return lo
  }
  const externalRefs = k => {
    if (!Number.isInteger(k) || k < 0 || k >= chunks.length) throw new RangeError('not a chunk')
    const out = new Set(), from = chunks[k].from
    if (chunks[k].part !== undefined) return [...chunks[k].part.external]
    for (const u of chunks[k].units) {
      if (u === null) continue
      for (const p of u[5]) if (p[0] === 4 && p[2] < from) out.add(p[2])
    }
    return [...out].sort((a, b) => a - b)
  }
  if (!bodies) {
    // (bodies-free: every unit a stands flag, the records the chunks' own joined; a chunk that has its bodies is worked out the same way)
    const parts = chunks.map(c => c.part ?? partOf(c.units, c.from, c.stands))
    const n = units.length
    const records = { kind: new Uint8Array(n), flags: new Uint8Array(n), depth: new Int8Array(n), plainLength: new Uint32Array(n), cells: new Map(), headings: new Map() }
    chunks.forEach((c, i) => {
      const r = parts[i].records
      records.kind.set(r.kind, c.from); records.flags.set(r.flags, c.from); records.depth.set(r.depth, c.from); records.plainLength.set(r.plainLength, c.from)
      for (const [id, cell] of r.cells) records.cells.set(id, cell)
      for (const [id, h] of r.headings) records.headings.set(id, h)
    })
    const pieces = new Uint32Array(n)
    chunks.forEach(c => pieces.set(c.pieces ?? Uint32Array.from(c.units, u => (u === null ? 0 : u[5].length)), c.from))
    return { units: units.map(u => (u === null ? null : true)), kinds, dropped, index, chunkOf, externalRefs, records, pieces }
  }
  return { units, kinds, dropped, index, chunkOf, externalRefs, records: recordsOf(units) }
}

/**
 * The ids that did not stand in chunks read in order, rising: the `dropped` a service forwards with its units announcement, so
 * that a consumer reads chunk k alone (readUnitsChunk's `dropped`, the ids below its `from`). Amendment M19
 */
export function droppedOf(chunks) {
  const out = []
  for (const c of chunks) for (const d of c.dropped) out.push(d)
  return out
}

// ---------------------------------------------------------------- the head
const HEAD_KEYS = ['bundle', 'kind', 'paper', 'base', 'versions', 'units', 'lineskip']
/** the head's optional keys: `draw` (BUNDLE 5) 1 says the parts MAY carry the draw of their pages' left parts (a page can still
 *  have none); absent (0 is read too, never written) for a paper made without them. `orig` (BUNDLE 8): arXiv's PDF, where the
 *  base is ours */
const HEAD_OPTIONAL = ['draw', 'orig']
const HEAD_DEF = { cap: HEAD_CAP, values: HEAD_VALUES, depth: HEAD_DEPTH }
/** a base's keys, in the wire's order: 7's (arXiv's PDF); 8's of ours (the final pass of our marked compile, with the
 *  page-and-line check it passed) and of arXiv's (`why` our compile is no base page, a BASE_WHYS code: absent for a bundle drawn
 *  over arXiv's PDF by a producer that made no base of its own, read as 7's) */
const BASE_7 = ['bytes', 'sha256', 'xref']
const BASE_OURS = ['source', 'bytes', 'sha256', 'xref', 'pages', 'tree', 'check']
/** a base of ours held as a delta over arXiv's PDF: `bytes`, `sha256` the delta section's, `xref` its startxref in the composed
 *  document (arXiv's bytes first), `replaced` the pages it writes again, `stats` what it reused of the original and wrote */
const BASE_DELTA = ['source', 'kind', 'bytes', 'sha256', 'xref', 'pages', 'tree', 'check', 'replaced', 'stats']
const DELTA_STATS = ['replaced', 'reused', 'included'], DELTA_REUSED = ['fonts', 'images', 'forms', 'other'], DELTA_INCLUDED = ['bytes', 'objects']
/** a base of ours whose pages are wrapped by optional content (layout/wrap.mjs): its wrap's counts in `stats` (a delta's beside
 *  its own), the units whose ink stays the original's and why (`unhidden`), those whose label is left the original's ink
 *  (`labelKept`): every unit with a group of its own (`axt:u<id>`) and in neither list is the reader's to hide where it draws it */
const WRAP_KEYS = ['stats', 'unhidden', 'labelKept']
/** a wrap's head fields checked (delta-wire.mjs wrapWhy) and as a reader takes them */
function wrapOf(K, stats, b) {
  const why = wrapWhy(stats, b.unhidden, b.labelKept)
  // (wrapWhy says `<path>: <why>`)
  if (why !== null) { const at = why.indexOf(': '); throw refuse(K, `base.${why.slice(0, at)}`, why.slice(at + 2)) }
  return { stats: { ...Object.fromEntries(WRAP_STATS.map(k => [k, k === 'unhidden' ? { ...stats.unhidden } : stats[k]])) }, unhidden: b.unhidden.map(r => [r[0], r[1]]), labelKept: [...b.labelKept] }
}
const BASE_ARXIV = ['source', 'bytes', 'sha256', 'xref']
/** a base of ours' content-class ledger (layout/ledger.mjs ledgerSummary, docs/route/orphan-text.md §8), an optional key, flat:
 *  `classes` [class, glyphs, letters, …] each class once, `letters`, `orphanLetters`, `orphans` [page, letters, text, …] at most
 *  HEAD_ORPHANS, each text at most HEAD_TEXT code units of no control character */
const LEDGER_KEYS = ['classes', 'letters', 'orphanLetters', 'orphans']
const HEAD_ORPHANS = 64, HEAD_TEXT = 120
function ledgerOf(K, l, N) {
  const o = exactKeys(K, l, LEDGER_KEYS, 'base.ledger')
  if (!Array.isArray(o.classes) || o.classes.length % 3 !== 0 || o.classes.length > 3 * CLASS_IDS.length) throw refuse(K, 'base.ledger.classes', `not [class, glyphs, letters, …] (${kindOf(o.classes)})`)
  const classes = [], seen = new Set()
  for (let j = 0; j < o.classes.length; j += 3) {
    const c = o.classes[j], g = o.classes[j + 1], l = o.classes[j + 2]
    if (typeof c !== 'string' || !CLASS_IDS.includes(c) || seen.has(c)) throw refuse(K, `base.ledger.classes[${j}]`, 'not a class, each once')
    // (letters apart from glyphs: a ligature's glyph is its letters, NFKC's, ledger.mjs lettersOf)
    if (!isInteger(g, 0, Number.MAX_SAFE_INTEGER) || !isInteger(l, 0, Number.MAX_SAFE_INTEGER)) throw refuse(K, `base.ledger.classes[${j + 1}]`, 'not glyphs and letters, integers')
    seen.add(c)
    classes.push(c, g, l)
  }
  count(K, o.letters, 'base.ledger.letters')
  if (count(K, o.orphanLetters, 'base.ledger.orphanLetters') > o.letters) throw refuse(K, 'base.ledger.orphanLetters', 'more than the letters')
  if (!Array.isArray(o.orphans) || o.orphans.length % 3 !== 0 || o.orphans.length > 3 * HEAD_ORPHANS) throw refuse(K, 'base.ledger.orphans', `not [page, letters, text, …] of at most ${HEAD_ORPHANS}`)
  const orphans = []
  for (let j = 0; j < o.orphans.length; j += 3) {
    const page = o.orphans[j], letters = o.orphans[j + 1], text = o.orphans[j + 2]
    if (!isInteger(page, 1, N) || !isInteger(letters, 0, Number.MAX_SAFE_INTEGER) || typeof text !== 'string' || text.length > HEAD_TEXT || /\p{Cc}/u.test(text)) throw refuse(K, `base.ledger.orphans[${j}]`, `not a page 1 to ${N}, letters and a text of at most ${HEAD_TEXT} code units`)
    orphans.push(page, letters, text)
  }
  return { classes, letters: o.letters, orphanLetters: o.orphanLetters, orphans }
}
const CHECK_KEYS = ['pages', 'boxes', 'carried']
/** the TeX Live year our base was compiled on, as the compile's banner names it */
const TREE = /^\d{4}$/
/** a share as a head holds it: to a ten-thousandth */
const r4 = v => Math.round(v * 10_000) / 10_000

/** a PDF's bytes, digest and, `withXref`, its last cross-reference section's offset, checked at `path` */
function pdfRef(K, b, path, withXref) {
  if (!isInteger(b.bytes, 1, BASE_MAX)) throw refuse(K, sub(path, 'bytes'), `not an integer 1 to ${BASE_MAX}`)
  digestField(K, b.sha256, sub(path, 'sha256'))
  if (withXref && !isInteger(b.xref, 0, b.bytes - 1)) throw refuse(K, sub(path, 'xref'), `not an offset in the ${b.bytes} bytes`)
}

/**
 * The head's base, checked and as a reader takes it ({ source, bytes, sha256, xref } and, of ours, { pages, tree, check }, of
 * arXiv's, `why` where it says one): in a head of 7, arXiv's PDF, 7's three keys; in one of 8, `source` first. A base of ours
 * passed the page-and-line check: its pages are the paper's, its check says arXiv's PDF has as many, of the same boxes
 * ('equal'), and the share of our lines found on arXiv's (`carried`, 0 to 1). `orig`, arXiv's PDF { bytes, sha256 }, is there
 * exactly where the base is ours
 */
function baseShape(K, v, bundle, N) {
  if (bundle === '7') {
    const b = exactKeys(K, v.base, BASE_7, 'base')
    pdfRef(K, b, 'base', true)
    if (Object.hasOwn(v, 'orig')) throw refuse(K, 'orig', 'not a key of a head of 7')
    return { base: { source: 'arxiv', bytes: b.bytes, sha256: b.sha256, xref: b.xref }, orig: null }
  }
  const s = isObject(v.base) ? v.base.source : undefined
  if (!BASE_SOURCES.includes(s)) throw refuse(K, 'base.source', `not one of ${BASE_SOURCES.join(', ')} (${typeof s === 'string' ? told(s) : kindOf(s)})`)
  if (s === 'arxiv') {
    const b = exactKeys(K, v.base, Object.hasOwn(v.base, 'why') ? [...BASE_ARXIV, 'why'] : BASE_ARXIV, 'base')
    pdfRef(K, b, 'base', true)
    if (Object.hasOwn(b, 'why') && !BASE_WHYS.includes(b.why)) throw refuse(K, 'base.why', `not one of ${BASE_WHYS.join(', ')} (${typeof b.why === 'string' ? told(b.why) : kindOf(b.why)})`)
    if (Object.hasOwn(v, 'orig')) throw refuse(K, 'orig', 'there, where the base is arXiv\'s PDF')
    return { base: { source: 'arxiv', bytes: b.bytes, sha256: b.sha256, xref: b.xref, ...(Object.hasOwn(b, 'why') ? { why: b.why } : {}) }, orig: null }
  }
  const kind = Object.hasOwn(v.base, 'kind') ? v.base.kind : 'full'
  if (!BASE_KINDS.includes(kind)) throw refuse(K, 'base.kind', `not one of ${BASE_KINDS.join(', ')} (${typeof kind === 'string' ? told(kind) : kindOf(kind)})`)
  if (kind === 'delta') return deltaShape(K, v, N)
  const wrapped = Object.hasOwn(v.base, 'stats') || Object.hasOwn(v.base, 'unhidden') || Object.hasOwn(v.base, 'labelKept')
  const b = exactKeys(K, v.base, [...BASE_OURS, ...(Object.hasOwn(v.base, 'kind') ? ['kind'] : []), ...(wrapped ? WRAP_KEYS : []), ...(Object.hasOwn(v.base, 'ledger') ? ['ledger'] : [])], 'base')
  pdfRef(K, b, 'base', true)
  const check = oursCommon(K, b, N, false)
  const o = origOf(K, v)
  const wrap = wrapped ? wrapOf(K, b.stats, b) : null
  const ledger = Object.hasOwn(b, 'ledger') ? ledgerOf(K, b.ledger, N) : null
  return { base: { source: 'ours', bytes: b.bytes, sha256: b.sha256, xref: b.xref, pages: b.pages, tree: b.tree, check, ...(wrap ? { stats: wrap.stats, unhidden: wrap.unhidden, labelKept: wrap.labelKept } : {}), ...(ledger ? { ledger } : {}) }, orig: o }
}

/** arXiv's PDF beside a base of ours (`orig`), required there; of a delta's, with its startxref (`xref`: the section the
 *  delta's /Prev names, which a holder of the delta checks with no read of the original: checkDelta) */
function origOf(K, v, withXref = false) {
  if (!Object.hasOwn(v, 'orig')) throw refuse(K, 'orig', 'missing, where the base is ours')
  const o = exactKeys(K, v.orig, withXref ? ['bytes', 'sha256', 'xref'] : ['bytes', 'sha256'], 'orig')
  pdfRef(K, o, 'orig', withXref)
  return withXref ? { bytes: o.bytes, sha256: o.sha256, xref: o.xref } : { bytes: o.bytes, sha256: o.sha256 }
}

/** a base of ours' pages, year and check: its pages the paper's, the check's our pages and arXiv's ([N, N]; a delta's [M, N],
 *  our M pages 1 to N: a paper of several toplevel sources whose first is compiled alone, the pages past ours arXiv's by
 *  construction), arXiv's boxes ('equal') and the share of our lines in place */
function oursCommon(K, b, N, delta) {
  if (b.pages !== N) throw refuse(K, 'base.pages', `not the paper's ${N} pages (${kindOf(b.pages)})`)
  if (typeof b.tree !== 'string' || !TREE.test(b.tree)) throw refuse(K, 'base.tree', `not a TeX Live year (${kindOf(b.tree)})`)
  const c = exactKeys(K, b.check, CHECK_KEYS, 'base.check')
  const ok = Array.isArray(c.pages) && c.pages.length === 2 && c.pages[1] === N && (delta ? isInteger(c.pages[0], 1, N) : c.pages[0] === N)
  if (!ok) throw refuse(K, 'base.check.pages', delta ? `not [M, ${N}], M 1 to ${N}: our pages and arXiv's` : `not [${N}, ${N}]: our pages and arXiv's, the paper's`)
  if (c.boxes !== 'equal') throw refuse(K, 'base.check.boxes', `not 'equal' (${typeof c.boxes === 'string' ? told(c.boxes) : kindOf(c.boxes)}): a base of ours has arXiv's page boxes`)
  if (!isNumber(c.carried) || c.carried < 0 || c.carried > 1) throw refuse(K, 'base.check.carried', `not a share 0 to 1 (${kindOf(c.carried)})`)
  return { pages: [c.pages[0], c.pages[1]], boxes: c.boxes, carried: c.carried }
}

/** a non-negative safe integer at `path` */
function count(K, v, path) {
  if (!isInteger(v, 0, Number.MAX_SAFE_INTEGER)) throw refuse(K, path, `not an integer 0 or more (${kindOf(v)})`)
  return v
}

/** a base of ours held as a delta over arXiv's PDF (BASE_DELTA): `orig` required and the original it extends (its section
 *  after arXiv's bytes: `xref` within the delta, read in the composed document's offsets); no `over` (orig says it) */
function deltaShape(K, v, N) {
  const wrapped = Object.hasOwn(v.base, 'unhidden') || Object.hasOwn(v.base, 'labelKept')
  const b = exactKeys(K, v.base, [...(wrapped ? [...BASE_DELTA, 'unhidden', 'labelKept'] : BASE_DELTA), ...(Object.hasOwn(v.base, 'ledger') ? ['ledger'] : [])], 'base')
  if (b.kind !== 'delta') throw refuse(K, 'base.kind', `not 'delta' (${typeof b.kind === 'string' ? told(b.kind) : kindOf(b.kind)})`)
  const o = origOf(K, v, true)
  if (!isInteger(b.bytes, 1, DELTA_MAX_BYTES)) throw refuse(K, 'base.bytes', `not an integer 1 to ${DELTA_MAX_BYTES}`)
  digestField(K, b.sha256, 'base.sha256')
  if (!isInteger(b.xref, o.bytes + 1, o.bytes + b.bytes - 1)) throw refuse(K, 'base.xref', `not an offset in the delta after arXiv's ${o.bytes} bytes`)
  const check = oursCommon(K, b, N, true)
  const why = replacedWhy(b.replaced, check.pages[0])
  if (why !== null) throw refuse(K, 'base.replaced', `${why}: ascending, merged page ranges within our ${check.pages[0]} pages`)
  const st = exactKeys(K, b.stats, wrapped ? [...DELTA_STATS, ...WRAP_STATS] : DELTA_STATS, 'base.stats')
  const wrap = wrapped ? wrapOf(K, Object.fromEntries(WRAP_STATS.map(k => [k, st[k]])), b) : null
  const reused = exactKeys(K, st.reused, DELTA_REUSED, 'base.stats.reused'), included = exactKeys(K, st.included, DELTA_INCLUDED, 'base.stats.included')
  for (const k of DELTA_REUSED) count(K, reused[k], `base.stats.reused.${k}`)
  for (const k of DELTA_INCLUDED) count(K, included[k], `base.stats.included.${k}`)
  if (count(K, st.replaced, 'base.stats.replaced') !== countOf(b.replaced)) throw refuse(K, 'base.stats.replaced', 'not the pages `replaced` names')
  if (included.bytes > b.bytes) throw refuse(K, 'base.stats.included.bytes', 'more than the delta\'s bytes')
  if (included.objects < st.replaced) throw refuse(K, 'base.stats.included.objects', 'fewer than the pages it replaces')
  return {
    base: { source: 'ours', kind: 'delta', bytes: b.bytes, sha256: b.sha256, xref: b.xref, pages: b.pages, tree: b.tree, check, replaced: b.replaced.map(r => [r[0], r[1]]), stats: { replaced: st.replaced, reused: Object.fromEntries(DELTA_REUSED.map(k => [k, reused[k]])), included: { bytes: included.bytes, objects: included.objects }, ...(wrap ? wrap.stats : {}) }, ...(wrap ? { unhidden: wrap.unhidden, labelKept: wrap.labelKept } : {}), ...(Object.hasOwn(b, 'ledger') ? { ledger: ledgerOf(K, b.ledger, N) } : {}) },
    orig: o,
  }
}

/**
 * Why a delta base of ours (BASE_DELTA's fields: `base`, with `kind` 'delta') would not be read in a head of `N` pages over
 * `orig` { bytes, sha256 } arXiv's PDF (the head's reader's refusal, its path and why), null where it would: the page pass's
 * test of a delta its host gave, before it names it (a delta that fails is a whole base, never a refused paper)
 */
export function deltaBaseWhy(base, orig, N) {
  try { deltaShape('head', { base, orig }, N); return null } catch (e) {
    if (e instanceof BundleRefusal) return e.message
    throw e
  }
}

/**
 * Whether `bytes` are the delta a head of `kind` 'delta' names (readHead's): its length and digest the base's, its section exact
 * over the original the head names (delta-wire.mjs deltaSection: every entry at its object, /Prev `orig.xref`) and its startxref
 * the base's `xref`. What the Worker checks before it commits the delta and a reader before it composes it: null, or why not
 */
export async function checkDelta(head, bytes) {
  const b = head?.base, o = head?.orig
  if (b?.kind !== 'delta' || !Number.isInteger(o?.xref)) return 'not a head whose base is a delta'
  if (!(bytes instanceof Uint8Array) || bytes.length !== b.bytes) return `not the ${b.bytes} bytes the head names`
  if ((await digestOf(bytes)) !== b.sha256) return 'not the bytes the head\'s digest names'
  const sect = deltaSection(bytes, { bytes: o.bytes, xref: o.xref })
  if (sect.why) return `its section: ${sect.why}`
  if (sect.startxref !== b.xref) return 'its startxref is not the head\'s'
  return null
}

/** the head's fields, checked: what a reader and a writer share */
function headShape(v) {
  const K = 'head'
  const paper = paperOf(K, v.paper, 'paper', true)
  const { base, orig } = baseShape(K, v, v.bundle, paper.pages)
  const versions = versionsOf(K, v.versions, 'versions', v.bundle)
  rangesOf(K, v.units, 'units', { refKind: 'units', lo: 0, hi: CHUNKS_MAX, first: 0, last: ID_MAX, max: UNITS_CAP })
  let total = 0
  for (const r of v.units) total += r.bytes
  if (total > UNITS_TOTAL_BYTES) throw tooLarge('bytes', UNITS_TOTAL_BYTES, total)
  inside(K, '', () => checkLineskip(v.lineskip, 'lineskip'))
  if ('draw' in v && v.draw !== 0 && v.draw !== 1) throw refuse(K, 'draw', `not 0 or 1, but ${kindOf(v.draw)}`)
  return { paper, base, orig, versions, units: v.units, lineskip: v.lineskip, draw: v.draw === 1 ? 1 : 0 }
}

/**
 * The head as received: within its caps and its ref, the envelope (BUNDLES_READ) and shape. `bundle` its format; `paper.pages`
 * the paper's page count; `base` the PDF the layer is drawn over (baseShape: `source` 'ours' or 'arxiv', a head of 7's
 * 'arxiv'; its bytes and digest, and the `startxref` the remover's tails continue; of ours, its pages, TeX Live year and check;
 * of arXiv's in 8, why ours was refused where it says), `orig` arXiv's PDF where the base is ours, else null; the versions
 * (the PDF.js this reader's, the rest read as tokens); the units chunks it names, 1 to CHUNKS_MAX of at most
 * UNITS_TOTAL_BYTES in all, contiguous from unit 0, by digest; the probe's `lineskip`, null or within its bounds. Throws
 * BundleRefusal
 */
export async function readHead(bytes, { ref, caps }) {
  const { value: v, sha256 } = await opened('head', bytes, ref, HEAD_DEF, caps)
  envelope('head', v, HEAD_KEYS, HEAD_OPTIONAL)
  const h = headShape(v)
  return { kind: 'head', bundle: v.bundle, sha256, bytes: bytes.length, paper: h.paper, base: h.base, orig: h.orig, versions: h.versions, units: h.units, lineskip: h.lineskip, draw: h.draw }
}

/** a base as the head writes it: of ours, with its pages, year and check (the share to a ten-thousandth); of arXiv's, `why` where
 *  given (a base given with no `source` is arXiv's, as every base was before BUNDLE 8); a delta with its kind, replaced pages
 *  and counts, a whole one of ours with no `kind` (read as `full`) */
const checkWire = c => ({ pages: [c?.pages?.[0], c?.pages?.[1]], boxes: c?.boxes, carried: isNumber(c?.carried) ? r4(c.carried) : c?.carried })
const baseWire = b => (b.source === 'ours'
  ? b.kind === 'delta'
    ? { source: 'ours', kind: 'delta', bytes: b.bytes, sha256: b.sha256, xref: b.xref, pages: b.pages, tree: b.tree, check: checkWire(b.check), replaced: b.replaced, stats: b.stats, ...(b.unhidden ? { unhidden: b.unhidden, labelKept: b.labelKept } : {}), ...(b.ledger ? { ledger: b.ledger } : {}) }
    : { source: 'ours', bytes: b.bytes, sha256: b.sha256, xref: b.xref, pages: b.pages, tree: b.tree, check: checkWire(b.check), ...(b.unhidden ? { stats: b.stats, unhidden: b.unhidden, labelKept: b.labelKept } : {}), ...(b.ledger ? { ledger: b.ledger } : {}) }
  : { source: 'arxiv', bytes: b.bytes, sha256: b.sha256, xref: b.xref, ...(b.why === undefined || b.why === null ? {} : { why: b.why }) })

/** the head written: the paper, the base (baseShape's: ours with `orig`, arXiv's PDF; or arXiv's), the versions this engine
 *  writes (with the compiler image's name) and the chunks `writeUnitChunks` gave, in order */
export async function writeHead({ paper, base, orig = null, image, units, lineskip, draw = false }) {
  const obj = {
    bundle: BUNDLE5, kind: 'head',
    paper: { id: paper.id, version: paper.version, pages: paper.pages },
    base: baseWire(base),
    ...(base.source === 'ours' && orig ? { orig: base.kind === 'delta' ? { bytes: orig.bytes, sha256: orig.sha256, xref: orig.xref } : { bytes: orig.bytes, sha256: orig.sha256 } } : {}),
    versions: { pipeline: PIPELINE_VERSION, layout: LAYOUT, removal: REMOVAL, pdfjs: PDFJS, image, ocr: OCR },
    units: units.map(u => ({ kind: 'units', from: u.from, to: u.to, sha256: u.sha256, bytes: u.bytes.length })),
    lineskip: lineskip === null ? null : lineskip.map(r2),
    ...(draw ? { draw: 1 } : {}),
  }
  headShape(obj)
  return written('head', obj, HEAD_DEF, paper, {})
}

// ---------------------------------------------------------------- the index
/** the late chunks a layer may hold past its head's (PDF-READER §19.15): the bitmap figures' labels, the maker's one announcement
 *  after its parts (pipeline/ocr-pass.mjs), each chunk of them */
export const LATE_MAX = 4
/** a late chunk read (readUnitsChunk's) against the head and the units before it: of the head's paper and pipeline, its units
 *  bitmap figures' labels alone (kind `inkocr`, or dropped), so that nothing a part locates or a page awaits comes late */
function lateChecked(K, head, c, path) {
  if (c.paper.id !== head.paper.id || c.paper.version !== head.paper.version) throw refuse(K, path, 'not the head\'s paper')
  if (c.pipeline !== head.versions.pipeline) throw refuse(K, path, 'not the head\'s pipeline')
  const kinds = c.part?.kinds ?? c.units.map(u => (u === null ? null : u[0]))
  if (kinds.some(k => k !== null && k !== OCR_KIND)) throw refuse(K, path, `a late chunk holds a unit of a kind not ${OCR_KIND}`)
}

/**
 * The head and its chunks bound (sync): the chunks as many as the head names, each one's range, digest and bytes the head's
 * ref, in order, of the head's paper and pipeline, read as one chain (unitsOfChunks), followed by LATE_MAX late chunks at most
 * (the bitmap figures' labels, which the head cannot name: lateChecked); with `catalog`, the catalog's head, units (the late
 * chunks among them), paper and versions the head's. Gives the index the parts are read against: every unit (null where
 * dropped), its kind, the ids dropped, and `late`, the late chunks' refs. Throws BundleRefusal
 */
export function indexOf(head, chunks, o = {}) {
  const K = 'index'
  if (head.units.length > CHUNKS_MAX) throw refuse(K, 'units', `more than ${CHUNKS_MAX} chunks`)
  if (chunks.length < head.units.length || chunks.length > head.units.length + LATE_MAX) throw refuse(K, 'units', `${chunks.length} chunks, not the head's ${head.units.length} and ${LATE_MAX} late ones at most`)
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i], r = head.units[i], path = `units[${i}]`
    if (!r) { lateChecked(K, head, c, path); continue }
    if (c.from !== r.from || c.to !== r.to) throw refuse(K, path, `ids ${c.from} to ${c.to}, not the head's ${r.from} to ${r.to}`)
    if (c.sha256 !== r.sha256 || c.bytes !== r.bytes) throw refuse(K, path, 'not the chunk the head names (digest or bytes)')
    if (c.paper.id !== head.paper.id || c.paper.version !== head.paper.version) throw refuse(K, path, 'not the head\'s paper')
    if (c.pipeline !== head.versions.pipeline) throw refuse(K, path, 'not the head\'s pipeline')
  }
  const late = Object.freeze(chunks.slice(head.units.length).map(c => Object.freeze({ kind: 'units', from: c.from, to: c.to, sha256: c.sha256, bytes: c.bytes })))
  // (amendment M24: chunks read without bodies make a light index, which the readers of the parts take and the door refuses)
  const light = chunks.some(c => c.part !== undefined)
  const { units, kinds, dropped, records, pieces } = light ? unitsOfChunks(chunks, { bodies: false }) : unitsOfChunks(chunks)
  const cat = o.catalog
  if (cat !== undefined) {
    if (cat.head.sha256 !== head.sha256 || cat.head.bytes !== head.bytes) throw refuse(K, 'catalog.head', 'not the head the index is made of')
    // (a catalog of the head's format, naming the head's base: catalogBase's of it, or none in a catalog of 7)
    if (cat.bundle !== undefined && head.bundle !== undefined && cat.bundle !== head.bundle) throw refuse(K, 'catalog.bundle', 'not the head\'s format')
    if (cat.base !== undefined && cat.base !== null && !sameBase(cat.base, catalogBase(head))) throw refuse(K, 'catalog.base', 'not the head\'s base')
    if (cat.paper.id !== head.paper.id || cat.paper.version !== head.paper.version || cat.paper.pages !== head.paper.pages) throw refuse(K, 'catalog.paper', 'not the head\'s')
    for (const k of versionKeysOf(head.bundle)) if (cat.versions[k] !== head.versions[k]) throw refuse(K, `catalog.versions.${k}`, 'not the head\'s')
    if (cat.units.length !== chunks.length) throw refuse(K, 'catalog.units', 'not the head\'s chunks and the late ones read')
    for (let i = 0; i < chunks.length; i++) {
      const a = cat.units[i], b = head.units[i] ?? chunks[i]
      if (a.from !== b.from || a.to !== b.to || a.sha256 !== b.sha256 || a.bytes !== b.bytes) throw refuse(K, `catalog.units[${i}]`, head.units[i] ? 'not the head\'s chunk' : 'not the late chunk read')
    }
  }
  if (light) return Object.freeze({ kind: 'index', light: true, sha256: head.sha256, head, units: Object.freeze(units), kinds: Object.freeze(kinds), pieces, dropped: Object.freeze(dropped), records, late })
  return Object.freeze({ kind: 'index', sha256: head.sha256, head, units: Object.freeze(units), kinds: Object.freeze(kinds), dropped: Object.freeze(dropped), records, late })
}

/**
 * The index with one more late chunk (indexOf's rule: the bitmap figures' labels, told after the head, PDF-READER §19.15): `chunk`
 * read alone (readUnitsChunk with the index's `dropped`, as a chunk read alone is), its ids the next after the index's units, of
 * the head's paper and pipeline, its units of kind `inkocr` alone, its bodies as the index's are (light or not), and the late
 * chunks LATE_MAX at most. A new index, the one given unchanged. Throws BundleRefusal
 */
export function indexWithLate(index, chunk) {
  const K = 'index'
  if (index?.kind !== 'index') throw new TypeError('index: a layer index (indexOf\'s)')
  const head = index.head, was = index.late ?? [], path = `units[${head.units.length + was.length}]`
  if (was.length >= LATE_MAX) throw refuse(K, path, `more than ${LATE_MAX} late chunks`)
  if (chunk?.kind !== 'units') throw new TypeError('chunk: a units chunk readUnitsChunk read')
  if (chunk.from !== index.units.length) throw refuse(K, path, `ids from ${chunk.from}, not ${index.units.length}, the one after the index's`)
  if ((chunk.part !== undefined) !== (index.light === true)) throw new TypeError('chunk: read with its bodies where the index is, and without where it is light')
  lateChecked(K, head, chunk, path)
  const n = index.units.length, m = chunk.units.length
  const r = chunk.part?.records ?? recordsOf(chunk.units, chunk.from, chunk.stands)
  const grow = (A, B) => { const out = new A.constructor(n + m); out.set(A, 0); out.set(B, n); return out }
  const records = { kind: grow(index.records.kind, r.kind), flags: grow(index.records.flags, r.flags), depth: grow(index.records.depth, r.depth), plainLength: grow(index.records.plainLength, r.plainLength), cells: new Map([...index.records.cells, ...r.cells]), headings: new Map([...index.records.headings, ...r.headings]) }
  const units = Object.freeze([...index.units, ...(chunk.part !== undefined ? chunk.units.map(u => (u === null ? null : true)) : chunk.units)])
  const kinds = Object.freeze([...index.kinds, ...(chunk.part?.kinds ?? chunk.units.map(u => (u === null ? null : u[0])))])
  const dropped = Object.freeze([...index.dropped, ...chunk.dropped])
  if (dropped.length > DROPPED_MAX) throw refuse(K, 'dropped', `more than ${DROPPED_MAX} units that do not stand`)
  const late = Object.freeze([...was, Object.freeze({ kind: 'units', from: chunk.from, to: chunk.to, sha256: chunk.sha256, bytes: chunk.bytes })])
  if (index.light === true) return Object.freeze({ kind: 'index', light: true, sha256: index.sha256, head, units, kinds, pieces: grow(index.pieces, chunk.pieces), dropped, records, late })
  return Object.freeze({ kind: 'index', sha256: index.sha256, head, units, kinds, dropped, records, late })
}

// ---------------------------------------------------------------- the parts
const PART_KEYS_WIRE = ['bundle', 'kind', 'head', 'prev', 'pages', 'views', 'left', 'fileOnly', 'layout', 'rules', 'leftParts']
/** a part's keys that may be there (BUNDLE5's): `figures`, where the part has a figure unit */
const PART_KEYS_OPTIONAL = ['figures']
const PART_DEF = { cap: PART_CAP, values: PART_VALUES, depth: PART_DEPTH }

/**
 * The part's fields, checked by what the part alone says (the reader adds what the index and the chain say; the writer has
 * no index): its pages [a, b] within the paper's N; the views of pages a … reach (stride 4, reach within N and past b); the
 * left units [id, stream, rects], ids rising, each rectangle on a page of [a, reach] within that page's view; `fileOnly`
 * [id, after], ids rising and not the left's; the layout part by checkLayoutPart, its units the left's or the file-only's and
 * those alone; `rules`, the rules near its table cells, null where the layout is none or no page of it has any, else boxes
 * (x0, y0, x1, y1 stride 4, layout/cell-rules.mjs checkBoxes) by page, each of pages a … b, within its view; one left-part ref for
 * each page a … b
 */
function partShape(v, { N, unitCount, format = BUNDLE5 }) {
  const K = 'part'
  digestField(K, v.head, 'head')
  if (v.prev !== null) digestField(K, v.prev, 'prev')
  const pages = v.pages
  if (!Array.isArray(pages) || pages.length !== 2) throw refuse(K, 'pages', `not [from, to] (${kindOf(pages)})`)
  const a = pages[0], b = pages[1]
  if (!isInteger(a, 1, N)) throw refuse(K, 'pages[0]', `not a page 1 to ${N}`)
  if (!isInteger(b, a, N)) throw refuse(K, 'pages[1]', `not a page ${a} to ${N}`)

  // views: pages a … reach
  const views = v.views
  if (!Array.isArray(views) || views.length % 4 !== 0 || views.length < 4 * (b - a + 1)) throw refuse(K, 'views', `not the views of pages ${a} to ${b} or more, 4 numbers each (${kindOf(views)})`)
  const reach = a + views.length / 4 - 1
  if (reach > N) throw refuse(K, 'views', `reaching page ${reach}, past the paper's ${N}`)
  for (let i = 0; i < views.length; i++) {
    if (!isNumber(views[i]) || Math.abs(views[i]) > COORD_MAX) throw refuse(K, `views[${i}]`, `not a number within ±${COORD_MAX} (${kindOf(views[i])})`)
    if (i % 4 >= 2 && views[i] <= views[i - 2]) throw refuse(K, `views[${i}]`, 'an empty view')
  }

  // left: the units the original's side locates
  const left = v.left
  if (!Array.isArray(left)) throw refuse(K, 'left', `not an array (${kindOf(left)})`)
  let last = -1
  for (let i = 0; i < left.length; i++) {
    const w = left[i], path = `left[${i}]`
    if (!Array.isArray(w) || w.length !== 3) throw refuse(K, path, `not [id, stream, rects] (${kindOf(w)})`)
    if (!isInteger(w[0], last + 1, unitCount - 1)) throw refuse(K, `${path}[0]`, 'not a unit\'s id above the last')
    last = w[0]
    if (!isInteger(w[1], 0, ID_MAX)) throw refuse(K, `${path}[1]`, 'not a token\'s index')
    const rects = w[2]
    if (!Array.isArray(rects) || rects.length === 0) throw refuse(K, `${path}[2]`, `not a rectangle or more (${kindOf(rects)})`)
    for (let j = 0; j < rects.length; j++) {
      const r = rects[j], rp = `${path}[2][${j}]`
      if (!Array.isArray(r) || r.length !== 5) throw refuse(K, rp, `not [page, x0, y0, x1, y1] (${kindOf(r)})`)
      if (!isInteger(r[0], a, reach)) throw refuse(K, `${rp}[0]`, `not a page ${a} to ${reach}`)
      const o = 4 * (r[0] - a)
      for (let q = 1; q < 5; q++) {
        const x = r[q], up = (q - 1) % 2
        if (!isNumber(x) || x < views[o + up] - RECT_SLACK || x > views[o + 2 + up] + RECT_SLACK) throw refuse(K, `${rp}[${q}]`, `not a number within its page's view (${kindOf(x)})`)
        if (q >= 3 && x <= r[q - 2]) throw refuse(K, `${rp}[${q}]`, 'an empty box')
      }
    }
  }

  // fileOnly: the units the layout places and the left does not
  const fileOnly = v.fileOnly
  if (!Array.isArray(fileOnly)) throw refuse(K, 'fileOnly', `not an array (${kindOf(fileOnly)})`)
  last = -1
  const inLeft = new Set(left.map(w => w[0]))
  for (let i = 0; i < fileOnly.length; i++) {
    const e = fileOnly[i], path = `fileOnly[${i}]`
    if (!Array.isArray(e) || e.length !== 2) throw refuse(K, path, `not [id, after] (${kindOf(e)})`)
    if (!isInteger(e[0], last + 1, unitCount - 1)) throw refuse(K, `${path}[0]`, 'not a unit\'s id above the last')
    last = e[0]
    if (inLeft.has(e[0])) throw refuse(K, `${path}[0]`, 'a unit of the left too')
    if (!isInteger(e[1], -1, ID_MAX)) throw refuse(K, `${path}[1]`, 'not a stream, or -1')
  }

  // layout: a layout part, or why there is none (a refusal's record), or null (no reason recorded)
  let layout = null, noLayout = null
  if (isLayoutRefusal(v.layout)) {
    const r = exactKeys(K, v.layout, ['refused', 'why'], 'layout')
    if (!LAYOUT_REFUSED.includes(r.refused)) throw refuse(K, 'layout.refused', `not one of ${LAYOUT_REFUSED.join(', ')} (${kindOf(r.refused)})`)
    if (typeof r.why !== 'string' || r.why.length > WHY_MAX) throw refuse(K, 'layout.why', `not a string of ${WHY_MAX} code units at most (${kindOf(r.why)})`)
    noLayout = Object.freeze({ refused: r.refused, why: r.why })
    if (fileOnly.length) throw refuse(K, 'fileOnly', 'units with no layout')
  } else if (v.layout !== null) {
    layout = inside(K, 'layout', () => checkLayoutPart(v.layout, { pages: N, views, lo: a, hi: reach }))
    const placed = new Set(fileOnly.map(e => e[0])), seen = new Set()
    for (let i = 0; i < layout.units.length; i++) {
      const id = layout.units[i][0]
      if (id >= unitCount) throw refuse(K, `layout.units[${i}][0]`, 'not a unit of the paper')
      if (!inLeft.has(id) && !placed.has(id)) throw refuse(K, `layout.units[${i}][0]`, 'neither a left unit of the part nor a file-only one')
      seen.add(id)
    }
    for (let i = 0; i < fileOnly.length; i++) if (!seen.has(fileOnly[i][0])) throw refuse(K, `fileOnly[${i}][0]`, 'not a unit of the layout')
    // (why each unit the part tells that the file does not lay is the original's: a left unit of the part's, as the cut writes it)
    const unlaid = layout.unlaid ?? []
    for (let i = 0; i < unlaid.length; i++) {
      const id = unlaid[i][0]
      if (id >= unitCount) throw refuse(K, `layout.unlaid[${i}][0]`, 'not a unit of the paper')
      if (!inLeft.has(id)) throw refuse(K, `layout.unlaid[${i}][0]`, 'not a left unit of the part')
    }
  } else if (fileOnly.length) throw refuse(K, 'fileOnly', 'units with no layout')

  // rules: by page, the part's own, where its layout is
  let rules = null
  if (v.rules !== null) {
    if (layout === null) throw refuse(K, 'rules', 'not null where the layout is none')
    if (!isObject(v.rules) || Array.isArray(v.rules)) throw refuse(K, 'rules', `not an object of pages (${kindOf(v.rules)})`)
    const keys = Object.keys(v.rules)
    if (!keys.length) throw refuse(K, 'rules', 'an object of no page: null')
    rules = {}
    for (const k of keys) {
      const p = /^[1-9]\d{0,4}$/.test(k) ? Number(k) : NaN
      if (!isInteger(p, a, b)) throw refuse(K, `rules.${told(k)}`, `not a page ${a} to ${b}`)
      const boxes = v.rules[k]
      if (!Array.isArray(boxes) || !boxes.length) throw refuse(K, `rules.${k}`, `not boxes (${kindOf(boxes)})`)
      inside(K, 'rules', () => checkBoxes(boxes, p, views, k, a))
      rules[p] = boxes
    }
  }

  // figures: its pages' figure units, where its layout is (figure-rows.mjs), none of them a unit of the layout nor a file-only one:
  // a figure unit is drawn by its figure row alone, never by a layout row; a left unit it may be (its left anchor, the hover's:
  // pipeline/ink-pass.mjs figureAnchors, PIPELINE 31), which the layer's units leave to its row (run.mjs). (The key there only
  // where the part has one: a part of none is written as one before figures)
  if (Object.hasOwn(v, 'figures') && !(Array.isArray(v.figures) && v.figures.length)) throw refuse(K, 'figures', 'there only where the part has a figure unit')
  const figures = inside(K, '', () => checkFigures(v.figures ?? [], { a, b, views, unitCount, format }))
  if (figures.length && layout === null) throw refuse(K, 'figures', 'figure units where the layout is none')
  const placed = new Set(fileOnly.map(e => e[0])), rowed = new Set((layout?.units ?? []).map(u => u[0]))
  for (let i = 0; i < figures.length; i++) if (rowed.has(figures[i].id) || placed.has(figures[i].id)) throw refuse(K, `figures[${i}][0]`, 'a unit of the layout too')

  // leftParts
  const lp = v.leftParts
  if (!Array.isArray(lp) || lp.length !== b - a + 1) throw refuse(K, 'leftParts', `not one ref for each of the pages ${a} to ${b} (${kindOf(lp)})`)
  for (let i = 0; i < lp.length; i++) {
    const r = refOf(K, lp[i], `leftParts[${i}]`, 'left', 'page', LEFT_CAP)
    if (r.page !== a + i) throw refuse(K, `leftParts[${i}].page`, `not page ${a + i}, in page order`)
  }
  return { a, b, reach, views, left, fileOnly, layout, noLayout, rules, figures, leftParts: lp }
}

/** the chain before any part */
function initialChain(index) {
  return { head: index.sha256, through: 0, last: null, slot: -Infinity, id: -1, told: new Uint8Array(index.units.length), figured: new Uint8Array(index.units.length), groups: new Uint8Array(indexGroups(index).count), reach: 0, ahead: [] }
}

/**
 * A part as received, read against `index` (indexOf) and `chain`, the state the parts told before it fix (null before the
 * first): its envelope and shape (partShape), then what it must agree with. The index: its head's; every id below the units;
 * a layout unit of the kind of its unit and of its piece count. The chain: its pages begin after the last told and `prev` is
 * the last part's digest; its K entries (a left unit at its stream, a file-only one at `after` + 0.5) come strictly after the
 * last K entry told, in (slot, id) order; the views of pages it shares with the last part's reach are what was told. Any failure refuses the whole part. Gives the part and the chain after it. Throws BundleRefusal
 */
export async function readPart(bytes, { ref, index, chain = null, caps }) {
  const K = 'part'
  const head = index.head, N = head.paper.pages
  const was = chain ?? initialChain(index)
  const { value: v, sha256 } = await opened(K, bytes, ref, PART_DEF, caps)
  // (a part of 7's or 9's holds no figures: 7's head is one over arXiv's PDF, which holds none of our groups, and 9 has none)
  envelope(K, v, PART_KEYS_WIRE, FIGURES_READ.includes(head.bundle) ? PART_KEYS_OPTIONAL : [], head.bundle ?? null)
  // (what the chain says of where the part begins and what it follows, before the shape that needs the chain's counts)
  if (v.head !== index.sha256) throw refuse(K, 'head', 'not the head of the index')
  if (v.head !== was.head) throw refuse(K, 'head', 'not the head of the parts told')
  if (Array.isArray(v.pages) && v.pages.length === 2 && v.pages[0] !== was.through + 1) throw refuse(K, 'pages[0]', `not ${was.through + 1}, the page after the last part's`)
  if (v.prev !== was.last) throw refuse(K, 'prev', 'not the digest of the last part told')
  const s = partShape(v, { N, unitCount: index.units.length, format: head.bundle ?? BUNDLE5 })

  // the ref's place, where it has one (a catalog's part refs do), is the part's pages
  if ((ref.from !== undefined && ref.from !== s.a) || (ref.to !== undefined && ref.to !== s.b)) throw refuse(K, 'ref', `the ref's pages ${ref.from ?? '?'} to ${ref.to ?? '?'} are not the part's ${s.a} to ${s.b}`)

  // against the index: a layout unit is its unit's kind and piece count, where the unit stands
  if (s.layout !== null) {
    for (let i = 0; i < s.layout.units.length; i++) {
      const [id, kind, , , count] = s.layout.units[i]
      if (index.units[id] === null) continue
      // (a light index (M24) holds each unit's kind and piece count, which is all this reads of it)
      const unitKind = index.light === true ? index.kinds[id] : index.units[id][0], pieces = index.light === true ? index.pieces[id] : index.units[id][5].length
      if (UNIT_KINDS[kind] !== unitKind) throw refuse(K, `layout.units[${i}][1]`, 'not its unit\'s kind')
      if (count !== pieces) throw refuse(K, `layout.units[${i}][4]`, 'not its unit\'s pieces')
    }
  }
  // (a figure row is a unit of kind `inkfigures` (FIGURE_KIND), where the unit stands)
  for (let i = 0; i < s.figures.length; i++) {
    const id = s.figures[i].id
    if (index.units[id] === null) continue
    if ((index.light === true ? index.kinds[id] : index.units[id][0]) !== FIGURE_KIND) throw refuse(K, `figures[${i}][0]`, `not a unit of kind ${FIGURE_KIND}`)
  }

  // against the chain
  // (K: one entry for each unit the part places, ordered by (slot, id); all after the last told, strictly)
  let lowSlot = 0, lowId = 0, highSlot = was.slot, highId = was.id, any = false
  const note = (slot, id) => {
    if (!any || slot < lowSlot || (slot === lowSlot && id < lowId)) { lowSlot = slot; lowId = id }
    if (slot > highSlot || (slot === highSlot && id > highId)) { highSlot = slot; highId = id }
    any = true
  }
  // (and no unit twice: one told by an earlier part is refused at any slot, past the frontier too)
  const told = was.told.slice()
  // (chain check 7, amendment M18: nor a member of a table group an earlier part told, which would split the group across parts)
  const grouped = indexGroups(index), groups = was.groups.slice(), mine = []
  const tell = (id, path) => {
    if (told[id] === 1) throw refuse(K, path, 'a unit already told by an earlier part')
    const g = grouped.of[id]
    if (g >= 0) {
      if (was.groups[g] === 1) throw refuse(K, path, 'a member of a table group an earlier part told')
      mine.push(g)
    }
    told[id] = 1
  }
  for (let i = 0; i < s.left.length; i++) {
    const w = s.left[i]
    tell(w[0], `left[${i}][0]`)
    note(w[1], w[0])
  }
  for (let i = 0; i < s.fileOnly.length; i++) {
    const e = s.fileOnly[i]
    tell(e[0], `fileOnly[${i}][0]`)
    note(e[1] + 0.5, e[0])
  }
  // (a figure unit's row told once, by the part of its page; no slot of K's. Its left anchor, the hover's, is told as a left unit's,
  // by this part or an earlier one (pipeline/ink-pass.mjs figureAnchors): the two are apart, a figure unit is never a file-only
  // unit nor a layout row (partShape), and its row is told once, `figured`)
  const figured = (was.figured ?? new Uint8Array(index.units.length)).slice()
  for (let i = 0; i < s.figures.length; i++) {
    const id = s.figures[i].id
    if (figured[id] === 1) throw refuse(K, `figures[${i}][0]`, 'a figure unit whose row an earlier part, or this one, told')
    figured[id] = 1
  }
  for (const g of mine) groups[g] = 1
  if (any && !(lowSlot > was.slot || (lowSlot === was.slot && lowId > was.id))) throw refuse(K, 'left', 'a unit that is not after the last one told (slot, id)')
  // (the views of the pages the last part reached past its own: those this part's views include are as told; a part whose own
  // units reach less far leaves the rest to the part that told them)
  for (let i = 0, n = Math.min(s.views.length, was.ahead.length); i < n; i++) if (s.views[i] !== was.ahead[i]) throw refuse(K, `views[${i}]`, 'not the view told by the last part')

  const after = Object.freeze({
    head: was.head, through: s.b, last: sha256, slot: highSlot, id: highId, told, figured, groups, reach: Math.max(s.reach, was.reach),
    ahead: Object.freeze(s.reach >= was.reach ? s.views.slice(4 * (s.b - s.a + 1)) : was.ahead.slice(4 * (s.b - was.through))),
  })
  return {
    kind: 'part', sha256, bytes: bytes.length, head: v.head, prev: v.prev, pages: [s.a, s.b], reach: s.reach, views: Object.freeze(s.views),
    left: s.left, fileOnly: s.fileOnly, layout: s.layout, noLayout: s.noLayout, rules: s.rules, figures: s.figures, leftParts: s.leftParts, chain: after,
  }
}

/**
 * The part written: `head` and `prev` digests, `pages` [a, b], the views of pages a … reach, the left units, the file-only
 * ones, the layout part, or why there is none ({ refused, why }: LAYOUT_REFUSED, written as given), or null (no reason given),
 * the rules near its table cells by page (null for none), and the left parts `writeLeftPart` gave, one for each page. Rectangles
 * and views to a thousandth, layout rows as the layout file writes them. Throws BundleRefusal for a part its reader would refuse
 * for itself: past PART_CAP or PART_VALUES, its content past CONTENT_MAX, a shape the part alone shows wrong
 */
export async function writePart({ paper, head, prev, pages, views, left, fileOnly, layout, rules = null, figures = [], leftParts }) {
  const K = 'part'
  const obj = {
    bundle: BUNDLE5, kind: 'part', head, prev, pages: [pages[0], pages[1]],
    views: views.map(r3),
    left: left.map(([id, stream, rects]) => [id, stream, rects.map(([p, x0, y0, x1, y1]) => [p, r3(x0), r3(y0), r3(x1), r3(y1)])]),
    fileOnly: fileOnly.map(([id, after]) => [id, after]),
    layout: layout === null ? null : isLayoutRefusal(layout) ? { refused: layout.refused, why: layout.why } : layoutPartRows(layout),
    rules: rules === null || !Object.keys(rules).length ? null : Object.fromEntries(Object.keys(rules).map(Number).sort((x, y) => x - y).map(p => [p, rules[p]])),
    ...(figures.length ? { figures: figures.map(r => [...r]).sort((x, y) => x[0] - y[0]) } : {}),
    leftParts: leftParts.map(l => ({ kind: 'left', page: l.page, sha256: l.sha256, bytes: l.bytes.length })),
  }
  if (!isInteger(pages[0], 1, PAGES_MAX) || !isInteger(pages[1], pages[0], PAGES_MAX)) throw refuse(K, 'pages', 'not [from, to] pages')
  // (the paper's page count is the views' reach: the writer is not told it)
  const N = Math.max(pages[1], pages[0] + Math.floor(views.length / 4) - 1)
  partShape(obj, { N, unitCount: ID_MAX })
  return written(K, obj, PART_DEF, paper, { from: pages[0], to: pages[1] }, total => total)
}

// ---------------------------------------------------------------- the left parts
const LEFT_KEYS = ['bundle', 'kind', 'page', 'first', 'tokens', 'spans', 'pairs', 'draw']
const TOKEN_KEYS = ['perPage', 'l', 'r', 'y', 'h', 'top', 'bottom']
/** the six coded fields of a left part's tokens, in the wire's order */
export const TOKEN_FIELDS = ['l', 'r', 'y', 'h', 'top', 'bottom']
const LEFT_DEF = { cap: LEFT_CAP, values: LEFT_VALUES, depth: LEFT_DEPTH }
const TOKEN_BOUND = TOKEN_LIMIT * TOKEN_SCALE

/** the left part's fields, checked by the part alone: its page and first token; the tokens' wire, decoded once by plain
 *  loops (a decoded value past ±TOKEN_LIMIT refused); the spans [id, ranges], ids rising, ranges [first, count, …] rising and
 *  not overlapping within [0, n), at most SPANNED_PER_TOKEN · n tokens named; the pairs [id, runs], ids a subset of the
 *  spans', runs [word, token, count] rising by word and not overlapping, each within [0, n) */
function leftShape(v) {
  const K = 'left'
  if (!isInteger(v.page, 1, PAGES_MAX)) throw refuse(K, 'page', `not a page 1 to ${PAGES_MAX}`)
  if (!isInteger(v.first, 0, ID_MAX)) throw refuse(K, 'first', 'not a token\'s index')
  const t = exactKeys(K, v.tokens, TOKEN_KEYS, 'tokens')
  if (!Array.isArray(t.perPage) || t.perPage.length !== 1) throw refuse(K, 'tokens.perPage', `not [n], one page's count (${kindOf(t.perPage)})`)
  const n = t.perPage[0]
  if (!isInteger(n, 0, TOKENS_PAGE)) throw refuse(K, 'tokens.perPage[0]', `not a count 0 to ${TOKENS_PAGE}`)
  const table = { n }
  for (const f of TOKEN_FIELDS) {
    const xs = t[f]
    if (!Array.isArray(xs) || xs.length !== n) throw refuse(K, `tokens.${f}`, `not ${n} integers (${kindOf(xs)})`)
    const out = new Float32Array(n)
    for (let k = 0, sum = 0; k < n; k++) {
      const d = xs[k]
      if (!Number.isSafeInteger(d)) throw refuse(K, `tokens.${f}[${k}]`, `not a whole number (${kindOf(d)})`)
      sum += d
      if (sum > TOKEN_BOUND || sum < -TOKEN_BOUND) throw refuse(K, `tokens.${f}[${k}]`, `decodes past ±${TOKEN_LIMIT}`)
      out[k] = sum / TOKEN_SCALE
    }
    table[f] = out
  }
  const spans = v.spans, pairs = v.pairs
  if (!Array.isArray(spans)) throw refuse(K, 'spans', `not an array (${kindOf(spans)})`)
  let last = -1, named = 0
  for (let i = 0; i < spans.length; i++) {
    const e = spans[i], path = `spans[${i}]`
    if (!Array.isArray(e) || e.length !== 2) throw refuse(K, path, `not [id, ranges] (${kindOf(e)})`)
    if (!isInteger(e[0], last + 1, ID_MAX)) throw refuse(K, `${path}[0]`, 'not a unit\'s id above the last')
    last = e[0]
    const r = e[1]
    if (!Array.isArray(r) || r.length === 0 || r.length % 2 !== 0) throw refuse(K, `${path}[1]`, `not ranges of [first, count], one at least (${kindOf(r)})`)
    let next = 0
    for (let j = 0; j < r.length; j += 2) {
      if (!isInteger(r[j], next, n - 1)) throw refuse(K, `${path}[1][${j}]`, `not a token after the last range, within the page's ${n}`)
      if (!isInteger(r[j + 1], 1, n - r[j])) throw refuse(K, `${path}[1][${j + 1}]`, 'not a count of 1 up to the page\'s end')
      next = r[j] + r[j + 1]
      named += r[j + 1]
    }
    if (named > SPANNED_PER_TOKEN * n) throw new BundleRefusal(`names more than ${SPANNED_PER_TOKEN} × the page's ${n} tokens`, { kind: K, path: 'spans', data: { bound: 'spanned' } })
  }
  if (!Array.isArray(pairs)) throw refuse(K, 'pairs', `not an array (${kindOf(pairs)})`)
  last = -1
  let at = 0
  for (let i = 0; i < pairs.length; i++) {
    const e = pairs[i], path = `pairs[${i}]`
    if (!Array.isArray(e) || e.length !== 2) throw refuse(K, path, `not [id, runs] (${kindOf(e)})`)
    if (!isInteger(e[0], last + 1, ID_MAX)) throw refuse(K, `${path}[0]`, 'not a unit\'s id above the last')
    last = e[0]
    while (at < spans.length && spans[at][0] < last) at++
    if (at >= spans.length || spans[at][0] !== last) throw refuse(K, `${path}[0]`, 'not a unit of the spans')
    const r = e[1]
    if (!Array.isArray(r) || r.length === 0 || r.length % 3 !== 0) throw refuse(K, `${path}[1]`, `not runs of [word, token, count], one at least (${kindOf(r)})`)
    let nextWord = 0
    for (let j = 0; j < r.length; j += 3) {
      if (!isInteger(r[j], nextWord, ID_MAX)) throw refuse(K, `${path}[1][${j}]`, 'not a word after the last run\'s')
      if (!isInteger(r[j + 2], 1, n)) throw refuse(K, `${path}[1][${j + 2}]`, 'not a count of 1 or more')
      if (!isInteger(r[j + 1], 0, n - r[j + 2])) throw refuse(K, `${path}[1][${j + 1}]`, 'not a run of tokens within the page')
      nextWord = r[j] + r[j + 2]
    }
  }
  // the page's draw geometry (E-C): null, or checked by draw.mjs
  let draw = null
  if (v.draw !== null) {
    try { draw = checkDraw(v.draw) } catch (e) {
      if (e instanceof DrawRefusal) throw refuse(K, e.path, e.why)
      throw e
    }
  }
  return { page: v.page, first: v.first, table, spans, pairs, draw }
}

/**
 * A left part as received: within its caps and its ref (`ref.page` the page the part that names it says), the envelope and
 * shape (leftShape), then against the parts told: its `page` the ref's, every span's unit a stream (`streamOf(id)`, a unit of
 * the parts told) and, where that stream lies on this page (`stream − first` in [0, n)), the unit's first range beginning
 * there. Gives the tokens decoded once into typed arrays. Throws BundleRefusal
 */
export async function readLeftPart(bytes, { ref, streamOf, caps }) {
  const K = 'left'
  const { value: v, sha256 } = await opened(K, bytes, ref, LEFT_DEF, caps)
  envelope(K, v, LEFT_KEYS)
  const s = leftShape(v)
  if (s.page !== ref.page) throw refuse(K, 'page', `not page ${ref.page}, the part's`)
  for (let i = 0; i < s.spans.length; i++) {
    const [id, ranges] = s.spans[i], stream = streamOf(id)
    if (!Number.isSafeInteger(stream)) throw refuse(K, `spans[${i}][0]`, 'not a unit of the parts told')
    const rel = stream - s.first
    if (rel >= 0 && rel < s.table.n && ranges[0] !== rel) throw refuse(K, `spans[${i}][1][0]`, `not the unit's stream, ${rel} on this page`)
  }
  return { kind: 'left', sha256, bytes: bytes.length, page: s.page, first: s.first, table: s.table, spans: s.spans, pairs: s.pairs, draw: s.draw }
}

/** the left part of a page with no tokens (n = 0, no spans, no pairs): what a page whose part would pass its caps ships */
const emptyLeft = (page, first) => ({
  bundle: BUNDLE5, kind: 'left', page, first,
  tokens: { perPage: [0], l: [], r: [], y: [], h: [], top: [], bottom: [] }, spans: [], pairs: [], draw: null,
})

/**
 * A left part written: the page's tokens (the wire, `perPage` [n], delta-coded fields), spans and pairs. A page whose part
 * would pass LEFT_CAP, LEFT_VALUES or TOKENS_PAGE ships the empty part instead (amendment M8: left parts are leaves, and a
 * page without its tokens loses its highlight and nothing else), and the result says so (`emptied`); it never throws for
 * size. It throws BundleRefusal for what its reader would refuse of it for another reason
 */
export async function writeLeftPart({ paper, page, first, tokens, spans, pairs, draw = null, drawText = null }) {
  // (a draw given as wireText's JSON is checked already: it stands in the part's text as it is, neither parsed, wired nor checked
  // again; one given as an object is wired here)
  const spliced = drawText !== null
  const obj = {
    bundle: BUNDLE5, kind: 'left', page, first,
    tokens: { perPage: [...tokens.perPage], l: [...tokens.l], r: [...tokens.r], y: [...tokens.y], h: [...tokens.h], top: [...tokens.top], bottom: [...tokens.bottom] },
    spans: spans.map(([id, ranges]) => [id, [...ranges]]),
    pairs: pairs.map(([id, runs]) => [id, [...runs]]),
    // (the draw geometry: shed to null for any reason its reader would refuse it, never thrown)
    draw: spliced ? null : wireOf(draw),
  }
  let drawShed = !spliced && draw != null && obj.draw === null, withText = spliced
  // (what the reader refuses of a page for its size, the writer empties; what it refuses for anything else, the writer throws)
  let emptied = obj.tokens.perPage[0] > TOKENS_PAGE
  if (!emptied) {
    try { leftShape(obj) } catch (e) {
      if (!(e instanceof BundleRefusal) || e.data?.bound !== 'spanned') throw e
      emptied = true
    }
  }
  // the part's text, a spliced draw's JSON in its place (`draw` the object's last key), and its bytes and values, made once: what
  // the size check reads is what is written
  const textOf = o => {
    const t = JSON.stringify(o)
    if (!withText || o !== obj) return t
    if (!t.endsWith('"draw":null}')) throw new Error('a left part whose last key is not its draw')
    return `${t.slice(0, -5)}${drawText}}`
  }
  const sized = text => {
    const bytes = encoder.encode(text)
    if (bytes.length > LEFT_CAP) return { text, pre: null }
    const values = inside('left', '', () => countValues(text, LEFT_VALUES, LEFT_DEPTH))
    return { text, pre: values > LEFT_VALUES ? null : { bytes, values } }
  }
  let got = emptied ? null : sized(textOf(obj))
  if (got && got.pre === null) {
    // (the geometry goes before the tokens: a page without its draw is read by the browser, without its tokens loses its highlight)
    if (obj.draw !== null || withText) { obj.draw = null; withText = false; drawShed = true }
    got = sized(textOf(obj))
    if (got.pre === null) emptied = true
  }
  if (emptied) { const out = emptyLeft(page, first); leftShape(out); got = { text: JSON.stringify(out), pre: null } }
  const w = await finish('left', got.text, LEFT_DEF, paper, { page }, null, null, got.pre)
  return { ...w, emptied, drawShed: drawShed || (emptied && (draw != null || spliced)) }
}

// ---------------------------------------------------------------- the catalog
const CATALOG_KEYS = ['bundle', 'kind', 'paper', 'versions', 'head', 'units', 'parts', 'end']
/** BUNDLE 8's: the base the layer is drawn over (catalogBase), which a catalog of 7 holds none of */
const CATALOG_KEYS_8 = ['bundle', 'kind', 'paper', 'versions', 'head', 'base', 'units', 'parts', 'end']
const CATALOG_DEF = { cap: CATALOG_CAP, values: CATALOG_VALUES, depth: CATALOG_DEPTH }

/** whether two catalogs' bases are one: the same fields with the same values, in any order (a catalog another writer made,
 *  the web's, keeps its own; a delta's nested `object` compared the same way) */
const sameBase = (a, b) => isObject(a) && isObject(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(b).every(k => Object.hasOwn(a, k) && (isObject(b[k]) ? sameBase(a[k], b[k]) : a[k] === b[k]))
/** the base a catalog names, of its head as read (readHead's): ours whole, the object a reader asks for by its name (baseKey)
 *  with its digest and bytes, { source: 'ours', key, sha256, bytes }; ours as a delta, the bundle object it is (deltaKey),
 *  { source: 'ours', kind: 'delta', object: { key, sha256, bytes } }, read after arXiv's PDF; arXiv's, { source: 'arxiv', sha256,
 *  bytes } (the host's copy of arXiv's PDF, which it names itself) */
export function catalogBase(head) {
  const b = head.base
  if (b.source === 'ours' && b.kind === 'delta') return { source: 'ours', kind: 'delta', object: { key: deltaKey(head.paper.id, head.paper.version, b.sha256), sha256: b.sha256, bytes: b.bytes } }
  return b.source === 'ours' ? { source: 'ours', key: baseKey(head.paper.id, head.paper.version, b.sha256), sha256: b.sha256, bytes: b.bytes } : { source: 'arxiv', sha256: b.sha256, bytes: b.bytes }
}

function catalogShape(v) {
  const K = 'catalog'
  const paper = paperOf(K, v.paper, 'paper', true), N = paper.pages
  const versions = versionsOf(K, v.versions, 'versions', v.bundle)
  refOf(K, v.head, 'head', 'head', 'plain', HEAD_CAP)
  let base = null
  if (v.bundle !== '7') {
    const s = isObject(v.base) ? v.base.source : undefined
    if (!BASE_SOURCES.includes(s)) throw refuse(K, 'base.source', `not one of ${BASE_SOURCES.join(', ')} (${typeof s === 'string' ? told(s) : kindOf(s)})`)
    if (s === 'ours' && Object.hasOwn(v.base, 'kind')) {
      // (a delta: the bundle object it is, by its name under the CTAG, its digest and bytes)
      if (v.base.kind !== 'delta') throw refuse(K, 'base.kind', `not 'delta' (${typeof v.base.kind === 'string' ? told(v.base.kind) : kindOf(v.base.kind)}): a whole base of ours names no kind`)
      base = exactKeys(K, v.base, ['source', 'kind', 'object'], 'base')
      const ob = exactKeys(K, base.object, ['key', 'sha256', 'bytes'], 'base.object')
      digestField(K, ob.sha256, 'base.object.sha256')
      if (!isInteger(ob.bytes, 1, DELTA_MAX_BYTES)) throw refuse(K, 'base.object.bytes', `not an integer 1 to ${DELTA_MAX_BYTES}`)
      if (ob.key !== deltaKey(paper.id, paper.version, ob.sha256)) throw refuse(K, 'base.object.key', 'not the name of the delta\'s digest (deltaKey)')
    } else {
      base = exactKeys(K, v.base, s === 'ours' ? ['source', 'key', 'sha256', 'bytes'] : ['source', 'sha256', 'bytes'], 'base')
      pdfRef(K, base, 'base', false)
      if (s === 'ours' && base.key !== baseKey(paper.id, paper.version, base.sha256)) throw refuse(K, 'base.key', 'not the name of the base\'s digest (baseKey)')
    }
  }
  rangesOf(K, v.units, 'units', { refKind: 'units', lo: 0, hi: CHUNKS_MAX, first: 0, last: ID_MAX, max: UNITS_CAP })
  // parts: contiguous from page 1, each within the paper
  const parts = v.parts
  const through = rangesOf(K, parts, 'parts', { refKind: 'part', lo: 0, hi: N, first: 1, last: N, max: PART_CAP })
  const end = v.end
  if (!isObject(end)) throw refuse(K, 'end', `not an object (${kindOf(end)})`)
  for (const k of Object.keys(end)) if (k !== 'through' && k !== 'refused') throw refuse(K, sub('end', told(k)), 'not a key of the schema')
  if (!Object.hasOwn(end, 'through')) throw refuse(K, 'end.through', 'missing')
  if (end.through !== through) throw refuse(K, 'end.through', `not ${through}, the last part's last page (0 for none)`)
  if (Object.hasOwn(end, 'refused')) {
    if (!END_WHYS.includes(end.refused)) throw refuse(K, 'end.refused', `not one of ${END_WHYS.join(', ')}`)
    if (through >= N) throw refuse(K, 'end.refused', `a refusal, and the parts reach the last page ${N}`)
  } else if (through !== N) throw refuse(K, 'end.through', `not the paper's ${N}, and no refusal`)
  return { paper, versions, head: v.head, base, units: v.units, parts, end }
}

/**
 * The catalog as fetched by name (it has no ref: its digest is computed and given), within its caps; its envelope and
 * shape (BUNDLES_READ: `bundle` its format; `base` the base a catalog of 8 names, catalogBase's shape, null in one of 7).
 * `parts` are contiguous from page 1 to `end.through` (each part names its own left parts), `end` { through: N }
 * complete or { through, refused } with through below N and the reason one of END_WHYS. With `o.paper`, the catalog is of
 * that paper version; with `o.key`, it is the key of a catalog of this paper, and its VTAG the one its versions make. Throws
 * BundleRefusal
 */
export async function readCatalog(bytes, o = {}) {
  const K = 'catalog'
  const { value: v, sha256 } = await opened(K, bytes, null, CATALOG_DEF, o.caps)
  envelope(K, v, isObject(v) && v.bundle === '7' ? CATALOG_KEYS : CATALOG_KEYS_8)
  const c = catalogShape(v)
  if (o.paper !== undefined && (c.paper.id !== o.paper.id || c.paper.version !== o.paper.version)) throw refuse(K, 'paper', 'not the paper version asked for')
  if (o.key !== undefined) {
    const k = keyParts(o.key)
    if (k === null || k.vtag === undefined) throw refuse(K, 'key', 'not the key of a catalog')
    if (k.paper !== c.paper.id || k.version !== c.paper.version) throw refuse(K, 'paper', 'not the paper version of its key')
    const vtag = vtagOf(c.versions, v.bundle)
    if (k.vtag !== vtag) throw refuse(K, 'versions', `not the key's ${k.vtag}`)
  }
  return { kind: 'catalog', bundle: v.bundle, sha256, bytes: bytes.length, paper: c.paper, versions: c.versions, head: c.head, base: c.base, units: c.units, parts: c.parts, end: c.end }
}

/**
 * The catalog written, by the Worker from the refs it committed (amendment M4), in order: the head as read (its paper and
 * versions are the catalog's, its base the catalog's `base`: catalogBase), the chunks (the head's, then the late ones the maker
 * announced after its parts: the bitmap figures' labels, LATE_MAX at most) and the parts, and how far
 * they go (`end`: { through }, or { through, refused } with the reason one of END_WHYS). Throws BundleRefusal for a catalog
 * its reader would refuse
 */
export async function writeCatalog({ head, units, parts, end }) {
  const refs = (list, kind) => list.map(u => ({ kind, from: u.from, to: u.to, sha256: u.sha256, bytes: u.bytes }))
  const through = parts.length ? parts[parts.length - 1].to : 0
  const obj = {
    bundle: BUNDLE5, kind: 'catalog',
    paper: { id: head.paper.id, version: head.paper.version, pages: head.paper.pages },
    versions: Object.fromEntries(versionKeysOf(head.bundle ?? BUNDLE5).map(k => [k, head.versions[k]])),
    head: { kind: 'head', sha256: head.sha256, bytes: head.bytes },
    base: catalogBase(head),
    units: refs(units, 'units'),
    parts: refs(parts, 'part'),
    end: end.refused === undefined ? { through: end.through } : { through: end.through, refused: end.refused },
  }
  // (the head's chunks, then the late ones the maker announced after its parts, LATE_MAX at most: indexOf's)
  if (units.length < head.units.length || units.length > head.units.length + LATE_MAX) throw refuse('catalog', 'units', `not the head's chunks and ${LATE_MAX} late ones at most`)
  for (let i = 0; i < head.units.length; i++) {
    const a = head.units[i], b = units[i]
    if (a.from !== b.from || a.to !== b.to || a.sha256 !== b.sha256 || a.bytes !== b.bytes) throw refuse('catalog', `units[${i}]`, 'not the head\'s chunk')
  }
  if (end.through !== through) throw refuse('catalog', 'end.through', `not ${through}, the last part's last page`)
  catalogShape(obj)
  return written('catalog', obj, CATALOG_DEF, head.paper, {}, null, vtagOf(head.versions))
}

// ---------------------------------------------------------------- the parts as the whole
/**
 * The parts as the whole BUNDLE 3 file's reading (ReadBundle): the parts in order, each after the one before and the last
 * reaching the paper's last page; the units and their kinds the index's; the left's units by id and its pages' boxes from the
 * parts' views; the layout parts merged (mergeLayout) under the head's header, null where every part's is; the rules by page,
 * null where no part has any. The lab's equality harness compares this with the whole; no reader
 * of the layer takes it. Throws BundleRefusal when the parts are not a chain to the last page
 */
export function mergeParts(index, parts) {
  const K = 'index'
  if (index.light === true) throw new TypeError('index: a light index holds no unit bodies, which the merge needs')
  const head = index.head, N = head.paper.pages
  let through = 0
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].head !== index.sha256) throw refuse(K, `parts[${i}]`, 'not a part of the index\'s head')
    if (parts[i].pages[0] !== through + 1) throw refuse(K, `parts[${i}]`, `not beginning at page ${through + 1}`)
    if (parts[i].prev !== (i === 0 ? null : parts[i - 1].sha256)) throw refuse(K, `parts[${i}]`, i === 0 ? 'the first part has a prev' : 'not following the digest of the part before it')
    through = parts[i].pages[1]
  }
  if (through !== N) throw refuse(K, 'parts', `reaching page ${through}, not the paper's ${N}`)
  const boxes = new Array(N), units = []
  const layouts = []
  let rules = null
  for (const p of parts) {
    for (let q = p.pages[0]; q <= p.pages[1]; q++) boxes[q - 1] = p.views.slice(4 * (q - p.pages[0]), 4 * (q - p.pages[0] + 1))
    for (const w of p.left) units.push(w)
    if (p.layout !== null) layouts.push(p.layout)
    if (p.rules !== null) Object.assign(rules ??= {}, p.rules)
  }
  units.sort((a, b) => a[0] - b[0])
  const flat = []
  for (const b of boxes) for (const x of b) flat.push(x)
  let layout = null
  if (layouts.length) {
    layout = { schema: LAYOUT_SCHEMA, layout: head.versions.layout, pdfjs: head.versions.pdfjs, paper: { id: head.paper.id, version: head.paper.version, pages: N }, left: '', views: flat, ...mergeLayout(layouts), lineskip: head.lineskip }
  }
  return {
    schema: 1,
    paper: { id: head.paper.id, version: head.paper.version, pages: N },
    base: { bytes: head.base.bytes, sha256: head.base.sha256, url: originalUrl(head.paper.id, head.paper.version), source: head.base.source },
    versions: { bundle: BUNDLE5, ...head.versions },
    units: [...index.units],
    left: { kinds: index.kinds.map(k => k ?? ''), pages: boxes, units },
    layout, rules, dropped: [...index.dropped],
  }
}
