// The remover exchange's payloads (the prepare pipeline's bundle 4 contract, C8.2; E3's): what the prepare side asks the
// remover child about a part's removed pages, and what the remover answers. The prepare side holds no PDF object layer (a
// hostile PDF there would cost the layer, not the tails: layout/remove.mjs head, the 10-07 ruling), so the plan travels to
// the remover, which alone parses arXiv's PDF, and the tail and its pages' manifest entries travel back. Each payload is
// UTF-8 JSON, and each reader takes it as untrusted: its bytes, its UTF-8, its values and its nesting bounded before
// JSON.parse (json.mjs boundedJson), then its shape by plain loops, every number an integer within its bound. A refusal is
// a LayoutRefusal naming the path; the remover answers a refused ask `{ ok: false, why: 'refused' }` and never throws for
// one, and the prepare side takes a refused answer as the remover's failure.
//
// The ask (encodeAsk, readAsk), at most ASK_CAP bytes and ASK_VALUES values, 6 deep:
//   {"v":1,"pdfjs":"<the PDF.js that read the facts>","from":a,"to":b,"pages":N,
//    "chain":{"end":<bytes so far>,"xref":<the last section's offset>,"next":<next object number>|null,"kids":[<the removed
//             pages' object numbers so far>],"empty":<the empty stream's>|null},
//    "plans":[{"p":page,"shows":n|null,"units":[[id,[n,k,…],[m,…]]…],"names":[[occurrence,[n,k,…]]…],"crops":[[[n,k,…],[m,…]]…],
//              "align":{"codes":[[code|null|-1,…]…],"paths":n}}…]}   (the part's pages with kept ink, rising)
// The answer's entries (encodeEntries, readEntries), at most ENTRIES_CAP bytes and ENTRIES_VALUES values, 5 deep:
//   {"v":1,"page":{"<p>":{"ok":true,"units":{"<id>":[boxes]…},"at":{"R":n}}|{"ok":false,"refused":"…"}…},
//    "stats":{the remover's seven counts},"kids":[<the removed pages' object numbers it appended>],"empty":n|null}
// or {"v":1,"over":true}: the asked pages' tail or entries pass what a part holds (the part is cut shorter).
// Imports the layout's JSON bounds, the manifest's reason bound and the tail's cap alone: both children load it.
import { REFUSED_MAX } from './addon-manifest.mjs'
import { boundedJson, COORD_MAX, countValues, isInteger, isNumber, isObject, isVersionToken, LayoutRefusal, PAGES_MAX, told } from './json.mjs'
import { TAIL_CAP } from './tail.mjs'

/** an ask's bytes, values and nesting at most (the object › plans › a plan › units › a unit › its glyphs) */
export const ASK_CAP = 8 * 2 ** 20, ASK_VALUES = 2_000_000
const ASK_DEPTH = 6
/** an answer's entries' bytes, values and nesting at most (the object › page › an entry › units › a unit's boxes) */
export const ENTRIES_CAP = 256 * 1024, ENTRIES_VALUES = 100_000
const ENTRIES_DEPTH = 5
/** an answer frame at most, the service's bound on what the remover sends back: a tail, its entries and 4 KiB for the rest */
export const ANSWER_CAP = TAIL_CAP + ENTRIES_CAP + 4096
/** the remover's failures, as the service tells them (`{ ok: false, why }`); any other word is taken as 'crashed' */
export const REMOVER_WHYS = Object.freeze(['refused', 'memory', 'clock', 'crashed', 'deadline'])
/** the remover's counts, as makeAddon keeps them */
export const REMOVER_STATS = Object.freeze(['removed', 'rules', 'cut', 'hidden', 'refused', 'forms', 'streams'])
/** an object number at most (ISO 32000-1, annex C), a document's bytes, a count and a character code */
const OBJECT_MAX = 8_388_607, END_MAX = 2 ** 31, COUNT_MAX = 2 ** 31, CODE_MAX = 2 ** 32 - 1
const PAGE_KEY = /^[1-9]\d{0,4}$/, UNIT_KEY = /^(?:0|[1-9]\d{0,8})$/
/** a unit's id at most: the largest an answer's entries name (UNIT_KEY, the manifest's) */
const UNIT_ID_MAX = 999_999_999

const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v)
const refuse = (path, why) => new LayoutRefusal(path, why)
const utf8 = new TextEncoder()

