// Our final pass's pages wrapped by optional content, once, in the maker child (per-unit optional-content erasure, design
// `docs/route/ocg-erasure.md` §2–§3): each run a unit owns (layout/own.mjs) put in `/OC /axt<group> BDC … EMC`, the page's
// resources naming each group (`/Properties`), one optional-content group per name in the catalog's `/OCProperties`, all ON —
// so that with every group ON the page is our page, and the reader hides a drawn unit's ink, and nothing else, by setting its
// groups OFF. The result is our bytes followed by ONE incremental section (layout/section.mjs, the final's cross-reference kind):
// each wrapped page's dict written again under its own number with a new content stream, the groups, and the catalog again with
// `/OCProperties`. Both forms of the base are made of it: the full base is these bytes, the delta (layout/delta.mjs) copies their
// streams.
//
// Where a wrapper may go (§2.2): between whole operators only (never in a TJ array, a path object, an inline image, or between
// an operator and its operands); a BDC and its EMC in one stream, at one q depth, one text-object state and one depth of the
// page's own marked content (each run closed before a q, Q, BT, ET, BDC, BMC, EMC, an inline image, a shading or any ink not its
// group's); the `/axt-… ri` points kept where they are. A run is one group's operators with no operator between them but those
// that set state. A text-showing operator two groups share is split as the remover's hide mode splits one (variant (a) of E4: a
// number stays with the chunk before it, the codes kept, written in hex); a rule's path object is wrapped whole, from its first
// construction operator to its painting; a form XObject whose ink is all one group's has its `Do` wrapped.
//
// A page is refused, its streams left as they are and its units the original's (`page`), where it does not align with PDF.js's
// reading, passes the walk's bounds, holds a form partly owned, an owned run in a clipping text mode (Tr ≥ 4: hiding the only
// clipping run lifts the clip, E5), or a split in a vertical font or a Type 3 font without widths. A page past GROUPS_PAGE
// groups or SEQUENCES_PAGE sequences has its placeholders' and labels' groups merged into the text's (a unit with a placeholder
// there `bounds`), and is refused if still past; past GROUPS_DOC groups in the document, the later pages are refused.
//
// The proof (§2.5, (a)–(c)): the section exact over our bytes (delta-wire.mjs deltaSection: every entry at its object, /Prev our
// startxref), and each new stream inflated and lexed again: every BDC of ours balanced by its EMC at its depth and text state,
// named by the page's /Properties, and its operators, with ours taken out and the split shows joined, our page's.
//
// An original module (no port statement). It imports the remover's lexer and page walk (layout/remove.mjs), the section writer
// and its reader; @cantoo/pdf-lib (MIT), deflate and inflate are given.
import { deltaSection, UNHIDDEN_MAX } from './delta-wire.mjs'
import { BOXES_PAGE, GLYPHS_PAGE, pageInk } from './ink.mjs'
import { followsOf } from './marks.mjs'
import { ownOf, UNHIDDEN } from './own.mjs'
import { alignOf, lex, openRemover } from './remove.mjs'
import { appendSection } from './section.mjs'
import { startxrefOf } from './tail.mjs'

/** the groups and the marked-content sequences of ours a page may hold, and the groups a document may (E1, E3) */
export const GROUPS_PAGE = 512, SEQUENCES_PAGE = 2000, GROUPS_DOC = 8000
/** why the wrap of a whole paper is refused (its base then arXiv's PDF, `wrap-<code>`) */
export const WRAP_WHYS = Object.freeze(['wrap-parse', 'wrap-proof', 'wrap-bound'])
/** an optional-content group's name as a viewer lists it, of a group's name */
export const ocgName = g => `axt:${g}`
/** a group's resource name in a page's /Properties and its content stream */
export const propName = g => `axt${g}`

const enc = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b }
const concat = parts => { let n = 0; for (const p of parts) n += p.length; const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }
const HEX = Array.from({ length: 256 }, (_, v) => v.toString(16).padStart(2, '0'))
const hex = b => { let s = '<'; for (let i = 0; i < b.length; i++) s += HEX[b[i]]; return `${s}>` }
const fmt = x => { if (Math.abs(x) < 5e-7) return '0'; let s = x.toFixed(6); s = s.replace(/0+$/, '').replace(/\.$/, ''); return s === '-0' ? '0' : s }
const td = new TextDecoder('latin1')

