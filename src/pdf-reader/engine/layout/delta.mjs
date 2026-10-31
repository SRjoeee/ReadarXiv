// Our base page as a PDF incremental update over arXiv's original (the delta; the coordinator's GO of 2026-10-23, the
// contract's §2 to §4 and §14): the composed document is arXiv's bytes followed by the delta (and then the remover's tails),
// so that the layer's composed document and the left pane read ONE byte source, and only what our compile changed is stored.
//
// deltaOf(orig, final): for each page the layer lays on (`replacedPages`, every page of ours by default) whose content differs
// from arXiv's, the original's page object written again under its own number and generation, every key kept but /Contents and
// /Resources, which are ours: our content streams copied byte for byte as new objects, and a /Resources dict of our page's
// entries each mapped to the original's object where the two are canonically equal (the whole sub-graph reused: a font with its
// descriptor, font file, widths and ToUnicode; an image with its SMask), else copied with its closure under new numbers from
// the original's /Size up. Resource names stay ours (they live in the page's dict alone, so no content stream is rewritten).
// Nothing else: the page tree, outlines, destinations, annotations and info stay the original's, and so does the catalog but
// for our /OCProperties where our pages are wrapped by optional content (layout/wrap.mjs): the catalog is then written again,
// every key the original's but that one.
//
// Canonical form (one Merkle form for both documents, exact): a stream is its dict without /Length and its stored bytes, those
// its RESOLVED /Length names (layout/xref.mjs: PDF.js's reading, never a scan to `endstream`), no decoding; a dict is its
// entries sorted by key, an array its items, each reference replaced by the referenced object's form; the back links /Parent,
// /P, /Prev, /Next, /First and /Last are cut; a reference cycle (or a chain deeper than DEPTH_MAX) leaves the object unmatched,
// so copied, never an error. Forms are interned to integers (exact text equality, no digest collision), stream data by its
// bytes. The same inputs give the same bytes: no time, no random number, a fixed order.
//
// proveDelta: the structural proof the box runs before a head names a delta (the contract's §14.2), with the engine's PDF.js:
// the delta's section exact (deltaSection: every entry at its `n g obj`, /Prev the original's startxref, startxref at the
// section), the composed page graphs canonically ours on replaced pages and the original's elsewhere (a second, independent
// parse), PDF.js opening the composed bytes with no message neither source gives alone (a message read with its document's own
// id set aside, where PDF.js writes it into an object's name: each document opened takes the process's next), the page count
// the original's, every page box and every page's text items (layout/page-text.mjs: exactly, every field of every item) ours
// on replaced pages and the original's elsewhere. The two sources' texts are the host's own readings where it gives them (`readers`: documents the proof
// opens of its own bytes and hands to the host, which reads them and keeps them for the page pass, so that each is read once),
// else read here; the composed document is always read here. No operator list and no pixel: those are the lab's gate.
//
// An original module (no port statement). It imports the object layer's reading (xref.mjs), the section writer, the delta's
// wire and the memory-class test; @cantoo/pdf-lib (MIT) and PDF.js are given.
import { isMemoryError } from '../pipeline/memory.mjs'
import { textRecordDiffers, textRecordOf } from './page-text.mjs'
import { DELTA_MAX_BYTES, DELTA_MAX_SHARE, DELTA_OBJECTS_MAX, deltaSection, pagesOf, rangesOf } from './delta-wire.mjs'
import { appendSection } from './section.mjs'
import { OBJECT_MAX, startxrefOf } from './tail.mjs'
import { openObjects, XrefRefusal } from './xref.mjs'

/** the canonical forms' text the builder holds at most (each distinct form once), and the bytes its object and cross-reference
 *  streams decode to at most, per document (as the remover's HELD_MAX and BYTES_MAX bound its walk) */
export const DELTA_HELD_MAX = 64 * 2 ** 20, DELTA_DECODED_MAX = 48 * 2 ** 20
/** the builder's work at most, in bytes hashed or compared and objects read (each counted as 16): past it the delta is refused
 *  (`delta-bound`), so that no input makes the build run long (the 46 MB pair spends about 150 million) */
export const DELTA_WORK_MAX = 2 ** 31
/** a work budget: spend(n) past `max` refuses */
const budget = max => { let spent = 0; return { spend: n => { spent += n; if (spent > max) throw new XrefRefusal('delta-bound', `more than ${max} of work`) }, spent: () => spent } }
/** a reference chain deeper than this is not followed for the canonical form: the object stays unmatched */
const DEPTH_MAX = 256
/** a copied closure deeper than this is refused (`delta-bound`) before the stack is */
const COPY_DEPTH_MAX = 1024
/**
 * The keys cut from the canonical form and the proof's graph: the back links of the structures that have them, decided by the
 * dict's own context, never by its value being a reference — /Parent of a page-tree node; /P and /Parent of an annotation; /P
 * of a structure element; /Parent, /Prev, /Next, /First and /Last of the outline and its items. Nothing else is cut: an
 * optional-content membership's /P policy (direct or by reference), /OCGs and /VE are data, and so is every key of a dict of
 * no context above (a reference cycle there leaves the object unmatched, copied, never wrong)
 */
const NONE = new Set(), PARENT = new Set(['/Parent']), ANNOT = new Set(['/P', '/Parent']), ELEM = new Set(['/P'])
const OUTLINE = new Set(['/Parent', '/Prev', '/Next', '/First', '/Last'])
function backLinksOf(PL, d) {
  const name = k => { const v = d.get(PL.PDFName.of(k)); return v instanceof PL.PDFName ? v.asString() : null }
  const type = name('Type')
  if (type === '/OCMD' || type === '/OCG') return NONE
  if (type === '/Page' || type === '/Pages') return PARENT
  if (type === '/Annot' || (type === null && d.get(PL.PDFName.of('Subtype')) instanceof PL.PDFName && d.get(PL.PDFName.of('Rect')) instanceof PL.PDFArray)) return ANNOT
  if (type === '/StructElem') return ELEM
  if (type === '/Outlines' || (type === null && d.get(PL.PDFName.of('Title')) !== undefined && d.get(PL.PDFName.of('Parent')) !== undefined)) return OUTLINE
  return NONE
}
/** the page tree's own objects: a resource closure never copies them (a back link into the tree is written null) */
const TREE = new Set(['/Page', '/Pages', '/Catalog'])
const HEX = Array.from({ length: 256 }, (_, v) => v.toString(16).padStart(2, '0'))
const hexOf = b => { let s = ''; for (let i = 0; i < b.length; i++) s += HEX[b[i]]; return s }
const enc = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b }
const concat = parts => { let n = 0; for (const p of parts) n += p.length; const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }
const equalBytes = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true }
/** two lanes of a multiplicative hash of the bytes from secret random seeds (a bucket's key alone: equality is the bytes'): an
 *  input cannot be made of streams that share one key, as it could against a fixed FNV (4,096 colliding streams, 47 s) */
function keyedHash() {
  const seed = new Uint32Array(2)
  globalThis.crypto.getRandomValues(seed)
  return b => {
    let h1 = seed[0] ^ 0x811c9dc5, h2 = seed[1] ^ 0x9e3779b9
    for (let i = 0; i < b.length; i++) { h1 = Math.imul(h1 ^ b[i], 0x01000193); h2 = Math.imul(h2 ^ b[i], 0x5bd1e995) ^ (h2 >>> 15) }
    return `${h1 >>> 0}.${h2 >>> 0}`
  }
}

async function sha256Of(bytes) {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
  return hexOf(d)
}

/** the canonical forms, interned across the documents read: `of(doc)` gives a document's { ofRef, ser }. An optional-content
 *  group or membership (/Type /OCG, /OCMD) is matched by its identity alone: by reference, a form of its document and object;
 *  direct, none (unmatched, copied) */