/** an object with exactly `keys` */
function exact(v, keys, path) {
  if (!isObject(v)) throw refuse(path, `not an object (${kindOf(v)})`)
  for (const k of keys) if (!Object.hasOwn(v, k)) throw refuse(path ? `${path}.${k}` : k, 'missing')
  const own = Object.keys(v)
  if (own.length !== keys.length) for (const k of own) if (!keys.includes(k)) throw refuse(path ? `${path}.${told(k)}` : told(k), 'not a key of the schema')
  return v
}
/** an array of integers lo to hi, `pairs`: of even length */
function integers(v, lo, hi, path, pairs = false) {
  if (!Array.isArray(v) || (pairs && v.length % 2 !== 0)) throw refuse(path, `not ${pairs ? 'pairs of integers' : 'integers'} (${kindOf(v)})`)
  for (let i = 0; i < v.length; i++) if (!isInteger(v[i], lo, hi)) throw refuse(`${path}[${i}]`, `not an integer ${lo} to ${hi}`)
  return v
}
/** an array of `n` entries at most */
function list(v, n, path) {
  if (!Array.isArray(v) || v.length > n) throw refuse(path, `not a list of at most ${n} (${kindOf(v)})`)
  return v
}

/**
 * The ask's bytes: `from` to `to` the part's pages, `pages` the paper's, `pdfjs` the version of the PDF.js that read the
 * plans' facts, `chain` the state the tails so far leave (layout/chain.mjs), `plans` the pages with kept ink, rising, each
 * { p, ...its plan's `remove` } (layout/addon.mjs pagePlanOf). null where it passes ASK_CAP or ASK_VALUES (the caller's
 * to answer: a page alone refused, several a shorter part)
 */
export function encodeAsk({ from, to, pages, pdfjs, chain, plans }) {
  const text = JSON.stringify({
    v: 1, pdfjs, from, to, pages,
    chain: { end: chain.end, xref: chain.xref, next: chain.next, kids: chain.kids, empty: chain.empty },
    plans: plans.map(x => ({ p: x.p, shows: x.shows ?? null, units: x.units, names: x.names, crops: x.crops, align: { codes: x.align.codes, paths: x.align.paths } })),
  })
  // (the text is ASCII but for the version token: its length is its bytes, near enough to refuse before encoding)
  if (text.length > ASK_CAP) return null
  const bytes = utf8.encode(text)
  if (bytes.length > ASK_CAP || countValues(text, ASK_VALUES, ASK_DEPTH) > ASK_VALUES) return null
  return bytes
}

/**
 * An ask read within bounds (the remover's side): bytes, UTF-8, values and nesting before JSON.parse, then its shape: `v` 1,
 * `pdfjs` a version token, `pages` 1 to PAGES_MAX, `from` and `to` its pages; the chain a first one (`next`, `empty` null,
 * no kids, the original's bytes alone) or a later one (every number below `next`, its kids rising and no more than the
 * pages before `from`, `xref` inside `end`); the plans 1 to the part's pages, rising within it, every count and index an
 * integer within its bound, each glyph a pair, each code null, -1 or a code. Returns the ask as parsed. Throws LayoutRefusal
 */