/** the operators that set state alone: a run of one group goes on over them */
const NEUTRAL = new Set(['Tf', 'Td', 'TD', 'Tm', 'T*', 'Tc', 'Tw', 'Tz', 'TL', 'Ts', 'Tr', 'cm', 'gs', 'rg', 'RG', 'g', 'G', 'k', 'K', 'cs', 'CS', 'sc', 'scn', 'SC', 'SCN', 'w', 'J', 'j', 'M', 'd', 'ri', 'i'])
/** a path's construction, and its clip, before its painting operator */
const PATH = new Set(['m', 'l', 'c', 'v', 'y', 'h', 're', 'W', 'W*'])
const SHOWS = new Set(['Tj', 'TJ', "'", '"'])

/**
 * A page's plan as wrapOf takes it: from own.mjs's groups of its glyphs and rules and pageInk's (n, k) and path places.
 * `glyphs` pageInk's glyphs of the page (with `indices`), `groupOfGlyph` own.mjs's `glyphs[p - 1]`, `paths` pageInk's, and
 * `groupOfBox` own.mjs's `boxes[p - 1]`. Returns { shows: Map n -> (group | null | undefined)[] by k, paths: Map m -> group }
 */
export function planOf(glyphs, groupOfGlyph, paths, groupOfBox) {
  const shows = new Map(), rules = new Map()
  glyphs.forEach((g, i) => {
    if (!(g.n >= 0)) return
    let row = shows.get(g.n)
    if (!row) shows.set(g.n, (row = []))
    row[g.k] = groupOfGlyph[i]
  })
  groupOfBox.forEach((g, b) => { const m = paths[b]; if (g !== null && m >= 0) rules.set(m, g) })
  return { shows, paths: rules }
}

/** a show's codes' groups: each code read (in ink) its own, a code not read (no ink of its own: invisible, or none) its
 *  neighbour's, so that no split is made for it */
function codeGroups(row, count) {
  const out = new Array(count)
  let last
  for (let k = 0; k < count; k++) { const g = row?.[k]; out[k] = g === undefined ? undefined : g; if (g !== undefined) last = g; else if (last !== undefined) out[k] = last }
  for (let k = count - 1, next; k >= 0; k--) { if (out[k] !== undefined) next = out[k]; else out[k] = next ?? null }
  return out
}

/**
 * Wrap our final pass. `finalBytes` its bytes; `plans` page (1-based) -> { facts (remove.mjs alignOf's of PDF.js's list of the
 * page), shows, paths } (planOf's), a page with none left unwrapped; `units` own.mjs's units (their pages: a refused page makes
 * each unit on it `page`, a merge `bounds`); `PL` @cantoo/pdf-lib's exports; `deflate` (bytes -> bytes, deterministic) and
 * `inflate` (bytes, limit -> bytes) as the remover takes them. Returns { bytes (finalBytes and the section), xref, sha256,
 * pages: Map p -> { ok, why?, groups, sequences, split }, groups (in the document), stats } or { refused (a WRAP_WHYS code), why }.
 * Never throws but a failed allocation
 */