function canonical(PL, heldMax, work) {
  const isOC = v => v instanceof PL.PDFDict && ['/OCG', '/OCMD'].includes(v.get(PL.PDFName.of('Type'))?.asString?.())
  const { PDFRef, PDFDict, PDFArray, PDFRawStream, PDFName, PDFNumber, PDFString, PDFHexString, PDFBool, PDFNull } = PL
  const texts = new Map(), buckets = new Map(), hash = keyedHash()
  let held = 0
  const intern = s => {
    let id = texts.get(s)
    if (id === undefined) {
      held += s.length + 64
      if (held > heldMax) throw new XrefRefusal('delta-bound', `more than ${heldMax} bytes of canonical forms`)
      id = texts.size
      texts.set(s, id)
    }
    return id
  }
  const dataId = data => {
    work.spend(data.length)
    const key = `${data.length}:${hash(data)}`
    let list = buckets.get(key)
    if (!list) buckets.set(key, (list = []))
    for (const [d, id] of list) { work.spend(data.length); if (equalBytes(d, data)) return id }
    const id = intern(`D${key}#${list.length}`)
    list.push([data, id])
    return id
  }
  // (a dict, an array or a stream is its form's token, `@<id>`, direct or reached by a reference alike: a resource written
  // inline in one document and as an object in the other is the same; a reference to a number, a name… is that value's form)
  let docs = 0
  function of(doc) {
    const memo = new Map(), busy = new Set(), seq = docs++
    const ofRef = (ref, depth = 0) => {
      const k = `${ref.objectNumber} ${ref.generationNumber}`
      if (memo.has(k)) return memo.get(k)
      if (busy.has(k) || depth > DEPTH_MAX) return null
      busy.add(k)
      let token
      try {
        const obj = doc.lookup(ref)
        // (an optional-content group or membership is its object, never its content: two of equal dicts, one ON and one OFF,
        // are two layers, and nothing that names one is another document's)
        token = obj === undefined ? 'null' : obj instanceof PDFRef ? null : isOC(obj) ? `@${intern(`OC${seq}:${k}`)}` : ser(obj, depth + 1)
      } finally { busy.delete(k) }
      memo.set(k, token)
      return token
    }
    const serDict = (d, isStream, depth, drop = null) => {
      const cut = backLinksOf(PL, d)
      const entries = d.entries().map(([k, v]) => [k.asString(), v]).filter(([k]) => !cut.has(k) && !(isStream && k === '/Length') && !drop?.has(k)).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      const parts = []
      for (const [k, v] of entries) { const s = ser(v, depth); if (s === null) return null; parts.push(`${k} ${s}`) }
      return `<<${parts.join(' ')}>>`
    }
    const token = text => (text === null ? null : `@${intern(text)}`)
    function ser(v, depth = 0, drop = null) {
      work.spend(16)
      if (v instanceof PDFRef) return ofRef(v, depth)
      if (v instanceof PDFRawStream) { const d = serDict(v.dict, true, depth); return d === null ? null : token(`S${d}#${dataId(v.contents)}`) }
      if (v instanceof PDFDict) return isOC(v) ? null : token(serDict(v, false, depth, drop))
      if (v instanceof PDFArray) {
        const parts = []
        for (const x of v.asArray()) { const s = ser(x, depth); if (s === null) return null; parts.push(s) }
        return token(`[${parts.join(' ')}]`)
      }
      if (v instanceof PDFName) return v.asString()
      if (v instanceof PDFNumber) return `n${v.asNumber()}`
      if (v instanceof PDFString || v instanceof PDFHexString) return `x${hexOf(v.asBytes())}`
      if (v instanceof PDFBool) return `b${v.asBoolean()}`
      if (v === PDFNull || v === undefined) return 'null'
      return null
    }
    return { ofRef, ser }
  }
  return { of }
}

/**
 * The layers of the two documents (the delta's and its proof's): `orig` arXiv's /OCProperties dict (or null), `ours` our groups
 * (`axt:` named, in our /OCGs' order), `pairs` [our compile's own layer, arXiv's] by their place in each /OCGs, the paper's own
 * layers alone; `why` where they do not pair (as many, each of the same name)
 */
function layersOf(PL, O, U) {
  const { PDFDict, PDFArray, PDFRef, PDFName } = PL
  const look = (D, v) => (v instanceof PDFRef ? D.lookup(v) : v)
  const ocp = D => { const c = look(D, D.trailer.root); const o = c instanceof PDFDict ? look(D, c.get(PDFName.of('OCProperties'))) : undefined; return o instanceof PDFDict ? o : null }
  const list = (D, o) => { const a = o ? look(D, o.get(PDFName.of('OCGs'))) : undefined; return a instanceof PDFArray ? a.asArray() : [] }
  const nameOf = (D, r) => { const g = look(D, r); const n = g instanceof PDFDict ? g.get(PDFName.of('Name')) : undefined; return n?.decodeText?.() ?? null }
  const oo = ocp(O), uo = ocp(U)
  const origs = list(O, oo), mine = list(U, uo)
  const ours = mine.filter(r => /^axt:/.test(nameOf(U, r) ?? '')), own = mine.filter(r => !/^axt:/.test(nameOf(U, r) ?? ''))
  // (a pair is one layer only where each side names it alike, by a name no other of its layers has, at the same default state
  // (/D's /BaseState, /ON, /OFF) and with the same /Intent and /Usage: two layers of one name are never paired by their place)
  const stateOf = (D, o) => {
    const d = o ? look(D, o.get(PDFName.of('D'))) : undefined
    const refs = k => new Set((look(D, d?.get?.(PDFName.of(k))) instanceof PDFArray ? look(D, d.get(PDFName.of(k))).asArray() : []).filter(r => r instanceof PDFRef).map(r => `${r.objectNumber} ${r.generationNumber}`))
    const on = refs('ON'), off = refs('OFF'), base = d?.get?.(PDFName.of('BaseState'))?.asString?.() ?? '/ON'
    return r => { const k = `${r.objectNumber} ${r.generationNumber}`; return on.has(k) ? 'ON' : off.has(k) ? 'OFF' : base === '/OFF' ? 'OFF' : base === '/Unchanged' ? 'ON' : 'ON' }
  }
  const plain = (D, v, depth = 0) => {
    const x = look(D, v)
    if (depth > 8) return '?'
    if (x instanceof PDFDict) return `<<${x.entries().map(([k, y]) => [k.asString(), plain(D, y, depth + 1)]).sort((p, q) => (p[0] < q[0] ? -1 : 1)).map(([k, y]) => `${k} ${y}`).join(' ')}>>`
    if (x instanceof PDFArray) return `[${x.asArray().map(y => plain(D, y, depth + 1)).join(' ')}]`
    return x === undefined ? 'none' : x.toString()
  }
  const facts = (D, r, state) => { const g = look(D, r); return `${nameOf(D, r)}|${state(r)}|${plain(D, g?.get?.(PDFName.of('Intent')))}|${plain(D, g?.get?.(PDFName.of('Usage')))}` }
  if (own.length) {
    const su = stateOf(U, uo), so = stateOf(O, oo)
    const unique = (D, list) => new Set(list.map(r => nameOf(D, r))).size === list.length
    if (own.length !== origs.length || !unique(U, own) || !unique(O, origs) || own.some((r, i) => !(r instanceof PDFRef) || !(origs[i] instanceof PDFRef) || facts(U, r, su) !== facts(O, origs[i], so))) return { why: 'the paper\'s own layers in our compile do not pair with arXiv\'s (as many, names unique, each pair one name, state, intent and usage)', ours: [], pairs: [], orig: oo }
  }
  return { orig: oo, ours, pairs: own.map((r, i) => [r, origs[i]]) }
}

/** the pages (1-based) of a document whose /Properties name a group of ours (`/axt…` to an OCG named `axt:…`): our wrapped pages */
export function wrappedPagesOf(PL, D) {
  const { PDFDict, PDFRef, PDFName } = PL
  const look = v => (v instanceof PDFRef ? D.lookup(v) : v)
  const out = []
  D.pages().forEach((page, i) => {
    const r = look(page.inherited.Resources), props = r instanceof PDFDict ? look(r.get(PDFName.of('Properties'))) : undefined
    if (props instanceof PDFDict && props.entries().some(([k, v]) => /^\/axt/.test(k.toString()) && /^axt:/.test(look(v)?.get?.(PDFName.of('Name'))?.decodeText?.() ?? ''))) out.push(i + 1)
  })
  return out
}