export function readAsk(bytes) {
  if (!(bytes instanceof Uint8Array)) throw refuse('', `not bytes (${kindOf(bytes)})`)
  const v = exact(boundedJson(bytes, { cap: ASK_CAP, values: ASK_VALUES, depth: ASK_DEPTH }), ['v', 'pdfjs', 'from', 'to', 'pages', 'chain', 'plans'], '')
  if (v.v !== 1) throw refuse('v', 'not 1')
  if (!isVersionToken(v.pdfjs)) throw refuse('pdfjs', `not a version (${kindOf(v.pdfjs)})`)
  if (!isInteger(v.pages, 1, PAGES_MAX)) throw refuse('pages', `not 1 to ${PAGES_MAX}`)
  if (!isInteger(v.from, 1, v.pages)) throw refuse('from', `not a page 1 to ${v.pages}`)
  if (!isInteger(v.to, v.from, v.pages)) throw refuse('to', `not a page ${v.from} to ${v.pages}`)
  const c = exact(v.chain, ['end', 'xref', 'next', 'kids', 'empty'], 'chain')
  if (!isInteger(c.end, 1, END_MAX)) throw refuse('chain.end', `not 1 to ${END_MAX}`)
  if (!isInteger(c.xref, 0, c.end - 1)) throw refuse('chain.xref', 'not an offset inside the document')
  if (c.next === null) {
    if (c.empty !== null) throw refuse('chain.empty', 'not null in a first update')
    if (!Array.isArray(c.kids) || c.kids.length !== 0) throw refuse('chain.kids', 'not [] in a first update')
  } else {
    if (!isInteger(c.next, 2, OBJECT_MAX + 1)) throw refuse('chain.next', `not 2 to ${OBJECT_MAX + 1}`)
    if (!isInteger(c.empty, 1, c.next - 1)) throw refuse('chain.empty', 'not a number below next')
    const kids = integers(list(c.kids, v.from - 1, 'chain.kids'), 1, c.next - 1, 'chain.kids')
    if (kids.length === 0) throw refuse('chain.kids', 'none after an update')
    for (let i = 0; i < kids.length; i++) if (kids[i] === c.empty || (i > 0 && kids[i] <= kids[i - 1])) throw refuse(`chain.kids[${i}]`, 'not rising, or the empty stream')
  }
  const plans = list(v.plans, v.to - v.from + 1, 'plans')
  if (plans.length === 0) throw refuse('plans', 'none')
  let last = v.from - 1
  for (let i = 0; i < plans.length; i++) {
    const path = `plans[${i}]`
    const x = exact(plans[i], ['p', 'shows', 'units', 'names', 'crops', 'align'], path)
    if (!isInteger(x.p, last + 1, v.to)) throw refuse(`${path}.p`, `not a page of the part after ${last}`)
    last = x.p
    if (x.shows !== null && !isInteger(x.shows, 0, COUNT_MAX)) throw refuse(`${path}.shows`, 'not a count, or null')
    const units = list(x.units, COUNT_MAX, `${path}.units`)
    for (let j = 0; j < units.length; j++) {
      const u = units[j], up = `${path}.units[${j}]`
      if (!Array.isArray(u) || u.length !== 3) throw refuse(up, `not [id, glyphs, paths] (${kindOf(u)})`)
      if (!isInteger(u[0], 0, UNIT_ID_MAX)) throw refuse(`${up}[0]`, 'not a unit\'s id an answer may name')
      integers(u[1], 0, COUNT_MAX, `${up}[1]`, true)
      integers(u[2], 0, COUNT_MAX, `${up}[2]`)
    }
    const names = list(x.names, COUNT_MAX, `${path}.names`)
    for (let j = 0; j < names.length; j++) {
      const nm = names[j], np = `${path}.names[${j}]`
      if (!Array.isArray(nm) || nm.length !== 2) throw refuse(np, `not [occurrence, glyphs] (${kindOf(nm)})`)
      if (!isInteger(nm[0], 0, COUNT_MAX)) throw refuse(`${np}[0]`, 'not an occurrence')
      integers(nm[1], 0, COUNT_MAX, `${np}[1]`, true)
    }
    const crops = list(x.crops, COUNT_MAX, `${path}.crops`)
    for (let j = 0; j < crops.length; j++) {
      const cr = crops[j], cp = `${path}.crops[${j}]`
      if (!Array.isArray(cr) || cr.length !== 2) throw refuse(cp, `not [glyphs, paths] (${kindOf(cr)})`)
      integers(cr[0], 0, COUNT_MAX, `${cp}[0]`, true)
      integers(cr[1], 0, COUNT_MAX, `${cp}[1]`)
    }
    const al = exact(x.align, ['codes', 'paths'], `${path}.align`)
    if (!isInteger(al.paths, 0, COUNT_MAX)) throw refuse(`${path}.align.paths`, 'not a count')
    const codes = list(al.codes, COUNT_MAX, `${path}.align.codes`)
    for (let j = 0; j < codes.length; j++) {
      const row = codes[j], rp = `${path}.align.codes[${j}]`
      if (!Array.isArray(row)) throw refuse(rp, `not a show's codes (${kindOf(row)})`)
      for (let k = 0; k < row.length; k++) if (row[k] !== null && !isInteger(row[k], -1, CODE_MAX)) throw refuse(`${rp}[${k}]`, 'not a code, -1 or null')
    }
  }
  return v
}