export async function wrapOf(finalBytes, plans, { units = new Map(), PL, deflate, inflate = null, groupsPage = GROUPS_PAGE, sequencesPage = SEQUENCES_PAGE, groupsDoc = GROUPS_DOC }) {
  let R
  try { R = await openRemover(finalBytes, { PL, inflate }) } catch (e) { if (isMemory(e)) throw e; return { refused: 'wrap-parse', why: String(e?.message ?? e).slice(0, 300) } }
  try {
    const { ctx, PDFName, PDFDict, PDFRef } = { ctx: R.ctx, ...PL }
    const out = new Map()
    const docGroups = new Map() // group -> object number
    let next = ctx.largestObjectNumber + 1
    const objects = []
    const lit = v => (v instanceof PDFRef ? `${v.objectNumber} ${v.generationNumber} R` : v instanceof PDFDict ? `<<${v.entries().map(([k, x]) => ` ${k.toString()} ${lit(x)}`).join('')} >>` : v instanceof PL.PDFArray ? `[${v.asArray().map(lit).join(' ')}]` : v.toString())
    const order = [...plans.keys()].sort((a, b) => a - b)
    let docFull = false
    for (const p of order) {
      const plan = plans.get(p)
      if (docFull) { out.set(p, { ok: false, why: `past ${groupsDoc} groups in the document` }); continue }
      let made = wrapPage(R, p, plan, false)
      if (made.ok && (made.groups.size > groupsPage || made.sequences > sequencesPage)) {
        made = wrapPage(R, p, plan, true)
        if (made.ok && (made.groups.size > groupsPage || made.sequences > sequencesPage)) made = { ok: false, why: `${made.groups.size} groups and ${made.sequences} sequences, past ${groupsPage} and ${sequencesPage}` }
        else if (made.ok) made.merged = true
      }
      if (made.ok && [...made.groups].filter(g => !docGroups.has(g)).length + docGroups.size > groupsDoc) { docFull = true; made = { ok: false, why: `past ${groupsDoc} groups in the document` } }
      if (!made.ok) { out.set(p, { ok: false, why: made.why }); continue }
      for (const g of [...made.groups].sort()) if (!docGroups.has(g)) docGroups.set(g, next++)
      // the page's stream, its resources with our /Properties, its dict again under its number
      const data = deflate(made.stream)
      const sref = next++
      objects.push([sref, 0, concat([enc(`${sref} 0 obj\n<< /Filter /FlateDecode /Length ${data.length} >>\nstream\n`), data, enc('\nendstream\nendobj\n')])])
      const node = made.walk.node, pageRef = R.doc.getPages()[p - 1].ref
      const res = node.Resources()
      const resEntries = res instanceof PDFDict ? res.entries().filter(([k]) => k.toString() !== '/Properties') : []
      const own = res instanceof PDFDict ? R.look(res.get(PDFName.of('Properties'))) : undefined
      const props = own instanceof PDFDict ? own.entries().filter(([k]) => !made.groups.has(k.toString().slice(1).replace(/^axt/, ''))).map(([k, v]) => ` ${k.toString()} ${lit(v)}`) : []
      for (const g of [...made.groups].sort()) props.push(` /${propName(g)} ${docGroups.get(g)} 0 R`)
      const resText = `<<${resEntries.map(([k, v]) => ` ${k.toString()} ${lit(v)}`).join('')} /Properties <<${props.join('')} >> >>`
      const ents = node.entries().filter(([k]) => k.toString() !== '/Contents' && k.toString() !== '/Resources').map(([k, v]) => ` ${k.toString()} ${lit(v)}`)
      objects.push([pageRef.objectNumber, pageRef.generationNumber, enc(`${pageRef.objectNumber} ${pageRef.generationNumber} obj\n<<${ents.join('')} /Resources ${resText} /Contents ${sref} 0 R >>\nendobj\n`)])
      out.set(p, { ok: true, groups: made.groups.size, sequences: made.sequences, split: made.split, merged: !!made.merged, stream: made.stream, names: made.groups })
      R.release()
    }
    // the groups, and the catalog again with /OCProperties: ours appended to a foreign one's and listed ON
    const refs = []
    for (const [g, n] of [...docGroups].sort((a, b) => a[1] - b[1])) {
      objects.push([n, 0, enc(`${n} 0 obj\n<< /Type /OCG /Name (${ocgName(g)}) >>\nendobj\n`)])
      refs.push(`${n} 0 R`)
    }
    const T = ctx.trailerInfo, rootRef = T.Root, cat = ctx.lookup(rootRef)
    if (refs.length) {
      const old = R.look(cat.get(PDFName.of('OCProperties')))
      let oc
      if (old instanceof PDFDict) {
        const arr = v => { const a = R.look(v); return a instanceof PL.PDFArray ? a.asArray().map(lit) : [] }
        const D = R.look(old.get(PDFName.of('D')))
        const dEnts = D instanceof PDFDict ? D.entries().filter(([k]) => k.toString() !== '/ON').map(([k, v]) => ` ${k.toString()} ${lit(v)}`) : []
        const on = D instanceof PDFDict ? arr(D.get(PDFName.of('ON'))) : []
        const oEnts = old.entries().filter(([k]) => k.toString() !== '/OCGs' && k.toString() !== '/D').map(([k, v]) => ` ${k.toString()} ${lit(v)}`)
        oc = `<< /OCGs [${[...arr(old.get(PDFName.of('OCGs'))), ...refs].join(' ')}] /D <<${dEnts.join('')} /ON [${[...on, ...refs].join(' ')}] >>${oEnts.join('')} >>`
      } else oc = `<< /OCGs [${refs.join(' ')}] /D << /BaseState /ON /ON [${refs.join(' ')}] /Order [] >> >>`
      const cEnts = cat.entries().filter(([k]) => k.toString() !== '/OCProperties').map(([k, v]) => ` ${k.toString()} ${lit(v)}`)
      objects.push([rootRef.objectNumber, rootRef.generationNumber, enc(`${rootRef.objectNumber} ${rootRef.generationNumber} obj\n<<${cEnts.join('')} /OCProperties ${oc} >>\nendobj\n`)])
    }
    const wrapped = [...out.values()].filter(x => x.ok)
    const stats = { wrapped: wrapped.length, refusedPages: [...out.values()].filter(x => !x.ok).length, split: wrapped.reduce((n, x) => n + x.split, 0), groups: docGroups.size }
    if (!wrapped.length) return { bytes: finalBytes, xref: startxrefOf(finalBytes), sha256: await sha256Of(finalBytes), pages: out, groups: docGroups, stats, unwrapped: true }
    const prev = startxrefOf(finalBytes)
    if (prev === null) return { refused: 'wrap-parse', why: 'our final pass names no startxref' }
    const kind = /^\s*xref/.test(td.decode(finalBytes.subarray(prev, prev + 16))) ? 'table' : 'stream'
    const section = appendSection({ end: finalBytes.length, objects, kind, prev, size: next, trailer: { root: T.Root.toString(), info: T.Info?.toString(), id: T.ID?.toString() } })
    const bytes = concat([finalBytes, section.bytes])
    const proof = proveWrap(finalBytes, section.bytes, { R, out, inflate: inflate ?? null, kind })
    if (proof) return { refused: 'wrap-proof', why: proof }
    for (const x of out.values()) delete x.stream
    return { bytes, xref: section.xref, sha256: await sha256Of(bytes), pages: out, groups: docGroups, stats }
  } catch (e) {
    if (isMemory(e)) throw e
    return { refused: 'wrap-parse', why: String(e?.message ?? e).slice(0, 300) }
  }
}