/** the PDF text of a value, each reference written by `mapRef` (ref -> text) */
function litOf(PL) {
  const { PDFRef, PDFDict, PDFArray } = PL
  const lit = (v, mapRef) => {
    if (v instanceof PDFRef) return mapRef(v)
    if (v instanceof PDFDict) return `<<${v.entries().map(([k, x]) => ` ${k.toString()} ${lit(x, mapRef)}`).join('')} >>`
    if (v instanceof PDFArray) return `[${v.asArray().map(x => lit(x, mapRef)).join(' ')}]`
    return v.toString()
  }
  return lit
}
const sameRef = r => `${r.objectNumber} ${r.generationNumber} R`

/** a page's content streams' refs ([] for none), its /Contents a stream's ref or an array (direct or not) of them */
function contentsOf(PL, doc, node) {
  const { PDFArray, PDFRef, PDFName } = PL
  const c = node.get(PDFName.of('Contents'))
  if (c === undefined) return []
  const v = c instanceof PDFRef ? doc.lookup(c) : c
  if (v instanceof PDFArray) return v.asArray()
  return [c]
}

/**
 * A page's geometry as PDF.js reads it (its `view`, `rotate`, `userUnit`): the CropBox (else the MediaBox) clipped to the
 * MediaBox, both inherited, normalized; the rotation a multiple of 90 within 0 to 270; the user unit a positive number, else 1.
 * A replaced page keeps the original's page dict but these, so ours must read as the original's (null: a box that is not one)
 */
function geometryOf(PL, doc, page) {
  const look = v => (v instanceof PL.PDFRef ? doc.lookup(v) : v)
  const box = v => { const a = look(v); if (!(a instanceof PL.PDFArray) || a.size() !== 4) return null; const n = a.asArray().map(x => look(x)?.asNumber?.()); return n.every(Number.isFinite) ? [Math.min(n[0], n[2]), Math.min(n[1], n[3]), Math.max(n[0], n[2]), Math.max(n[1], n[3])] : null }
  const media = box(page.inherited.MediaBox) ?? [0, 0, 612, 792]
  const crop = box(page.inherited.CropBox)
  const view = crop ? [Math.max(crop[0], media[0]), Math.max(crop[1], media[1]), Math.min(crop[2], media[2]), Math.min(crop[3], media[3])] : media
  const r = look(page.inherited.Rotate)?.asNumber?.() ?? 0
  const rotate = Number.isInteger(r) && r % 90 === 0 ? ((r % 360) + 360) % 360 : 0
  const u = look(page.node.get(PL.PDFName.of('UserUnit')))?.asNumber?.()
  return { view, rotate, userUnit: Number.isFinite(u) && u > 0 ? u : 1 }
}
const sameGeometry = (a, b) => a.rotate === b.rotate && a.userUnit === b.userUnit && a.view.every((v, i) => Math.abs(v - b.view[i]) <= 0.01)

/** a refusal: the code (delta-wire.mjs DELTA_WHYS) and its why */
const refusal = (code, why) => ({ refused: code, why: String(why).slice(0, 300) })
const refusalOf = e => {
  if (isMemoryError(e)) throw e
  return e instanceof XrefRefusal ? refusal(e.code, e.message) : refusal('delta-parse', `it could not be read: ${String(e?.message ?? e)}`)
}

/**
 * The delta of our final pass over arXiv's PDF. `origBytes` arXiv's PDF as the head's `orig` names it; `finalBytes` our final
 * pass (the base page the layout was made over); `PL` @cantoo/pdf-lib's exports; `replacedPages` the pages the layer lays on
 * (1-based, within our pages; null: every page of ours), of which those whose content and resources are canonically arXiv's
 * are left alone. Our pages may be fewer than arXiv's (a paper of several toplevel sources, the first compiled alone): the
 * pages past ours are the original's by construction. Returns { delta, sha256, replaced, stats, xref, kind, size } — `delta`
 * the section's bytes (to follow arXiv's exactly), `sha256` theirs, `replaced` the pages written as ranges (delta-wire.mjs),
 * `stats` { replaced, reused: { fonts, images, forms, other }, included: { bytes, objects } } (the original's objects our
 * resources name at their top, by kind; the objects the delta writes, pages included, and their bytes), `xref` the section's
 * startxref in the composed document, `kind` its cross-reference's ('table' or 'stream', the original's), `size` its /Size
 * (the next free number: the remover's first tail's) — or a refusal { refused, why } (DELTA_WHYS), for the host to keep the
 * whole base (`full`). Never throws but a failed allocation
 */