/**
 * The answer's entries (the remover's side): the asked pages' manifest entries (makeAddon's, each reason cut to
 * REFUSED_MAX), its counts, the removed pages' object numbers it appended and the empty stream's; or `{ over: true }`.
 * null where they pass ENTRIES_CAP or ENTRIES_VALUES
 */
export function encodeEntries(o) {
  const text = o.over === true ? '{"v":1,"over":true}' : JSON.stringify({ v: 1, page: o.page, stats: o.stats, kids: o.kids, empty: o.empty })
  if (text.length > ENTRIES_CAP) return null
  const bytes = utf8.encode(text)
  if (bytes.length > ENTRIES_CAP || countValues(text, ENTRIES_VALUES, ENTRIES_DEPTH) > ENTRIES_VALUES) return null
  return bytes
}

/**
 * An answer's entries read within bounds (the prepare side): bytes, UTF-8, values and nesting before JSON.parse, then the
 * shape: `{ over: true }`, or { page (page -> { ok: true, units (id -> boxes, numbers stride 4 within ±COORD_MAX), at: { R } }
 * or { ok: false, refused (1 to REFUSED_MAX code units) }), stats (the seven counts), kids (object numbers), empty (one, or
 * null) }. What they must agree with (the pages asked, the chain) is the caller's (layout/chain.mjs). Throws LayoutRefusal
 */
export function readEntries(bytes) {
  if (!(bytes instanceof Uint8Array)) throw refuse('', `not bytes (${kindOf(bytes)})`)
  const v = boundedJson(bytes, { cap: ENTRIES_CAP, values: ENTRIES_VALUES, depth: ENTRIES_DEPTH })
  if (isObject(v) && Object.hasOwn(v, 'over')) {
    exact(v, ['v', 'over'], '')
    if (v.v !== 1 || v.over !== true) throw refuse('over', 'not version 1\'s true')
    return { over: true }
  }
  exact(v, ['v', 'page', 'stats', 'kids', 'empty'], '')
  if (v.v !== 1) throw refuse('v', 'not 1')
  if (!isObject(v.page)) throw refuse('page', `not an object (${kindOf(v.page)})`)
  for (const k of Object.keys(v.page)) {
    const path = `page.${told(k)}`
    if (!PAGE_KEY.test(k)) throw refuse(path, 'not a page')
    const e = v.page[k]
    if (!isObject(e) || typeof e.ok !== 'boolean') throw refuse(path, `not an entry (${kindOf(e)})`)
    if (e.ok) {
      exact(e, ['ok', 'units', 'at'], path)
      if (!isObject(e.units)) throw refuse(`${path}.units`, `not an object (${kindOf(e.units)})`)
      for (const id of Object.keys(e.units)) {
        const boxes = e.units[id], bp = `${path}.units.${told(id)}`
        if (!UNIT_KEY.test(id)) throw refuse(bp, 'not a unit\'s id')
        if (!Array.isArray(boxes) || boxes.length % 4 !== 0) throw refuse(bp, `not boxes of 4 numbers (${kindOf(boxes)})`)
        for (let i = 0; i < boxes.length; i++) if (!isNumber(boxes[i]) || Math.abs(boxes[i]) > COORD_MAX) throw refuse(`${bp}[${i}]`, `not a number within ±${COORD_MAX}`)
      }
      if (!isInteger(exact(e.at, ['R'], `${path}.at`).R, 1, 2 * PAGES_MAX)) throw refuse(`${path}.at.R`, 'not a page of the document')
    } else {
      exact(e, ['ok', 'refused'], path)
      if (typeof e.refused !== 'string' || e.refused.length < 1 || e.refused.length > REFUSED_MAX) throw refuse(`${path}.refused`, `not 1 to ${REFUSED_MAX} code units (${kindOf(e.refused)})`)
    }
  }
  const stats = exact(v.stats, REMOVER_STATS, 'stats')
  for (const k of REMOVER_STATS) if (!isInteger(stats[k], 0, Number.MAX_SAFE_INTEGER)) throw refuse(`stats.${k}`, 'not a count')
  integers(list(v.kids, PAGES_MAX, 'kids'), 1, OBJECT_MAX, 'kids')
  if (v.empty !== null && !isInteger(v.empty, 1, OBJECT_MAX)) throw refuse('empty', 'not an object number, or null')
  return { over: false, page: v.page, stats, kids: v.kids, empty: v.empty }
}