const isMemory = e => e instanceof RangeError && /allocation|memory|Array buffer/i.test(String(e?.message))
async function sha256Of(bytes) {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
  let s = ''
  for (let i = 0; i < d.length; i++) s += HEX[d[i]]
  return s
}

/**
 * One page wrapped (or why not): its walk aligned with PDF.js's facts, each event's group, the page's own operators lexed
 * whole and the runs written. `merge` folds the placeholders' and labels' groups into the text's (the bounds' ladder)
 */
function wrapPage(R, p, plan, merge) {
  const al = R.alignPage(p - 1, plan.facts)
  if (!al.ok) return { ok: false, why: al.why.slice(0, 3).join('; ') }
  const fold = g => (g === null || g === undefined || !merge ? g : g.replace(/\.[pl]$/, ''))
  const walk = al.walk, pc = walk.pc
  const showN = new Map(al.shows.map((e, n) => [e, n])), paintM = new Map((al.paints ?? []).map((e, m) => [e, m]))
  if (!al.paints && plan.paths.size) return { ok: false, why: 'its painted paths do not align' }
  // each event's groups: a show's by its codes, a paint's, a form's of everything in it
  const groupsOf = new Map()
  const top = cont => { let c = cont; while (c.parent && c.parent !== pc) c = c.parent; return c }
  const formOf = new Map() // a form container directly under the page -> its Do event
  for (const e of walk.events) if (e.kind === 'form' && e.cont === pc) formOf.set(e.child, e)
  const inForm = new Map() // Do event -> Set of groups (null for unowned ink)
  for (const e of walk.events) {
    let gs
    if (e.kind === 'show') gs = codeGroups(plan.shows.get(showN.get(e)), e.codes.length).map(fold)
    else if (e.kind === 'paint') gs = [fold(plan.paths.get(paintM.get(e)) ?? null)]
    else if (e.kind === 'image') gs = [null]
    else continue
    if (e.cont === pc) { groupsOf.set(e, gs); continue }
    const d = formOf.get(top(e.cont))
    if (!d) continue
    const set = inForm.get(d) ?? inForm.set(d, new Set()).get(d)
    for (const g of gs) set.add(g)
  }
  for (const [d, set] of inForm) {
    const owned = [...set].filter(g => g !== null)
    if (owned.length > 1 || (owned.length === 1 && set.has(null))) return { ok: false, why: 'a form partly owned' }
    groupsOf.set(d, owned.length ? [owned[0]] : [null])
  }
  // the page's own operators, whole, piece by piece, and where each walked event is among them
  const groups = new Set()
  let sequences = 0, split = 0
  const pieces = []
  for (let pi = 0; pi < pc.pieces.length; pi++) {
    const bytes = pc.pieces[pi].st ? R.decode(pc.pieces[pi].st) : new Uint8Array(0)
    const ops = lex(bytes)
    const byEnd = new Map(ops.map((o, i) => [o.e, i]))
    const role = new Array(ops.length).fill(null) // { g, s, e, text? } for an owned operator (or a split's text)
    for (const [e, gs] of groupsOf) {
      if (e.cont !== pc || e.pi !== pi) continue
      const wo = pc.ops[pi][e.oi], i = byEnd.get(wo.e)
      if (i === undefined) return { ok: false, why: 'an operator the walk read and the lexer did not' }
      const owned = gs.filter(g => g !== null && g !== undefined)
      if (!owned.length) continue
      const uniform = gs.every(g => g === gs[0])
      if (e.kind === 'show') {
        if (e.state.Tr >= 4) return { ok: false, why: 'an owned run in a clipping text mode' }
        if (uniform) { role[i] = { g: gs[0], s: ops[i].s, e: ops[i].e }; continue }
        const f = e.state.font
        if (f.vertical) return { ok: false, why: 'a split in a vertical font' }
        if (f.type3 && !f.width) return { ok: false, why: 'a split in a Type 3 font without widths' }
        const text = splitText(ops[i], e, gs)
        role[i] = { split: true, s: ops[i].s, e: ops[i].e, text: text.text }
        for (const g of text.groups) groups.add(g)
        sequences += text.sequences
        split++
      } else if (e.kind === 'paint') {
        let j = i
        while (j > 0 && PATH.has(ops[j - 1].op)) j--
        role[i] = { g: gs[0], s: ops[j].s, e: ops[i].e }
        for (let k = j; k < i; k++) role[k] = { inside: true }
      } else role[i] = { g: gs[0], s: ops[i].s, e: ops[i].e }
    }
    // the runs: one group's operators with state alone between them
    const edits = []
    let run = null
    const close = () => { if (run) { edits.push({ s: run.end, e: run.end, text: ' EMC ', o: 0 }); groups.add(run.g); sequences++; run = null } }
    for (let i = 0; i < ops.length; i++) {
      const r = role[i]
      if (r?.inside) continue
      if (r?.split) { close(); edits.push({ s: r.s, e: r.e, text: r.text, o: 1 }); continue }
      if (r?.g) {
        if (run && run.g !== r.g) close()
        if (!run) { run = { g: r.g, end: r.e }; edits.push({ s: r.s, e: r.s, text: ` /OC /${propName(r.g)} BDC `, o: 2 }) }
        run.end = r.e
        continue
      }
      if (!NEUTRAL.has(ops[i].op)) close()
    }
    close()
    pieces.push(applyInserts(bytes, edits))
  }
  return { ok: true, walk, groups, sequences, split, stream: concat(pieces.flatMap((b, i) => (i ? [enc('\n'), b] : [b]))) }
}