export async function deltaOf(origBytes, finalBytes, { PL, replacedPages = null, heldMax = DELTA_HELD_MAX, decodedMax = DELTA_DECODED_MAX, objectsMax = DELTA_OBJECTS_MAX, workMax = DELTA_WORK_MAX }) {
  if (!(origBytes instanceof Uint8Array) || !(finalBytes instanceof Uint8Array)) throw new TypeError('origBytes, finalBytes: the two PDFs\' bytes')
  try {
    const { PDFRef, PDFDict, PDFRawStream, PDFName } = PL
    const O = openObjects(origBytes, { PL, objectsMax, decodedMax })
    const U = openObjects(finalBytes, { PL, objectsMax, decodedMax })
    const C = canonical(PL, heldMax, budget(workMax)), OC = C.of(O), UC = C.of(U)
    const lit = litOf(PL)
    const oPages = O.pages(), uPages = U.pages()
    const N = oPages.length, M = uPages.length
    if (M > N) return refusal('delta-pages', `our final pass has ${M} pages, arXiv's PDF ${N}`)
    const laid = replacedPages ?? Array.from({ length: M }, (_, i) => i + 1)
    if (!Array.isArray(laid) || laid.some(p => !Number.isInteger(p) || p < 1 || p > M)) return refusal('delta-pages', `a page to replace that is not one of our ${M}`)

    // the original's index: every object it holds by its form, the least number of each form (its object and cross-reference
    // streams aside: their numbers are the file's, not a resource's)
    const index = new Map()
    for (const n of O.numbers()) {
      const e = O.entryOf(n), ref = PDFRef.of(n, e.t === 1 ? e.g : 0), obj = O.lookup(ref)
      if (obj instanceof PDFRawStream) { const t = obj.dict.get(PDFName.of('Type')); if (t === PDFName.of('XRef') || t === PDFName.of('ObjStm')) continue }
      const id = OC.ofRef(ref)
      if (id !== null && id[0] === '@' && !index.has(id)) index.set(id, ref)
    }

    const look = (doc, v) => (v instanceof PDFRef ? doc.lookup(v) : v)
    const pageForm = (doc, Cn, page) => {
      const cs = contentsOf(PL, doc, page.node).map(r => Cn.ser(r))
      const rs = Cn.ser(page.inherited.Resources ?? PL.PDFNull)
      return cs.some(x => x === null) || rs === null ? null : `${cs.join(',')}|${rs}`
    }
    let next = O.size
    const reused = { fonts: 0, images: 0, forms: 0, other: 0 }, reusedTop = new Set()
    const objects = [], pageObjects = [], mapped = new Map()
    const reuse = (or, cat, top) => {
      if (top && !reusedTop.has(or.objectNumber)) { reusedTop.add(or.objectNumber); reused[cat]++ }
      return sameRef(or)
    }
    // (our object `r`, or the original's of its form: copied with its closure, each object once, under the next number)
    const copyRef = (r, cat, top, depth = 0) => {
      if (depth > COPY_DEPTH_MAX) throw new XrefRefusal('delta-bound', `a resource closure deeper than ${COPY_DEPTH_MAX}`)
      const id = UC.ofRef(r)
      if (id !== null && index.has(id)) return reuse(index.get(id), cat, top)
      const key = `${r.objectNumber} ${r.generationNumber}`
      if (mapped.has(key)) return mapped.get(key)
      const o = U.lookup(r)
      if (o === undefined) return 'null'
      const d = o instanceof PDFRawStream ? o.dict : o
      if (d instanceof PDFDict && TREE.has(d.get(PDFName.of('Type'))?.asString?.())) return 'null'
      const n = next++
      const s = `${n} 0 R`
      mapped.set(key, s)
      const sub = x => copyRef(x, cat, false, depth + 1)
      let bytes
      if (o instanceof PDFRawStream) {
        const entries = o.dict.entries().filter(([k]) => k.asString() !== '/Length').map(([k, x]) => ` ${k.toString()} ${lit(x, sub)}`).join('')
        bytes = concat([enc(`${n} 0 obj\n<<${entries} /Length ${o.contents.length} >>\nstream\n`), o.contents, enc('\nendstream\nendobj\n')])
      } else bytes = enc(`${n} 0 obj\n${lit(o, sub)}\nendobj\n`)
      objects.push([n, 0, bytes])
      return s
    }
    const CATS = { '/Font': 'fonts', '/XObject': null }
    const xobjectCat = x => { const o = look(U, x); const st = o instanceof PDFRawStream ? o.dict.get(PDFName.of('Subtype'))?.asString?.() : undefined; return st === '/Image' ? 'images' : st === '/Form' ? 'forms' : 'other' }
    const resourcesText = resVal => {
      if (resVal instanceof PDFRef) { const id = UC.ofRef(resVal); if (id !== null && index.has(id)) return reuse(index.get(id), 'other', true) }
      const d = look(U, resVal)
      if (!(d instanceof PDFDict)) return '<< >>'
      const out = []
      for (const [k, v] of d.entries()) {
        const key = k.toString(), cat = Object.hasOwn(CATS, k.asString()) ? CATS[k.asString()] : 'other'
        const sub = look(U, v)
        if (k.asString() === '/ProcSet' || !(sub instanceof PDFDict)) { out.push(` ${key} ${lit(v, x => copyRef(x, cat ?? 'other', true))}`); continue }
        if (v instanceof PDFRef) { const id = UC.ofRef(v); if (id !== null && index.has(id)) { out.push(` ${key} ${reuse(index.get(id), cat ?? 'other', true)}`); continue } }
        const ents = sub.entries().map(([nm, x]) => { const c = cat ?? xobjectCat(x); return ` ${nm.toString()} ${x instanceof PDFRef ? copyRef(x, c, true) : lit(x, y => copyRef(y, c, true))}` })
        out.push(` ${key} <<${ents.join('')} >>`)
      }
      return `<<${out.join('')} >>`
    }

    // the layers: the paper's own of our compile paired by their place with arXiv's (the same source, the same layers), so that a
    // replaced page names arXiv's objects and arXiv's unreplaced pages keep theirs listed; ours (`axt:`) appended, copied
    const layers = layersOf(PL, O, U)
    if (layers.why) return refusal('delta-proof', layers.why)
    for (const [u, o] of layers.pairs) mapped.set(`${u.objectNumber} ${u.generationNumber}`, sameRef(o))
    const replaced = []
    for (const p of [...new Set(laid)].sort((a, b) => a - b)) {
      const op = oPages[p - 1], up = uPages[p - 1]
      const a = pageForm(O, OC, op), b = pageForm(U, UC, up)
      if (a !== null && a === b) continue
      if (!sameGeometry(geometryOf(PL, O, op), geometryOf(PL, U, up))) return refusal('delta-boxes', `page ${p} of ours is not arXiv's page box, rotation or user unit`)
      replaced.push(p)
      const contents = contentsOf(PL, U, up.node).map(r => (r instanceof PDFRef ? copyRef(r, 'other', true) : 'null'))
      const ctext = contents.length === 1 ? contents[0] : `[${contents.join(' ')}]`
      const res = resourcesText(up.inherited.Resources)
      const ents = []
      let hadRes = false, hadContents = false
      for (const [k, v] of op.node.entries()) {
        const key = k.asString()
        if (key === '/Contents') { hadContents = true; ents.push(` /Contents ${ctext}`) }
        else if (key === '/Resources') { hadRes = true; ents.push(` /Resources ${res}`) }
        else ents.push(` ${k.toString()} ${lit(v, sameRef)}`)
      }
      if (!hadRes) ents.push(` /Resources ${res}`)
      if (!hadContents) ents.push(` /Contents ${ctext}`)
      pageObjects.push([op.ref.objectNumber, op.ref.generationNumber, enc(`${op.ref.objectNumber} ${op.ref.generationNumber} obj\n<<${ents.join('')} >>\nendobj\n`)])
    }
    if (replaced.length === 0) return refusal('delta-empty', 'no page of ours differs from arXiv\'s where the layer lays')
    // (every page of ours that names a group of ours written again: a unit's group on a page left arXiv's could not be hidden)
    const repSet = new Set(replaced), left = wrappedPagesOf(PL, U).find(p => !repSet.has(p))
    if (left !== undefined) return refusal('delta-pages', `page ${left} of ours names a group of ours and is not replaced`)
    // our pages wrapped by optional content (layout/wrap.mjs): the catalog's /OCProperties, and that key alone, carried into the
    // original's catalog, written again under its number (its groups the objects our pages' /Properties name, copied once)
    if (layers.ours.length) {
      const rootRef = O.trailer.root, cat = look(O, rootRef)
      if (!(rootRef instanceof PDFRef) || !(cat instanceof PDFDict)) return refusal('delta-parse', 'arXiv\'s catalog is no object of its own')
      const ents = cat.entries().filter(([k]) => k.asString() !== '/OCProperties').map(([k, v]) => ` ${k.toString()} ${lit(v, sameRef)}`)
      // (arXiv's /OCProperties as it is, its /OCGs and its default's /ON with ours appended: arXiv's layers keep their state)
      const ours = layers.ours.map(r => copyRef(r, 'other', false)).join(' ')
      const oc = layers.orig
      let text
      if (oc) {
        const D = look(O, oc.get(PDFName.of('D')))
        const arr = v => { const a = look(O, v); return a instanceof PL.PDFArray ? a.asArray().map(x => lit(x, sameRef)).join(' ') : '' }
        const dEnts = D instanceof PDFDict ? D.entries().filter(([k]) => k.asString() !== '/ON').map(([k, v]) => ` ${k.toString()} ${lit(v, sameRef)}`).join('') : ''
        const oEnts = oc.entries().filter(([k]) => k.asString() !== '/OCGs' && k.asString() !== '/D').map(([k, v]) => ` ${k.toString()} ${lit(v, sameRef)}`).join('')
        text = `<< /OCGs [${arr(oc.get(PDFName.of('OCGs')))} ${ours}] /D <<${dEnts} /ON [${D instanceof PDFDict ? arr(D.get(PDFName.of('ON'))) : ''} ${ours}] >>${oEnts} >>`
      } else text = `<< /OCGs [${ours}] /D << /BaseState /ON /ON [${ours}] /Order [] >> >>`
      ents.push(` /OCProperties ${text}`)
      pageObjects.push([rootRef.objectNumber, rootRef.generationNumber, enc(`${rootRef.objectNumber} ${rootRef.generationNumber} obj\n<<${ents.join('')} >>\nendobj\n`)])
    }
    const all = [...pageObjects, ...objects]
    if (all.length > objectsMax) return refusal('delta-bound', `${all.length} objects, past ${objectsMax}`)
    const written = appendSection({ end: origBytes.length, objects: all, kind: O.kind, prev: O.startxref, size: next, trailer: { root: O.trailer.root, info: O.trailer.info, id: O.trailer.id } })
    const delta = written.bytes
    if (written.size > OBJECT_MAX + 1) return refusal('delta-bound', `its /Size ${written.size} is past PDF's object numbers (${OBJECT_MAX})`)
    if (delta.length > DELTA_MAX_BYTES) return refusal('delta-bound', `${delta.length} bytes, past ${DELTA_MAX_BYTES}`)
    if (delta.length > DELTA_MAX_SHARE * finalBytes.length) return refusal('delta-bound', `${delta.length} bytes, past ${DELTA_MAX_SHARE} of our base page's ${finalBytes.length}`)
    let included = 0
    for (const [, , b] of all) included += b.length
    const stats = { replaced: replaced.length, reused, included: { bytes: included, objects: all.length } }
    return { delta, sha256: await sha256Of(delta), replaced: rangesOf(replaced), stats, xref: written.xref, kind: O.kind, size: written.size }
  } catch (e) {
    return refusalOf(e)
  }
}

/**
 * Whether two values of two documents are one graph (the proof's second reading): a reference and the value it names alike,
 * streams by their dicts less /Length and their exact bytes, dicts by their keys (less the back links and `drop`), arrays by
 * their items, the rest by their text; a pair of references met again is taken as equal (so a cycle compares as the graphs it
 * makes, where the canonical form gives none), each side by its reference or its direct value's identity
 */