/** a show two groups share, as its chunks: each chunk its own TJ (a number with the chunk before it), an owned chunk wrapped */
function splitText(o, e, gs) {
  const arr = o.op === 'TJ' ? o.args[0] : [o.args[o.op === '"' ? 2 : 0]]
  const prefix = o.op === "'" ? 'T* ' : o.op === '"' ? `${fmt(o.args[0])} Tw ${fmt(o.args[1])} Tc T* ` : ''
  const items = []
  let ci = 0
  ;(Array.isArray(arr) ? arr : []).forEach((el, ei) => {
    if (typeof el === 'number') { items.push({ num: el }); return }
    if (el?.t !== 'str') return
    while (ci < e.codes.length && e.codes[ci].ei === ei) { const c = e.codes[ci]; items.push({ g: gs[ci], b: el.b.subarray(c.cs, c.ce) }); ci++ }
  })
  const chunks = []
  for (const it of items) {
    const g = it.num !== undefined ? (chunks.length ? chunks.at(-1).g : null) : it.g
    if (!chunks.length || chunks.at(-1).g !== g) chunks.push({ g, items: [] })
    chunks.at(-1).items.push(it)
  }
  const body = c => {
    const out = []
    for (const it of c.items) { const l = out.at(-1); if (it.num !== undefined) { if (l && l.num !== undefined) l.num += it.num; else out.push({ num: it.num }) } else if (l?.parts) l.parts.push(it.b); else out.push({ parts: [it.b] }) }
    return `[${out.map(x => (x.parts ? hex(concat(x.parts)) : fmt(x.num))).join(' ')}] TJ`
  }
  const used = new Set()
  let sequences = 0
  const text = ` ${prefix}${chunks.map(c => { if (!c.g) return body(c); used.add(c.g); sequences++; return `/OC /${propName(c.g)} BDC ${body(c)} EMC` }).join(' ')} `
  return { text, groups: used, sequences }
}