function sameGraph(PL) {
  const { PDFRef, PDFDict, PDFArray, PDFRawStream, PDFName, PDFNumber, PDFString, PDFHexString } = PL
  return (A, a0, B, b0, drop0 = null) => {
    // (a pair met again is taken as equal: each side named by its reference, or by the identity of its direct value, so that two
    // direct values met against one reference are each compared)
    const met = new Set(), ids = new WeakMap()
    let nextId = 0
    const idOf = v => (v instanceof PDFRef ? `R${v.objectNumber} ${v.generationNumber}` : v !== null && typeof v === 'object' ? `o${ids.get(v) ?? (ids.set(v, ++nextId), nextId)}` : `v${String(v)}`)
    const leaf = v => (v instanceof PDFName ? v.asString() : v instanceof PDFNumber ? `n${v.asNumber()}` : v instanceof PDFString || v instanceof PDFHexString ? `x${hexOf(v.asBytes())}` : v === undefined ? 'null' : String(v))
    const eq = (a, b, drop = null, depth = 0) => {
      if (depth > 4 * DEPTH_MAX) return false
      if (a instanceof PDFRef || b instanceof PDFRef) {
        const key = `${idOf(a)}|${idOf(b)}`
        if (met.has(key)) return true
        met.add(key)
        return eq(a instanceof PDFRef ? A.lookup(a) : a, b instanceof PDFRef ? B.lookup(b) : b, drop, depth + 1)
      }
      if (a instanceof PDFRawStream || b instanceof PDFRawStream) return a instanceof PDFRawStream && b instanceof PDFRawStream && equalBytes(a.contents, b.contents) && eq(a.dict, b.dict, new Set(['/Length']), depth + 1)
      if (a instanceof PDFDict || b instanceof PDFDict) {
        if (!(a instanceof PDFDict && b instanceof PDFDict)) return false
        const entries = d => { const cut = backLinksOf(PL, d); return new Map(d.entries().map(([k, v]) => [k.asString(), v]).filter(([k]) => !cut.has(k) && !drop?.has(k))) }
        const ea = entries(a), eb = entries(b)
        return ea.size === eb.size && [...ea].every(([k, v]) => eb.has(k) && eq(v, eb.get(k), null, depth + 1))
      }
      if (a instanceof PDFArray || b instanceof PDFArray) return a instanceof PDFArray && b instanceof PDFArray && a.size() === b.size() && a.asArray().every((x, i) => eq(x, b.get(i), null, depth + 1))
      return leaf(a) === leaf(b)
    }
    return eq(a0, b0, drop0)
  }
}

/**
 * Whether two direct values are the same text of PDF: dicts key by key, arrays item by item, leaves as sameGraph reads them, and
 * a reference by its number and generation, never by what it names. What the delta writes again of the original's catalog is
 * its keys' text, references as they are (deltaOf's `lit`, sameRef), and what they name is the composed document's: a name
 * tree's destinations name pages, a replaced one ours (2610.20030's catalog holds its /Names directly)
 */
function sameDirect(PL) {
  const { PDFRef, PDFDict, PDFArray, PDFRawStream, PDFName, PDFNumber, PDFString, PDFHexString } = PL
  const leaf = v => (v instanceof PDFName ? v.asString() : v instanceof PDFNumber ? `n${v.asNumber()}` : v instanceof PDFString || v instanceof PDFHexString ? `x${hexOf(v.asBytes())}` : v === undefined ? 'null' : String(v))
  const eq = (a, b, depth = 0) => {
    if (depth > 4 * DEPTH_MAX) return false
    if (a instanceof PDFRef || b instanceof PDFRef) return a instanceof PDFRef && b instanceof PDFRef && a.objectNumber === b.objectNumber && a.generationNumber === b.generationNumber
    if (a instanceof PDFRawStream || b instanceof PDFRawStream) return false
    if (a instanceof PDFDict || b instanceof PDFDict) {
      if (!(a instanceof PDFDict && b instanceof PDFDict)) return false
      const ea = new Map(a.entries().map(([k, v]) => [k.asString(), v])), eb = new Map(b.entries().map(([k, v]) => [k.asString(), v]))
      return ea.size === eb.size && [...ea].every(([k, v]) => eb.has(k) && eq(v, eb.get(k), depth + 1))
    }
    if (a instanceof PDFArray || b instanceof PDFArray) return a instanceof PDFArray && b instanceof PDFArray && a.size() === b.size() && a.asArray().every((x, i) => eq(x, b.get(i), depth + 1))
    return leaf(a) === leaf(b)
  }
  return eq
}

/** why the composed document's optional content is not ours one to one (null where it is): ours to its by the position of each
 *  in /OCProperties' /OCGs, then by each replaced page's /Properties names; a map that is not a bijection is a merge or a split */
function ocIdentityWhy(PL, U, X, ourOcp, pages) {
  const { PDFRef, PDFDict, PDFArray, PDFName } = PL
  const fwd = new Map(), back = new Map()
  const key = r => `${r.objectNumber} ${r.generationNumber}`
  const pair = (u, x, where) => {
    if (!(u instanceof PDFRef) || !(x instanceof PDFRef)) return u instanceof PDFRef || x instanceof PDFRef ? `${where}: a layer named by reference on one side only` : null
    const a = key(u), b = key(x)
    if ((fwd.has(a) && fwd.get(a) !== b) || (back.has(b) && back.get(b) !== a)) return `${where}: two layers of ours one, or one of ours two`
    fwd.set(a, b)
    back.set(b, a)
    return null
  }
  const look = (D, v) => (v instanceof PDFRef ? D.lookup(v) : v)
  const ocgs = D => { const c = look(D, D.trailer.root), o = c instanceof PDFDict ? look(D, c.get(PDFName.of('OCProperties'))) : undefined, a = o instanceof PDFDict ? look(D, o.get(PDFName.of('OCGs'))) : undefined; return a instanceof PDFArray ? a.asArray() : [] }
  if (ourOcp !== undefined) {
    // (ours, `axt:` named, the last of the composed /OCGs in their order; the paper's own, arXiv's, first, by their place)
    const isOurs = (D, r) => /^axt:/.test(look(D, r)?.get?.(PDFName.of('Name'))?.decodeText?.() ?? '')
    const u = ocgs(U), x = ocgs(X), uo = u.filter(r => isOurs(U, r)), xo = x.filter(r => isOurs(X, r)), un = u.filter(r => !isOurs(U, r)), xn = x.filter(r => !isOurs(X, r))
    if (uo.length !== xo.length || (un.length && un.length !== xn.length)) return 'its /OCGs are not ours one to one'
    for (let i = 0; i < uo.length; i++) { const why = pair(uo[i], xo[i], '/OCGs'); if (why) return why }
    for (let i = 0; i < un.length; i++) { const why = pair(un[i], xn[i], '/OCGs'); if (why) return why }
  }
  for (const [up, xp] of pages) {
    const props = (D, page) => { const r = look(D, page.inherited.Resources), p = r instanceof PDFDict ? look(D, r.get(PDFName.of('Properties'))) : undefined; return p instanceof PDFDict ? p : null }
    const pu = props(U, up), px = props(X, xp)
    if (!pu) continue
    for (const [k, v] of pu.entries()) { const why = pair(v, px?.get(k), `a page's /Properties ${k.toString()}`); if (why) return why }
  }
  return null
}

/**
 * Why the composed /OCProperties is not arXiv's with ours appended (null where it is): every key arXiv's but /OCGs and /D, its
 * /OCGs arXiv's followed by ours (each an OCG named `axt:`, as many as `layers.ours`), its /D arXiv's but /ON, which is arXiv's
 * followed by the same; with no /OCProperties of arXiv's, ours alone, all ON
 */