/** a stream's bytes with insertions and replacements made: by place, an EMC before a BDC at one place */
function applyInserts(bytes, list) {
  list.sort((a, b) => a.s - b.s || a.o - b.o || a.e - b.e)
  const parts = []
  let at = 0
  for (const x of list) {
    if (x.s < at) throw new Error('overlapping edits')
    parts.push(bytes.subarray(at, x.s), enc(x.text))
    at = x.e
  }
  parts.push(bytes.subarray(at))
  return concat(parts)
}

/**
 * The wrap's proof (§2.5 (a)–(c)): `why` it fails, or null. (a) the section read back over our bytes (deltaSection: each entry
 * at its `n g obj`, /Prev our startxref, the startxref the section's); (b) each wrapped page's stream lexed again: our BDCs each
 * named by the page's groups and closed by an EMC at the same q depth, text-object state and depth of marked content, none in
 * a TJ; (c) its operators, ours taken out and each split show's chunks joined, the unwrapped page's: the same operators and
 * operands, the shows' codes and numbers (adjacent numbers summed, zeros dropped) in order
 */
function proveWrap(finalBytes, sectionBytes, { R, out }) {
  const sect = deltaSection(sectionBytes, { bytes: finalBytes.length, xref: startxrefOf(finalBytes) })
  if (sect.why) return `the section: ${sect.why}`
  for (const [p, x] of out) {
    if (!x.ok) continue
    const mine = lex(x.stream)
    // (b)
    const stack = []
    let q = 0, bt = false
    const flat = []
    for (const o of mine) {
      if (o.op === 'q') q++
      else if (o.op === 'Q') q--
      else if (o.op === 'BT') bt = true
      else if (o.op === 'ET') bt = false
      if (o.op === 'BDC' && o.args[0]?.v === 'OC' && /^axt/.test(o.args[1]?.v ?? '')) {
        const g = o.args[1].v.slice(3)
        if (!x.names.has(g)) return `page ${p}: a group not in its /Properties (${g})`
        stack.push({ ours: true, q, bt })
        continue
      }
      if (o.op === 'BDC' || o.op === 'BMC') { stack.push({ ours: false, q, bt }); flat.push(o); continue }
      if (o.op === 'EMC') {
        const top = stack.pop()
        if (!top) return `page ${p}: an EMC with no BDC`
        if (top.ours && (top.q !== q || top.bt !== bt)) return `page ${p}: a group closed at another depth or text state`
        if (!top.ours) flat.push(o)
        continue
      }
      flat.push(o)
    }
    if (stack.length) return `page ${p}: a group left open`
    // (c) the page's own operators, unwrapped
    const walk = R.walkPage(p - 1)
    const theirs = walk.pc.pieces.flatMap(pc => (pc.st ? lex(R.decode(pc.st)) : []))
    const why = sameOps(theirs, flat)
    R.release()
    if (why) return `page ${p}: ${why}`
  }
  return null
}