function ocPropertiesWhy(PL, O, X, layers) {
  const { PDFDict, PDFArray, PDFRef, PDFName } = PL
  const look = (D, v) => (v instanceof PDFRef ? D.lookup(v) : v)
  const text = v => (v === undefined ? 'none' : v instanceof PDFRef ? `${v.objectNumber} ${v.generationNumber} R` : v.toString())
  const xc = look(X, X.trailer.root), xo = xc instanceof PDFDict ? look(X, xc.get(PDFName.of('OCProperties'))) : undefined
  if (!(xo instanceof PDFDict)) return 'it carries no /OCProperties'
  const arr = (D, v) => { const a = look(D, v); return a instanceof PDFArray ? a.asArray() : [] }
  const oo = layers.orig, n = layers.ours.length
  const xg = arr(X, xo.get(PDFName.of('OCGs'))), og = oo ? arr(O, oo.get(PDFName.of('OCGs'))) : []
  const xD = look(X, xo.get(PDFName.of('D'))), oD = oo ? look(O, oo.get(PDFName.of('D'))) : null
  if (!(xD instanceof PDFDict)) return 'its /OCProperties has no default'
  const xon = arr(X, xD.get(PDFName.of('ON'))), oon = oD instanceof PDFDict ? arr(O, oD.get(PDFName.of('ON'))) : []
  if (xg.length !== og.length + n || og.some((r, i) => text(r) !== text(xg[i]))) return 'its /OCGs are not arXiv\'s followed by ours'
  const added = xg.slice(og.length)
  if (added.some(r => !/^axt:/.test(look(X, r)?.get?.(PDFName.of('Name'))?.decodeText?.() ?? ''))) return 'a group it adds is not ours'
  if (xon.length !== oon.length + n || oon.some((r, i) => text(r) !== text(xon[i])) || added.some((r, i) => text(r) !== text(xon[oon.length + i]))) return 'its default\'s /ON is not arXiv\'s followed by ours'
  if (oo) {
    const keys = d => new Map(d.entries().map(([k, v]) => [k.asString(), v]))
    const kx = keys(xo), ko = keys(oo)
    for (const k of ['/OCGs', '/D']) { kx.delete(k); ko.delete(k) }
    if (kx.size !== ko.size || [...ko].some(([k, v]) => text(kx.get(k)) !== text(v))) return 'its /OCProperties is not arXiv\'s but for /OCGs and its default'
    const dx = keys(xD), dO = oD instanceof PDFDict ? keys(oD) : new Map()
    dx.delete('/ON'); dO.delete('/ON')
    if (dx.size !== dO.size || [...dO].some(([k, v]) => text(dx.get(k)) !== text(v))) return 'its default is not arXiv\'s but for /ON'
  }
  return null
}

/**
 * Why a page of the composed document names a layer the composed /OCProperties does not list where its source page's layer
 * is listed in its own document (null where none does): `pages` [source document, source page, composed page] — ours for a
 * replaced page, arXiv's elsewhere — over the pages' /Properties, their forms' /OC and own /Properties, and their annotations'
 * /OC; an OCG listed in /OCGs, an OCMD's groups each listed. PDF.js takes a group it does not know as visible: a layer of arXiv's
 * dropped from the list would show
 */
function ocNamedWhy(PL, X, pages) {
  const { PDFDict, PDFArray, PDFRef, PDFName, PDFRawStream } = PL
  const key = r => `${r.objectNumber} ${r.generationNumber}`
  const listedOf = D => {
    const look = v => (v instanceof PDFRef ? D.lookup(v) : v)
    const c = look(D.trailer.root), o = c instanceof PDFDict ? look(c.get(PDFName.of('OCProperties'))) : undefined
    const a = o instanceof PDFDict ? look(o.get(PDFName.of('OCGs'))) : undefined
    return new Set(a instanceof PDFArray ? a.asArray().filter(r => r instanceof PDFRef).map(key) : [])
  }
  const lists = new Map()
  const known = (D, v) => {
    if (!lists.has(D)) lists.set(D, listedOf(D))
    const listed = lists.get(D), look = x => (x instanceof PDFRef ? D.lookup(x) : x)
    const d = look(v), t = d instanceof PDFDict ? d.get(PDFName.of('Type'))?.asString?.() : undefined
    if (t === '/OCG') return v instanceof PDFRef && listed.has(key(v))
    if (t === '/OCMD') { const g = d.get(PDFName.of('OCGs')), gs = look(g) instanceof PDFArray ? look(g).asArray() : g === undefined ? [] : [g]; return gs.length > 0 && gs.every(r => r instanceof PDFRef && listed.has(key(r))) }
    return true
  }
  /** the layer names of a page, by where: [where, value] */
  const namesOf = (D, page) => {
    const look = x => (x instanceof PDFRef ? D.lookup(x) : x)
    const out = new Map()
    const r = look(page.inherited.Resources)
    if (r instanceof PDFDict) {
      const props = look(r.get(PDFName.of('Properties')))
      if (props instanceof PDFDict) for (const [k, v] of props.entries()) out.set(`its /Properties ${k.toString()}`, v)
      const xo = look(r.get(PDFName.of('XObject')))
      if (xo instanceof PDFDict) for (const [k, v] of xo.entries()) {
        const f = look(v), d = f instanceof PDFRawStream ? f.dict : null
        if (!d) continue
        if (d.get(PDFName.of('OC')) !== undefined) out.set(`its form ${k.toString()}`, d.get(PDFName.of('OC')))
        const fp = look(look(d.get(PDFName.of('Resources')))?.get?.(PDFName.of('Properties')))
        if (fp instanceof PDFDict) for (const [kk, vv] of fp.entries()) out.set(`its form ${k.toString()}'s /Properties ${kk.toString()}`, vv)
      }
    }
    const annots = look(page.node.get(PDFName.of('Annots')))
    if (annots instanceof PDFArray) annots.asArray().forEach((an, i) => { const d = look(an); if (d instanceof PDFDict && d.get(PDFName.of('OC')) !== undefined) out.set(`its annotation ${i}`, d.get(PDFName.of('OC'))) })
    return out
  }
  for (let p = 1; p <= pages.length; p++) {
    const [D, src, xp] = pages[p - 1]
    const theirs = namesOf(D, src), mine = namesOf(X, xp)
    for (const [where, v] of theirs) if (known(D, v) && !known(X, mine.get(where))) return `page ${p}: ${where} names a layer the composed /OCProperties does not list`
  }
  return null
}

/** the console taken by one proof at a time in this process (its PDF.js reads in turn): a proof that overlaps another waits for
 *  it, so that neither keeps the other's capture as the console's own nor reads the other's messages as its documents' */
let consoleQueue = Promise.resolve()
async function consoleHeld(fn) {
  const before = consoleQueue
  let release
  consoleQueue = new Promise(r => { release = r })
  try {
    await before
    return await fn()
  } finally { release() }
}
/** PDF.js's messages of a cross-reference it does not read as written (it then indexes the whole file, or skips a section) */
const RECOVERY = /Indexing all PDF objects|XRef|xref|startxref|trailer/

/**
 * The structural proof of a delta (the contract's §14.2), in the box, before a head names it: `origBytes` arXiv's PDF,
 * `deltaBytes` deltaOf's `delta`, `finalBytes` our final pass, `replaced` deltaOf's ranges; `PL` @cantoo/pdf-lib's exports,
 * `getDocument` PDF.js's (the engine's pinned one, run where its warnings reach `console`: Node's legacy build) and
 * `documentOptions` the host's getDocument options (its cMap and standard font URLs). In turn: (b, c) the section exact
 * (delta-wire.mjs deltaSection) and the composed document's startxref the section's; (f) the composed page graphs, read by
 * the object layer, canonically ours on replaced pages (the page dict's other keys the original's) and the original's elsewhere;
 * (a, d, e) PDF.js opens the composed bytes with no message that neither source alone gives (its console captured, each
 * document read in turn; each message one of a source's, one for one, a document's own id set aside where PDF.js writes it into
 * the name of an object it shares across pages, `g_<id>_`), the original's page count, every page's box and text items
 * (layout/page-text.mjs textRecordDiffers: the box within 0.01, the items exactly) ours on replaced pages and the original's elsewhere. `readers` { orig?, ours? }: the
 * host's own readings of arXiv's PDF and of our final pass, each { options, own?, read(doc) } in place of the proof's own reading
 * of that document: in the same turn and under the same capture of the console, the proof opens the document itself, of a copy of
 * its own bytes (ours of the bytes themselves where `own`), at PDF.js's verbosity 1, with the reader's options over
 * `documentOptions`, and gives it to `read`, which reads every page's text (readArxivText) while the proof makes each page's record
 * of the text content its page gave the reader; every document it opened is the host's, handed back in the result (`documents` {
 * orig, ours }, each null where not opened), whatever the verdict. A reader that throws, or leaves a page unread or read with other
 * options, is a PDF.js failure as the proof's own reading's is. What the delta overrides of the original is
 * bounded: the replaced pages' objects exactly (no other page; the catalog only to carry our /OCProperties, every other key of it
 * the original's), its /Size not below the original's. An original PDF.js recovers by its own scan (any message of its
 * cross-reference on the original alone) is refused (`delta-xref`). { ok: true, pages, replaced } or { ok: false, code
 * ('delta-proof' or 'delta-xref'), why }, with `documents` where readers are given. Never throws but a failed allocation (the
 * documents handed so far then destroyed)
 */
export async function proveDelta(origBytes, deltaBytes, finalBytes, { PL, getDocument, documentOptions = {}, replaced, readers = null, objectsMax = DELTA_OBJECTS_MAX, decodedMax = DELTA_DECODED_MAX, heldMax = DELTA_HELD_MAX }) {
  /** the documents the readers read, handed to the host with the result whatever it is (`documents`), the host's to keep and destroy */
  const handed = { orig: null, ours: null }
  const withDocuments = r => (readers ? { ...r, documents: { ...handed } } : r)
  const no = (why, code = 'delta-proof') => withDocuments({ ok: false, code, why: String(why).slice(0, 300) })
  // (the proof's own bytes, let go once PDF.js has read them: never held while a reader's document is open)
  let composed = concat([origBytes, deltaBytes])
  const rep = new Set(pagesOf(replaced ?? []))
  let N, M
  // (b, c, f) the section and the page graphs, in a function of their own: the object layer's three documents are let go when it
  // returns, before PDF.js reads any document (a reader's is the host's, kept)
  const structure = () => { try {
    const own = startxrefOf(origBytes)
    const sect = deltaSection(deltaBytes, { bytes: origBytes.length, xref: own })
    if (sect.why) return no(`the section: ${sect.why}`)
    if (startxrefOf(composed) !== sect.startxref) return no('the composed document\'s startxref is not the delta\'s section')
    // (f) the page graphs, read again by the object layer from the composed bytes
    const O = openObjects(origBytes, { PL, objectsMax, decodedMax }), U = openObjects(finalBytes, { PL, objectsMax, decodedMax }), X = openObjects(composed, { PL, objectsMax, decodedMax })
    const same = sameGraph(PL)
    const oP = O.pages(), uP = U.pages(), xP = X.pages()
    N = oP.length
    M = uP.length
    if (xP.length !== N) return no(`the composed document has ${xP.length} pages, arXiv's PDF ${N}`)
    if ([...rep].some(p => p > M)) return no('a replaced page past ours')
    // (what the delta overrides of the original: the replaced pages' objects, exactly, and nothing else of the original's numbers
    // — no other page, the catalog only for our /OCProperties — and its /Size not below the original's)
    if (sect.size < O.size) return no(`its /Size ${sect.size} is below the original's ${O.size}`)
    // (the composed trailer is the delta's own: it keeps the original's /Root and /Info as references and /ID byte for byte, so
    // that the catalog, outlines, destinations and document info stay the original's)
    const refText = v => (v instanceof PL.PDFRef ? `${v.objectNumber} ${v.generationNumber} R` : v === undefined ? 'none' : 'direct')
    const idBytes = v => (v instanceof PL.PDFArray ? v.asArray().map(x => (x instanceof PL.PDFString || x instanceof PL.PDFHexString ? hexOf(x.asBytes()) : '?')).join(',') : 'none')
    if (refText(X.own.root) !== refText(O.trailer.root) || refText(O.trailer.root) === 'direct') return no('its trailer\'s /Root is not the original\'s')
    if (refText(X.own.info) !== refText(O.trailer.info)) return no('its trailer\'s /Info is not the original\'s')
    if (idBytes(X.own.id) !== idBytes(O.trailer.id)) return no('its trailer\'s /ID is not the original\'s')
    const pageRefs = new Map(oP.map((o, i) => [o.ref.objectNumber, i + 1]))
    const over = new Set()
    // (the catalog, written again only to carry our /OCProperties: every other key the original's, that one ours)
    const root = O.trailer.root, ourOcp = (() => { const c = U.lookup(U.trailer.root); return c instanceof PL.PDFDict ? c.get(PL.PDFName.of('OCProperties')) : undefined })()
    let catalog = false
    for (const [n, g] of sect.rows) {
      if (n >= O.size) continue
      if (n === root.objectNumber && g === root.generationNumber) { catalog = true; continue }
      const p = pageRefs.get(n)
      if (p === undefined || !rep.has(p) || oP[p - 1].ref.generationNumber !== g) return no(`it overrides the original's object ${n} ${g}, no replaced page's`)
      over.add(p)
    }
    if (over.size !== rep.size) return no(`it writes ${over.size} of the ${rep.size} pages it says it replaces`)
    const unrep = wrappedPagesOf(PL, U).find(p => !rep.has(p))
    if (unrep !== undefined) return no(`page ${unrep} of ours names a group of ours and is not replaced`)
    if (catalog !== (ourOcp !== undefined)) return no(catalog ? 'it writes the catalog again, our pass having no /OCProperties' : 'it does not carry our /OCProperties')
    if (catalog) {
      const xc = X.lookup(root), oc = O.lookup(root)
      // (key by key, a reference by its number, within a direct value too (sameDirect): the catalog's tree is the composed
      // document's, its replaced pages ours)
      const keysOf = d => (d instanceof PL.PDFDict ? new Map(d.entries().map(([k, v]) => [k.asString(), v]).filter(([k]) => k !== '/OCProperties')) : null)
      const kx = keysOf(xc), ko = keysOf(oc), direct = sameDirect(PL)
      if (!kx || !ko || kx.size !== ko.size || [...ko].some(([k, v]) => !kx.has(k) || !direct(kx.get(k), v))) return no('its catalog is not the original\'s but for /OCProperties')
      const why = ocPropertiesWhy(PL, O, X, layersOf(PL, O, U))
      if (why) return no(why)
    }
    // (optional content by identity: each group or membership of ours one object of the composed document's and no two of ours
    // one, over /OCProperties' /OCGs and every replaced page's /Properties)
    const ocWhy = ocIdentityWhy(PL, U, X, ourOcp, [...rep].map(p => [uP[p - 1], xP[p - 1]])) ?? ocNamedWhy(PL, X, xP.map((x, i) => (rep.has(i + 1) ? [U, uP[i], x] : [O, oP[i], x])))
    if (ocWhy) return no(ocWhy)
    const drop = new Set(['/Contents', '/Resources'])
    const contents = (doc, page) => contentsOf(PL, doc, page.node)
    for (let p = 1; p <= N; p++) {
      const x = xP[p - 1], o = oP[p - 1]
      if (x.ref.objectNumber !== o.ref.objectNumber || x.ref.generationNumber !== o.ref.generationNumber) return no(`page ${p} is another object than the original's`)
      if (!same(X, x.node, O, o.node, drop)) return no(`page ${p}'s dict is not the original's but for its contents and resources`)
      const [D, d] = rep.has(p) ? [U, uP[p - 1]] : [O, o]
      const cx = contents(X, x), cd = contents(D, d)
      if (cx.length !== cd.length || cx.some((r, i) => !same(X, r, D, cd[i])) || !same(X, x.inherited.Resources ?? PL.PDFNull, D, d.inherited.Resources ?? PL.PDFNull)) return no(`page ${p}'s graph is not ${rep.has(p) ? 'ours' : 'the original\'s'}`)
    }
    return null
  } catch (e) {
    const r = refusalOf(e)
    return no(`the object layer: ${r.why}`)
  } }
  const structural = structure()
  if (structural) return structural

  // (a, d, e) PDF.js, each document read whole in turn under a captured console: the composed document here, always, first (its
  // reading let go before a reader's document, which the host keeps, is opened); then arXiv's PDF and ours, by the host's readers
  // where it gives them, else here
  const said = { orig: new Set(), ours: new Set(), composed: new Set() }
  /** each document's own id (its loading task's `docId`, `d<n>`, the next of the process's at each opening), which PDF.js writes
   *  into the names of the objects it shares across a document's pages (`g_<id>_`: a Type 3 glyph's image, an image used on
   *  several pages, a font) and so into its messages of them; null where the opening gives none */
  const ids = { orig: null, ours: null, composed: null }
  const idOf = (tag, task) => { ids[tag] = typeof task?.docId === 'string' && /^d\d+$/.test(task.docId) ? task.docId : null }
  /** a message as its document gave it, but for that document's own id where PDF.js writes it into an object's name: three
   *  documents saying one thing of one object say it under three ids (2610.31506v1: "Unable to decode image
   *  g_d1_type3_img_p2_1", the same image of the same glyph, read in the composed document, in arXiv's PDF and in ours) */
  const heardAs = (tag, m) => (ids[tag] === null ? m : m.replaceAll(`g_${ids[tag]}_`, 'g_<document>_'))
  /** `fn` with the console's messages kept as `tag`'s (the console restored on every path: a read may throw before its task exists,
   *  the task reject, its destroy throw) */
  const heard = async (tag, fn) => {
    const log0 = console.log, warn0 = console.warn, err0 = console.error
    const keep = (...a) => said[tag].add(a.map(String).join(' '))
    console.log = keep
    console.warn = keep
    console.error = keep
    try { return await fn() } finally {
      console.log = log0
      console.warn = warn0
      console.error = err0
    }
  }
  /** `task` destroyed; a destroy that throws is the failure only where nothing failed before it (`failed`), never in its place */
  // (a failed allocation of the destroy's own goes on whatever failed before it: the run's, never the proof's refusal)
  const destroyed = async (task, failed) => { try { await task?.destroy?.() } catch (d) { if (!failed || isMemoryError(d)) throw d } }
  /** a document's text records, each page's, read here */
  const read = (bytes, tag) => heard(tag, async () => {
    let task = null, failed = false
    try {
      task = getDocument({ ...documentOptions, data: bytes, verbosity: 1 })
      idOf(tag, task)
      const doc = await task.promise
      const pages = []
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p)
        pages.push(await textRecordOf(page, await page.getTextContent()))
        page.cleanup()
      }
      return pages
    } catch (e) { failed = true; throw e } finally { await destroyed(task, failed) }
  })
  /**
   * A document opened here for the host's reader (the reader's options over the proof's, for the document the host keeps), and the
   * host's from the moment it opens (`handed`, the result's `documents`, whatever the verdict: the host keeps it or destroys it), read
   * by the reader: its text records made here, of each text content its pages give the reader (asked with the defaults, as the
   * proof's own reading asks), before the reader sees it, so that what is compared is what this document gave. Every page must be
   * read so, compared or not, as the proof's own reading reads every page; a reader that throws, or leaves a page unread or read
   * otherwise, refuses the delta (its document still the host's). `own`: the bytes themselves given to PDF.js, no copy made — an
   * opening that fails then leaves them given up too (PDF.js 6.3.289 detaches them at once), which the host reads by their length
   */
  const given = (bytes, tag, reader) => heard(tag, async () => {
    let task = null, doc
    try {
      task = getDocument({ ...documentOptions, ...(reader.options ?? {}), data: bytes, verbosity: 1 })
      idOf(tag, task)
      doc = await task.promise
    } catch (e) {
      await destroyed(task, true)
      throw e
    }
    handed[tag] = doc
    const n = doc.numPages, records = new Array(n).fill(null), otherwise = new Set(), twice = new Set(), failed = new Map()
    let reading = true
    // (the reader holds proxies whose methods are the ones taken here, before it has them, and which it cannot change: no record of
    // a function or a box the reader put there)
    const fixed = what => ({ set: () => { throw new TypeError(`the ${tag} reader may not change its ${what}`) }, defineProperty: () => { throw new TypeError(`the ${tag} reader may not change its ${what}`) }, deleteProperty: () => { throw new TypeError(`the ${tag} reader may not change its ${what}`) } })
    const own = (t, k) => { const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v }
    const pageOf = (page, p) => {
      const textOf = page.getTextContent.bind(page), box = { view: page.view, rotate: page.rotate, userUnit: page.userUnit }
      return new Proxy(page, {
        ...fixed('page'),
        get: (t, k) => (k !== 'getTextContent' ? own(t, k) : async (...a) => {
          const content = await textOf(...a)
          if (reading && Number.isInteger(p) && p >= 1 && p <= n) {
            if (a.length) otherwise.add(p)
            else {
              // (a record the proof cannot make is the proof's to say, the page's text still the reader's; a failed allocation goes on)
              let record = null
              try { record = await textRecordOf(box, content) } catch (e) { if (isMemoryError(e)) throw e; failed.set(p, e) }
              // (a page read again must give the same text)
              if (record && records[p - 1] && textRecordDiffers(record, records[p - 1]) !== null) twice.add(p)
              if (record) records[p - 1] = record
            }
          }
          return content
        }),
      })
    }
    const getPage = doc.getPage.bind(doc)
    const view = new Proxy(doc, { ...fixed('document'), get: (t, k) => (k !== 'getPage' ? own(t, k) : async p => pageOf(await getPage(p), p)) })
    try { await reader.read(view) } finally { reading = false }
    const first = set => [...set].sort((a, b) => a - b)[0]
    const bad = first(failed.keys())
    if (bad !== undefined) throw new TypeError(`page ${bad} of the ${tag} document: its record could not be made: ${String(failed.get(bad)?.message ?? failed.get(bad))}`)
    const other = first(otherwise)
    if (other !== undefined) throw new TypeError(`page ${other} of the ${tag} document was read with other options than the proof's`)
    const again = first(twice)
    if (again !== undefined) throw new TypeError(`page ${again} of the ${tag} document gave another text when read again`)
    const unread = records.indexOf(null)
    if (unread >= 0) throw new TypeError(`page ${unread + 1} of the ${tag} document was not read`)
    return records
  })
  const reads = r => !!r && typeof r === 'object' && typeof r.read === 'function'
  // (one copy of a source document at a time, for PDF.js to own, but ours itself where its reader says `own`; the composed bytes are
  // the proof's own, read whole first, and let go)
  let orig, ours, comp
  try {
    ;[comp, orig, ours] = await consoleHeld(async () => {
      const c = await read(composed, 'composed')
      composed = null
      return [
        c,
        reads(readers?.orig) ? await given(origBytes.slice(), 'orig', readers.orig) : await read(origBytes.slice(), 'orig'),
        reads(readers?.ours) ? await given(readers.ours.own === true ? finalBytes : finalBytes.slice(), 'ours', readers.ours) : await read(finalBytes.slice(), 'ours'),
      ]
    })
  } catch (e) {
    if (isMemoryError(e)) {
      // (no result reaches the host: what it was handed is let go here, each in turn, nothing of it in the failed allocation's place)
      for (const d of Object.values(handed)) { try { await d?.loadingTask?.destroy?.() } catch {} }
      throw e
    }
    return no(`PDF.js: ${String(e?.message ?? e)}`)
  }
  // (an original PDF.js reads by its own scan of the file is no base: its unreplaced pages there may be other objects than the
  // cross-reference's, and its own message would hide the composed document's)
  const recovered = [...said.orig].find(m => RECOVERY.test(m))
  if (recovered) return no(`PDF.js recovers the original's cross-reference alone: ${recovered}`, 'delta-xref')
  // (each message of the composed document's one of arXiv's PDF's or ours, one for one: only a document's own id is set aside)
  const sources = new Set([...[...said.orig].map(m => heardAs('orig', m)), ...[...said.ours].map(m => heardAs('ours', m))])
  const novel = [...said.composed].filter(m => !sources.has(heardAs('composed', m)))
  if (novel.length) return no(`PDF.js says of the composed document alone: ${novel[0]}`)
  if (comp.length !== orig.length) return no(`PDF.js reads ${comp.length} pages of the composed document, ${orig.length} of arXiv's`)
  for (let p = 1; p <= comp.length; p++) {
    // (a replaced page is ours; every other is the original's in the composed document, whatever ours is there)
    const whose = rep.has(p) ? 'ours' : 'the original\'s'
    const d = textRecordDiffers(comp[p - 1], rep.has(p) ? ours[p - 1] : orig[p - 1])
    if (d === 'its box differs') return no(`page ${p}'s box is not ${whose}`)
    if (d !== null) return no(`page ${p}'s text is not ${whose}: ${d}`)
  }
  return withDocuments({ ok: true, pages: [M, N], replaced: rep.size })
}