/** an operand's text for comparison (a string by its bytes, hex or not) */
const operand = v => (v?.t === 'str' ? `s${hex(v.b)}` : v?.t === 'name' ? `/${v.v}` : v?.t === 'dict' ? `<<${v.v.map(operand).join(' ')}>>` : Array.isArray(v) ? `[${v.map(operand).join(' ')}]` : v?.t === 'kw' ? v.v : String(v))
/** a show's elements: its codes as one byte run between numbers, adjacent numbers summed, zeros dropped */
function elementsOf(o) {
  const arr = o.op === 'TJ' ? o.args[0] : [o.args[o.op === '"' ? 2 : 0]]
  const out = []
  for (const el of Array.isArray(arr) ? arr : []) {
    const l = out.at(-1)
    if (typeof el === 'number') { if (typeof l === 'number') out[out.length - 1] = l + el; else out.push(el) }
    else if (el?.t === 'str') { if (l instanceof Uint8Array) out[out.length - 1] = concat([l, el.b]); else out.push(el.b) }
  }
  return out.filter(v => v !== 0).map(v => (typeof v === 'number' ? `n${Math.round(v * 1e6) / 1e6}` : `s${hex(v)}`)).join(',')
}
function sameOps(a, b) {
  let j = 0
  for (let i = 0; i < a.length; i++) {
    const o = a[i]
    if (SHOWS.has(o.op)) {
      // a split: its prefix's operators (T*, and " 's Tw and Tc) and then TJs whose elements join to the show's
      if (o.op === "'" || o.op === '"') {
        if (b[j]?.op === o.op && operand(b[j].args) === operand(o.args)) { j++; continue }
        const want = o.op === "'" ? ['T*'] : ['Tw', 'Tc', 'T*']
        for (const w of want) { if (b[j]?.op !== w) return `operator ${i}: a split show's ${w} missing`; j++ }
      } else if (b[j]?.op === o.op && operand(b[j].args) === operand(o.args)) { j++; continue }
      const target = elementsOf(o)
      const got = []
      while (j < b.length && b[j].op === 'TJ') {
        got.push(...b[j].args[0])
        j++
        if (elementsOf({ op: 'TJ', args: [got] }) === target) break
      }
      if (elementsOf({ op: 'TJ', args: [got] }) !== target) return `operator ${i}: a show whose chunks are not its codes`
      continue
    }
    const x = b[j++]
    if (!x || x.op !== o.op || (o.op !== 'BI' && operand(x.args) !== operand(o.args))) return `operator ${i} (${o.op}) is ${x ? x.op : 'missing'} in the wrapped stream`
  }
  if (j !== b.length) return `${b.length - j} operators more in the wrapped stream`
  return null
}

export { UNHIDDEN_MAX }

/**
 * Our final pass read, owned and wrapped: the maker child's one call, before any document of its own is open (its delta is then
 * built from the bytes this returns, and the page pass given them). `finalBytes` our final pass; `units` the paper's units (their
 * ids their indices: own.mjs takes their source text, and the marking's `follows` is made of them and the points read, unless
 * `follows` is given, or null for none); `getDocument` and `documentOptions` the engine's PDF.js and the host's options; `OPS`
 * its operator codes; `PL`, `deflate`, `inflate` wrapOf's. Every page our compile marks is wrapped; one PDF.js reads past its
 * bounds (capped, timed out, its boxes merged, rotated) is left unwrapped, its units the original's. Returns { bytes, xref,
 * sha256, stats, unhidden, labelKept } — `stats` { wrapped, refusedPages, unhidden: { marks, across, spell, page, bounds }, split,
 * groups, labelKept } (integers, the head's), `unhidden` [[unit id, code of UNHIDDEN], …] ascending, `labelKept` the unit ids
 * whose label is left the original's ink, `own` own.mjs's stats (the record's), `owned` own.mjs's whole result where `keepOwned`
 * (the lab's) — or { refused (WRAP_WHYS), why }: the paper's
 * base is then arXiv's PDF. Never throws but a failed allocation
 */
export async function wrapFinal(finalBytes, { PL, getDocument, documentOptions = {}, OPS, units = null, follows: given = undefined, deflate, inflate = null, keepOwned = false }) {
  let task = null
  const pages = [], facts = []
  try {
    task = getDocument({ ...documentOptions, data: finalBytes.slice() })
    const doc = await task.promise
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const ops = await page.getOperatorList()
      const ink = pageInk(OPS, ops, page.commonObjs, { rotate: page.rotate ?? 0, indices: true, glyphsMax: GLYPHS_PAGE, boxesMax: BOXES_PAGE })
      const unread = ink.rotated || ink.capped || ink.timedOut || ink.degraded
      pages.push(unread ? { glyphs: [], boxes: [], paths: [], points: [], boxAt: [], view: [...page.view] } : { glyphs: ink.glyphs.map(g => ({ n: g.n, k: g.k, u: g.u, x0: g.x0, x1: g.x1, ix0: g.ix0, ix1: g.ix1, y: g.y, size: g.size, top: g.top, bottom: g.bottom })), boxes: ink.boxes, paths: ink.paths, points: ink.points, boxAt: ink.boxAt, view: [...page.view] })
      facts.push(unread ? null : alignOf(OPS, ops))
      page.cleanup()
    }
  } catch (e) {
    if (isMemory(e)) throw e
    return { refused: 'wrap-parse', why: `PDF.js: ${String(e?.message ?? e)}`.slice(0, 300) }
  } finally { await task?.destroy?.().catch?.(() => {}) }
  const names = new Set(pages.flatMap(pg => pg.points.map(x => x.name)))
  const follows = given !== undefined ? given : units ? followsOf(units, names) : null
  const own = ownOf(pages, { units, follows })
  const plans = new Map()
  pages.forEach((pg, i) => { if (facts[i] && pg.points.length) plans.set(i + 1, { facts: facts[i], ...planOf(pg.glyphs, own.glyphs[i], pg.paths, own.boxes[i]) }) })
  const made = await wrapOf(finalBytes, plans, { units: own.units, PL, deflate, inflate })
  if (made.refused) return made
  // a unit on a page not wrapped, or with a placeholder where the page's groups were merged, is the original's
  for (const u of own.units.values()) {
    if (u.unhidden) continue
    for (const p of u.pages) {
      const x = made.pages.get(p)
      if (!x?.ok) { u.unhidden = 'page'; break }
      if (x.merged && [...u.groups].some(g => g.endsWith('.p'))) { u.unhidden = 'bounds'; break }
    }
  }
  const counts = Object.fromEntries(UNHIDDEN.map(k => [k, 0]))
  const unhidden = [], labelKept = []
  for (const [id, u] of [...own.units].sort((a, b) => a[0] - b[0])) {
    if (u.unhidden) { counts[u.unhidden]++; unhidden.push([id, u.unhidden]) }
    else if (u.labelKept) labelKept.push(id)
  }
  if (unhidden.length > UNHIDDEN_MAX || labelKept.length > UNHIDDEN_MAX) return { refused: 'wrap-bound', why: `${unhidden.length} units the original's, past ${UNHIDDEN_MAX}` }
  const stats = { ...made.stats, unhidden: counts, labelKept: labelKept.length }
  return { bytes: made.bytes, xref: made.xref, sha256: made.sha256, stats, unhidden, labelKept, own: { ...own.stats, unhidden: counts }, ...(keepOwned ? { owned: own } : {}) }
}

export { alignOf }
