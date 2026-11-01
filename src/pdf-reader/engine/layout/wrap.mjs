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
// reading, passes the walk's bounds or the wrap's (WRAP_DECODED_PAGE, WRAP_HELD_PAGE: every read of the page, the proof's too,
// under one budget), fails its proof, its own /Properties already name a group of ours (the page's own entries are kept, never
// dropped), holds a form partly owned, an owned run in a clipping text mode (Tr ≥ 4: hiding the only
// clipping run lifts the clip, E5), or a split in a vertical font or a Type 3 font without widths. A page past GROUPS_PAGE
// groups or SEQUENCES_PAGE sequences has its placeholders' and labels' groups merged into the text's (a unit with a placeholder
// there `bounds`), and is refused if still past; past GROUPS_DOC groups in the document, the later pages are refused.
//
// The proof (§2.5, (a)–(d)). Of each page before it is written (a failure refuses the page, never the paper): its new stream
// lexed again, every BDC of ours balanced by its EMC at its depth and text state, its operators, with ours taken out and the
// split shows joined, our page's, and the deflated bytes written inflated back to it. Of the paper: the section exact over our
// bytes (delta-wire.mjs deltaSection: every entry at its object, /Prev our startxref) and the wrapped document read again by the
// object layer (xref.mjs), its catalog, pages and resources ours but for /OCProperties, /Contents and /Properties, each page's
// own /Properties kept and ours beside them, every group listed and ON.
//
// An original module (no port statement). It imports the remover's lexer and page walk (layout/remove.mjs), the section writer
// and its reader; @cantoo/pdf-lib (MIT), deflate and inflate are given.
import { isMemoryError } from '../pipeline/memory.mjs'
import { DELTA_OBJECTS_MAX, deltaSection, rangesOf, UNHIDDEN_MAX } from './delta-wire.mjs'
import { figureUnitsOf, FIGURE_WHYS } from './figure-text.mjs'
import { BOXES_PAGE, GLYPHS_PAGE, pageInk } from './ink.mjs'
import { claimInk, inkOff, inkUnitsOf, keptUnitsOf } from './ink-units.mjs'
import { inkLeft, ledgerOf, ledgerSummary } from './ledger.mjs'
import { followsOf } from './marks.mjs'
import { ownOf, UNHIDDEN } from './own.mjs'
import { alignOf, DecodeLimit, lex, LexLimit, openRemover } from './remove.mjs'
import { appendSection } from './section.mjs'
import { startxrefOf } from './tail.mjs'
import { openObjects } from './xref.mjs'

/** the groups and the marked-content sequences of ours a page may hold, and the groups a document may (E1, E3) */
export const GROUPS_PAGE = 512, SEQUENCES_PAGE = 2000, GROUPS_DOC = 8000
/** what each read of one page may read and hold (the wrap's, the proof's of the new stream, the proof's of the unwrapped page:
 *  each under these bounds of its own, in turn): its content streams' decoded bytes, and its operators by their heap
 *  (remove.mjs COST, every operator counted, not the walk's alone: about 160 bytes an operator, so 48 MiB is about 300,000).
 *  Past either the page is not wrapped (its units the original's), never the paper and never the process: a plot of two
 *  million path operators (30 MB decoded) holds 320 MB of them. The remover's own walk keeps its HELD_MAX and BYTES_MAX */
export const WRAP_DECODED_PAGE = 32 * 2 ** 20, WRAP_HELD_PAGE = 48 * 2 ** 20
const BOUND_WHY = 'past the bounds a page\'s wrap may read'
/** why the wrap of a whole paper is refused (its base then arXiv's PDF, `wrap-<code>`) */
export const WRAP_WHYS = Object.freeze(['wrap-parse', 'wrap-proof', 'wrap-bound'])
/** an optional-content group's name as a viewer lists it, of a group's name */
export const ocgName = g => `axt:${g}`
/** a group's resource name in a page's /Properties and its content stream */
export const propName = g => `axt${g}`

const enc = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b }
const equalBytes = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true }
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
 * page), shows, paths } (planOf's), a page with none left unwrapped; `PL` @cantoo/pdf-lib's exports; `deflate` (bytes -> bytes, deterministic) and
 * `inflate` (bytes, limit -> bytes) as the remover takes them. Returns { bytes (finalBytes and the section), xref, sha256,
 * pages: Map p -> { ok, why?, groups, sequences, split, merged } (a page not ok or merged makes each unit on it `page` or, with a
 * placeholder, `bounds`: wrapFinal's), groups (in the document), stats } or { refused (a WRAP_WHYS code), why }.
 * Never throws but a failed allocation
 */
export async function wrapOf(finalBytes, plans, { PL, deflate, inflate, groupsPage = GROUPS_PAGE, sequencesPage = SEQUENCES_PAGE, groupsDoc = GROUPS_DOC }) {
  // (the written bytes are read back by `inflate`: without one no page could be proved, so none is asked for)
  if (typeof deflate !== 'function' || typeof inflate !== 'function') throw new TypeError('deflate, inflate: functions of bytes (inflate(bytes, limit))')
  let R
  try { R = await openRemover(finalBytes, { PL, inflate }) } catch (e) { if (isMemoryError(e)) throw e; return { refused: 'wrap-parse', why: String(e?.message ?? e).slice(0, 300) } }
  try {
    const { ctx, PDFName, PDFDict, PDFRef } = { ctx: R.ctx, ...PL }
    const out = new Map()
    const docGroups = new Map() // group -> object number
    let next = ctx.largestObjectNumber + 1
    const objects = []
    const lit = v => (v instanceof PDFRef ? `${v.objectNumber} ${v.generationNumber} R` : v instanceof PDFDict ? `<<${v.entries().map(([k, x]) => ` ${k.toString()} ${lit(x)}`).join('')} >>` : v instanceof PL.PDFArray ? `[${v.asArray().map(lit).join(' ')}]` : v.toString())
    const order = [...plans.keys()].sort((a, b) => a - b)
    let docFull = false
    // (a form a page's figures were wrapped in, by its object, and the page: a later page whose figures want it again leaves
    // them the original's, `shared`; the forms written, for the proof)
    const rewritten = new Map(), formsWritten = []
    for (const p of order) {
      const plan = plans.get(p)
      if (docFull) { out.set(p, { ok: false, why: `past ${groupsDoc} groups in the document` }); continue }
      // the page's wrap, its proof and its bytes read back: any failure of these but a failed allocation is the page's alone (its
      // units the original's), never the paper's
      // (the ladder: the page as planned; where that fails or passes a bound and the page holds a figure's group, the page
      // without its figures' groups (their units `bounds`: a figure never costs the page); then with its placeholders' and
      // labels' groups merged into the text's)
      const page = () => {
        if (!planHasFigures(plan)) return attempt(false)
        let first
        try { first = attempt(true) } catch (e) {
          if (isMemoryError(e)) throw e
          first = { made: { ok: false, why: `its wrap with its figures failed: ${String(e?.message ?? e).slice(0, 160)}` } }
        }
        // (the page as it is wrapped without its figures, whatever came of it: a figure never costs the page)
        return first.made.ok ? first : attempt(false)
      }
      const attempt = figures => {
        const past = m => m.ok && (m.groups.size > groupsPage || m.sequences > sequencesPage)
        let made = wrapPage(R, p, plan, { merge: false, figures, rewritten })
        if (past(made)) {
          if (figures) return { made: { ok: false, why: 'past its bounds with its figures' } }
          made = wrapPage(R, p, plan, { merge: true, figures: false, rewritten })
          if (made.ok && (made.groups.size > groupsPage || made.sequences > sequencesPage)) made = { ok: false, why: `${made.groups.size} groups and ${made.sequences} sequences, past ${groupsPage} and ${sequencesPage}` }
          else if (made.ok) made.merged = true
        }
        if (made.ok && [...made.groups].filter(g => !docGroups.has(g)).length + docGroups.size > groupsDoc) {
          if (figures) return { made: { ok: false, why: `past ${groupsDoc} groups in the document with its figures` } }
          made = { ok: false, why: `past ${groupsDoc} groups in the document`, docFull: true }
        }
        // the page's own /Properties kept whole, ours beside them under names of our own; a page that already names one of ours
        // is not wrapped (B3: never an entry of the page's dropped)
        const node = made.ok ? made.walk.node : null, res = node ? node.Resources() : null
        const own = res instanceof PDFDict ? R.look(res.get(PDFName.of('Properties'))) : undefined
        if (made.ok && own instanceof PDFDict && own.entries().some(([k]) => made.groups.has(k.decodeText?.()?.replace(/^axt/, '') ?? '') && /^\/axt/.test(k.toString()))) made = { ok: false, why: 'its /Properties already name a group of ours' }
        // (b), (c): the page's stream proved before it is written, and the bytes written read back (deflate's output inflated)
        let data = null
        if (made.ok) {
          const why = provePage(R, made) ?? made.forms.map(f => proveForm(R, f)).find(w => w) ?? null
          if (why) made = { ok: false, why: `its proof: ${why}` }
          else {
            const packed = s => { const d = deflate(s); let back = null; try { back = inflate(d, s.length) } catch (e) { if (isMemoryError(e)) throw e } return back && equalBytes(back, s) ? d : null }
            data = packed(made.stream)
            for (const f of made.forms) f.data = data && packed(f.stream)
            if (!data || made.forms.some(f => !f.data)) made = { ok: false, why: 'its deflated stream does not inflate to the stream proved' }
          }
        }
        return { made, data, node, res, own }
      }
      let made, data = null, node = null, res = null, own
      try { ({ made, data, node, res, own } = page()) } catch (e) {
        if (isMemoryError(e)) throw e
        made = { ok: false, why: `its wrap failed: ${String(e?.message ?? e).slice(0, 200)}` }
      }
      R.release()
      if (made.docFull) docFull = true
      if (!made.ok) { out.set(p, { ok: false, why: made.why }); continue }
      for (const g of [...made.groups].sort()) if (!docGroups.has(g)) docGroups.set(g, next++)
      // each form the page's figures were wrapped in, written again under its own number: its stream ours, its resources its
      // own with /Properties naming its groups (a form rewritten once in the document: rewritten)
      for (const f of made.forms) {
        rewritten.set(f.key, p)
        const fref = f.cont.ref, dict = f.cont.st.dict
        const fres = R.look(dict.get(PDFName.of('Resources')))
        const fown = fres instanceof PDFDict ? R.look(fres.get(PDFName.of('Properties'))) : undefined
        const fEntries = fres instanceof PDFDict ? fres.entries().filter(([k]) => k.toString() !== '/Properties') : []
        const fprops = fown instanceof PDFDict ? fown.entries().map(([k, v]) => ` ${k.toString()} ${lit(v)}`) : []
        for (const g of [...f.groups].sort()) fprops.push(` /${propName(g)} ${docGroups.get(g)} 0 R`)
        const dEnts = dict.entries().filter(([k]) => !['/Length', '/Filter', '/DecodeParms', '/Resources'].includes(k.toString())).map(([k, v]) => ` ${k.toString()} ${lit(v)}`)
        objects.push([fref.objectNumber, fref.generationNumber, concat([enc(`${fref.objectNumber} ${fref.generationNumber} obj\n<<${dEnts.join('')} /Resources <<${fEntries.map(([k, v]) => ` ${k.toString()} ${lit(v)}`).join('')} /Properties <<${fprops.join('')} >> >> /Filter /FlateDecode /Length ${f.data.length} >>\nstream\n`), f.data, enc('\nendstream\nendobj\n')])])
        formsWritten.push({ ref: fref, groups: f.groups })
      }
      // the page's stream, its resources with our /Properties, its dict again under its number
      const sref = next++
      objects.push([sref, 0, concat([enc(`${sref} 0 obj\n<< /Filter /FlateDecode /Length ${data.length} >>\nstream\n`), data, enc('\nendstream\nendobj\n')])])
      const pageRef = R.doc.getPages()[p - 1].ref
      const resEntries = res instanceof PDFDict ? res.entries().filter(([k]) => k.toString() !== '/Properties') : []
      const props = own instanceof PDFDict ? own.entries().map(([k, v]) => ` ${k.toString()} ${lit(v)}`) : []
      for (const g of [...made.groups].sort()) props.push(` /${propName(g)} ${docGroups.get(g)} 0 R`)
      const resText = `<<${resEntries.map(([k, v]) => ` ${k.toString()} ${lit(v)}`).join('')} /Properties <<${props.join('')} >> >>`
      const ents = node.entries().filter(([k]) => k.toString() !== '/Contents' && k.toString() !== '/Resources').map(([k, v]) => ` ${k.toString()} ${lit(v)}`)
      objects.push([pageRef.objectNumber, pageRef.generationNumber, enc(`${pageRef.objectNumber} ${pageRef.generationNumber} obj\n<<${ents.join('')} /Resources ${resText} /Contents ${sref} 0 R >>\nendobj\n`)])
      out.set(p, { ok: true, groups: made.groups.size, sequences: made.sequences, split: made.split, merged: !!made.merged, names: made.groups, figureWhy: made.figureWhy, forms: made.forms.length })
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
    const proof = proveWrap(finalBytes, section.bytes, { out, PL, groups: docGroups, forms: formsWritten })
    if (proof) return { refused: 'wrap-proof', why: proof }
    return { bytes, xref: section.xref, sha256: await sha256Of(bytes), pages: out, groups: docGroups, stats, forms: formsWritten.length }
  } catch (e) {
    if (isMemoryError(e)) throw e
    return { refused: 'wrap-parse', why: String(e?.message ?? e).slice(0, 300) }
  }
}

async function sha256Of(bytes) {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
  let s = ''
  for (let i = 0; i < d.length; i++) s += HEX[d[i]]
  return s
}

/** a page's read budget: its decoded bytes and its operators' heap so far (WRAP_DECODED_PAGE, WRAP_HELD_PAGE) */
const pageBudget = () => ({ bytes: 0, held: 0 })
/** a content stream's bytes and every operator of it, within the page's budget: { bytes, ops } or { why } */
function readPiece(R, piece, budget) {
  try {
    const bytes = piece.st ? R.decode(piece.st, WRAP_DECODED_PAGE - budget.bytes) : new Uint8Array(0)
    budget.bytes += bytes.length
    if (budget.bytes > WRAP_DECODED_PAGE) return { why: BOUND_WHY }
    const ops = lex(bytes, WRAP_HELD_PAGE - budget.held)
    budget.held += ops.bytes
    return { bytes, ops }
  } catch (e) {
    if (e instanceof DecodeLimit || e instanceof LexLimit) return { why: BOUND_WHY }
    throw e
  }
}
/** our stream lexed within the budget, or null past it */
function lexWithin(bytes, budget) {
  if ((budget.bytes += bytes.length) > WRAP_DECODED_PAGE) return null
  try { const ops = lex(bytes, WRAP_HELD_PAGE - budget.held); budget.held += ops.bytes; return ops } catch (e) { if (e instanceof LexLimit) return null; throw e }
}

/** a figure's group (layout/figure-text.mjs figureGroup): `f<k>` */
const isFigure = g => typeof g === 'string' && g.startsWith('f')
/** whether a page's plan holds a figure's group, and which (wrapOf's ladder) */
const planHasFigures = plan => figureGroupsOf(plan).size > 0
function figureGroupsOf(plan) {
  if (plan.figureGroups) return plan.figureGroups
  const out = new Set()
  for (const row of plan.shows.values()) for (const g of row) if (isFigure(g)) out.add(g)
  plan.figureGroups = out
  return out
}

/**
 * One page wrapped (or why not): its walk aligned with PDF.js's facts, each event's group, the page's own operators lexed
 * whole and the runs written. `merge` folds the placeholders' and labels' groups into the text's (the bounds' ladder);
 * `figures` false leaves every figure's group out (its ink the page's). A figure's run inside a form is wrapped in the form's own
 * stream, written again (`forms`), where that form is an object of its own with resources of its own, painted once on the page
 * and rewritten by no page before (`rewritten`), and holds no unit's ink beside the figures'; where it is not, or where the run's
 * font gives no Unicode a reader can trust (remove.mjs unicodeOf), the figure's group is left out, its unit the original's
 * (`figureWhy`: group -> 'shared' | 'unicode' | 'bounds')
 */
function wrapPage(R, p, plan, { merge, figures = true, rewritten = new Map() }) {
  const budget = pageBudget()
  const al = R.alignPage(p - 1, plan.facts)
  if (!al.ok) return { ok: false, why: al.why.slice(0, 3).join('; ') }
  const figureWhy = new Map()
  const drop = new Set()
  const fold = g => (g === null || g === undefined ? g : drop.has(g) || (!figures && isFigure(g)) ? null : !merge ? g : g.replace(/\.[pl]$/, ''))
  const walk = al.walk, pc = walk.pc
  const showN = new Map(al.shows.map((e, n) => [e, n])), paintM = new Map((al.paints ?? []).map((e, m) => [e, m]))
  if (!al.paints && plan.paths.size) return { ok: false, why: 'its painted paths do not align' }
  const top = cont => { let c = cont; while (c.parent && c.parent !== pc) c = c.parent; return c }
  const formOf = new Map() // a form container directly under the page -> its Do event
  for (const e of walk.events) if (e.kind === 'form' && e.cont === pc) formOf.set(e.child, e)
  // (each event's groups as planned: a show's by its codes, a paint's)
  const raw = new Map()
  for (const e of walk.events) {
    if (e.kind === 'show') raw.set(e, codeGroups(plan.shows.get(showN.get(e)), e.codes.length))
    else if (e.kind === 'paint') raw.set(e, [plan.paths.get(paintM.get(e)) ?? null])
    else if (e.kind === 'image') raw.set(e, [null])
  }
  // a figure's groups: kept where its show and its form can carry them, else dropped (its unit the original's)
  if (figures) {
    const unitInForm = new Set() // the top-level forms that hold a unit's ink
    for (const [e, gs] of raw) if (e.cont !== pc && gs.some(g => g && !isFigure(g))) unitInForm.add(top(e.cont))
    for (const [e, gs] of raw) {
      const fg = gs.filter(isFigure)
      if (!fg.length) continue
      let why = null
      if (e.kind === 'show' && e.state.font?.unicode === false) why = 'unicode'
      else if (e.cont !== pc) {
        for (let c = e.cont; c && c !== pc && !why; c = c.parent) {
          if (!c.ref || !c.ownRes || (walk.uses.get(c.st) ?? 0) !== 1) why = 'shared'
          else if (rewritten.has(c.key) && rewritten.get(c.key) !== p) why = 'shared'
        }
        if (!why && unitInForm.has(top(e.cont))) why = 'shared'
      }
      if (why) for (const g of fg) { drop.add(g); if (!figureWhy.has(g)) figureWhy.set(g, why) }
    }
  }
  // each event's groups now; a form's Do takes the groups of everything in it but a figure's (a figure's run is wrapped where it
  // is shown, in the form's own stream)
  const groupsOf = new Map()
  const inForm = new Map() // Do event -> Set of groups (null for unowned ink)
  for (const [e, gs0] of raw) {
    const gs = gs0.map(fold)
    if (e.cont === pc) { groupsOf.set(e, gs); continue }
    const d = formOf.get(top(e.cont))
    if (!d) continue
    const set = inForm.get(d) ?? inForm.set(d, new Set()).get(d)
    for (const g of gs) set.add(isFigure(g) ? null : g)
    if (gs.some(isFigure)) groupsOf.set(e, gs)
  }
  for (const [d, set] of inForm) {
    const owned = [...set].filter(g => g !== null)
    if (owned.length > 1 || (owned.length === 1 && set.has(null))) return { ok: false, why: 'a form partly owned' }
    groupsOf.set(d, owned.length ? [owned[0]] : [null])
  }
  // each container's operators, whole, piece by piece (the page's pieces, a form's one stream), and where each walked event is
  // among them: the page always, a form where a figure's run is in it
  const groups = new Set()
  let sequences = 0, split = 0
  const pieces = [], forms = []
  const edited = new Set([pc])
  for (const e of groupsOf.keys()) if (e.cont !== pc) edited.add(e.cont)
  for (const cont of walk.containers) {
    if (!edited.has(cont)) continue
    const outPieces = [], contGroups = new Set()
    for (let pi = 0; pi < cont.pieces.length; pi++) {
      const read = readPiece(R, cont.pieces[pi], budget)
      if (read.why) return { ok: false, why: read.why }
      const { bytes, ops } = read
      const byEnd = new Map(ops.map((o, i) => [o.e, i]))
      const role = new Array(ops.length).fill(null) // { g, s, e, text? } for an owned operator (or a split's text)
      for (const [e, gs] of groupsOf) {
        if (e.cont !== cont || e.pi !== pi) continue
        const wo = cont.ops[pi][e.oi], i = byEnd.get(wo.e)
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
          for (const g of text.groups) { groups.add(g); contGroups.add(g) }
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
      const close = () => { if (run) { edits.push({ s: run.end, e: run.end, text: ' EMC ', o: 0 }); groups.add(run.g); contGroups.add(run.g); sequences++; run = null } }
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
      outPieces.push(applyInserts(bytes, edits))
    }
    if (cont === pc) pieces.push(...outPieces)
    else if (contGroups.size) forms.push({ key: cont.key, cont, groups: contGroups, stream: outPieces[0] })
  }
  // (a figure whose group no run of it carries, dropped or not reached, is the original's)
  for (const g of figureGroupsOf(plan)) if (!groups.has(g) && !figureWhy.has(g)) figureWhy.set(g, figures ? 'shared' : 'bounds')
  return { ok: true, walk, groups, sequences, split, forms, figureWhy, stream: concat(pieces.flatMap((b, i) => (i ? [enc('\n'), b] : [b]))) }
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
function proveWrap(finalBytes, sectionBytes, { out, PL, groups, forms = [] }) {
  const sect = deltaSection(sectionBytes, { bytes: finalBytes.length, xref: startxrefOf(finalBytes) })
  if (sect.why) return `the section: ${sect.why}`
  return graphWhy(finalBytes, concat([finalBytes, sectionBytes]), { PL, out, groups, forms })
}

/**
 * (b), (c) of one page, on the stream about to be written, within the page's bounds (`why`, or null): every BDC of ours named by
 * the page's groups and closed by an EMC at the same q depth and text state (the page's own marked content need not balance:
 * our runs close at every BDC, BMC and EMC of its, so they lie in none), none left open; its operators, ours taken out and each
 * split show's chunks joined, the unwrapped page's
 */
function provePage(R, made) {
  const budget = pageBudget()
  const mine = lexWithin(made.stream, budget)
  if (!mine) return BOUND_WHY
  const ours = flatOf(mine, made.groups)
  if (ours.why) return ours.why
  // (the unwrapped page read again under a budget of its own: each read of a page within the documented bounds. Its pieces are
  // the wrap's walk's list, its /Contents' streams as the object layer holds them, which a walk again would find the same; every
  // piece's bytes are decoded and lexed here again, as a form's are by proveForm)
  const theirsBudget = pageBudget()
  const theirs = []
  for (const piece of made.walk.pc.pieces) {
    const read = readPiece(R, piece, theirsBudget)
    if (read.why) return read.why
    for (const o of read.ops) theirs.push(o)
  }
  return sameOps(theirs, ours.flat)
}

/** (b), (c) of a form a page's figures were wrapped in, as of a page: its new stream's groups each its own /Properties' and
 *  balanced at its depth and text state, its operators, ours taken out, the form's own (`why`, or null) */
function proveForm(R, f) {
  const mine = lexWithin(f.stream, pageBudget())
  if (!mine) return BOUND_WHY
  const ours = flatOf(mine, f.groups)
  if (ours.why) return `a form's ${ours.why}`
  const read = readPiece(R, f.cont.pieces[0], pageBudget())
  if (read.why) return read.why
  const why = sameOps(read.ops, ours.flat)
  return why ? `a form's ${why}` : null
}

/** a stream's operators with ours taken out (`flat`), where every BDC of ours names one of `groups` and is closed by an EMC at
 *  its q depth and text state, none inside another, none left open and none over q, Q, BT, ET or an inline image; else `why` */
function flatOf(mine, groups) {
  const stack = []
  let q = 0, bt = false, open = 0
  const flat = []
  for (const o of mine) {
    if (o.op === 'q') q++
    else if (o.op === 'Q') q--
    else if (o.op === 'BT') bt = true
    else if (o.op === 'ET') bt = false
    if (o.op === 'BDC' && o.args[0]?.v === 'OC' && /^axt/.test(o.args[1]?.v ?? '')) {
      const g = o.args[1].v.slice(3)
      if (!groups.has(g)) return { why: `a group not in its /Properties (${g})` }
      if (stack.at(-1)?.ours) return { why: 'a group of ours inside another' }
      stack.push({ ours: true, q, bt })
      open++
      continue
    }
    if (o.op === 'BDC' || o.op === 'BMC') { stack.push({ ours: false, q, bt }); flat.push(o); continue }
    if (o.op === 'EMC') {
      if (stack.at(-1)?.ours) {
        const top = stack.pop()
        open--
        if (top.q !== q || top.bt !== bt) return { why: 'a group closed at another depth or text state' }
        continue
      }
      stack.pop()
      flat.push(o)
      continue
    }
    if (open && (o.op === 'q' || o.op === 'Q' || o.op === 'BT' || o.op === 'ET' || o.op === 'BI')) return { why: `a group of ours over ${o.op}` }
    flat.push(o)
  }
  if (open) return { why: 'a group left open' }
  return { flat }
}

/**
 * (d) The wrapped document read again by the object layer as PDF.js reads it (xref.mjs), against our pass: the catalog ours
 * but its /OCProperties, which lists every group of ours and holds each in its default /ON; each page our pass's object, its
 * dict ours but /Contents and /Resources, its resources ours but /Properties, which names each of the page's groups by its
 * resource name and an OCG of its name; every page not wrapped ours whole. `why`, or null
 */
function graphWhy(finalBytes, bytes, { PL, out, groups, forms = [] }) {
  const { PDFDict, PDFArray, PDFRef, PDFName, PDFRawStream } = PL
  const bound = { PL, objectsMax: DELTA_OBJECTS_MAX, decodedMax: 48 * 2 ** 20 }
  const F = openObjects(finalBytes, bound), X = openObjects(bytes, bound)
  const look = (D, v) => (v instanceof PDFRef ? D.lookup(v) : v)
  const text = v => (v === undefined ? 'none' : v instanceof PDFRef ? `${v.objectNumber} ${v.generationNumber} R` : v.toString())
  const sameBut = (a, b, but) => {
    if (!(a instanceof PDFDict) || !(b instanceof PDFDict)) return false
    const ka = a.entries().filter(([k]) => !but.includes(k.asString())), kb = b.entries().filter(([k]) => !but.includes(k.asString()))
    return ka.length === kb.length && ka.every(([k, v]) => text(b.get(k)) === text(v))
  }
  const refs = v => (v instanceof PDFArray ? v.asArray().map(text) : [])
  const fc = look(F, F.trailer.root), xc = look(X, X.trailer.root)
  if (text(X.trailer.root) !== text(F.trailer.root) || !sameBut(xc, fc, ['/OCProperties'])) return 'the catalog is not ours but for /OCProperties'
  const oc = look(X, xc.get(PDFName.of('OCProperties'))), ocgs = new Set(refs(look(X, oc?.get?.(PDFName.of('OCGs'))))), on = new Set(refs(look(X, look(X, oc?.get?.(PDFName.of('D')))?.get?.(PDFName.of('ON')))))
  for (const [g, n] of groups) if (!ocgs.has(`${n} 0 R`) || !on.has(`${n} 0 R`)) return `the group ${g} is not in /OCProperties, or not ON`
  const fp = F.pages(), xp = X.pages()
  if (fp.length !== xp.length) return 'another page count'
  for (let p = 1; p <= fp.length; p++) {
    const a = fp[p - 1], b = xp[p - 1], x = out.get(p)
    if (text(a.ref) !== text(b.ref)) return `page ${p} is another object`
    if (!x?.ok) { if (!sameBut(b.node, a.node, [])) return `page ${p}, not wrapped, is not ours`; continue }
    if (!sameBut(b.node, a.node, ['/Contents', '/Resources'])) return `page ${p}'s dict is not ours but for its contents and resources`
    const ra = look(F, a.inherited.Resources), rb = look(X, b.node.get(PDFName.of('Resources')))
    if (!sameBut(rb, ra, ['/Properties'])) return `page ${p}'s resources are not ours but for /Properties`
    const props = look(X, rb.get(PDFName.of('Properties'))), theirs = look(F, ra?.get?.(PDFName.of('Properties')))
    // (the page's own entries every one kept as it was, ours beside them and nothing else)
    const mine = new Set([...x.names].map(g => `/${propName(g)}`))
    const kept = theirs instanceof PDFDict ? theirs.entries() : []
    if (!(props instanceof PDFDict) || props.entries().length !== kept.length + mine.size) return `page ${p}: its /Properties are not its own and ours`
    for (const [k, v] of kept) if (mine.has(k.toString()) || text(props.get(k)) !== text(v)) return `page ${p}: its own /Properties entry ${k.toString()} is not kept`
    for (const g of x.names) {
      const r = props?.get?.(PDFName.of(propName(g))), o = look(X, r)
      if (!(r instanceof PDFRef) || !(o instanceof PDFDict) || o.get(PDFName.of('Type'))?.asString?.() !== '/OCG' || o.get(PDFName.of('Name'))?.decodeText?.() !== ocgName(g) || text(r) !== `${groups.get(g)} 0 R`) return `page ${p}: its /Properties do not name the group ${g}`
    }
  }
  // each form a figure's runs were wrapped in: the same object, its dict ours but its stream's keys and /Resources, its resources
  // its own but /Properties, which holds its own entries and names each of its groups by an OCG of its name
  for (const { ref, groups: names } of forms) {
    const a = F.lookup(ref), b = X.lookup(ref)
    if (!(a instanceof PDFRawStream) || !(b instanceof PDFRawStream)) return `the form ${text(ref)} is not a stream`
    if (!sameBut(b.dict, a.dict, ['/Length', '/Filter', '/DecodeParms', '/Resources'])) return `the form ${text(ref)}'s dict is not ours but for its stream and resources`
    const ra = look(F, a.dict.get(PDFName.of('Resources'))), rb = look(X, b.dict.get(PDFName.of('Resources')))
    if (!sameBut(rb, ra, ['/Properties'])) return `the form ${text(ref)}'s resources are not its own but for /Properties`
    const props = look(X, rb.get(PDFName.of('Properties'))), theirs = look(F, ra?.get?.(PDFName.of('Properties')))
    const kept = theirs instanceof PDFDict ? theirs.entries() : []
    if (!(props instanceof PDFDict) || props.entries().length !== kept.length + names.size) return `the form ${text(ref)}: its /Properties are not its own and ours`
    for (const [k, v] of kept) if (text(props.get(k)) !== text(v)) return `the form ${text(ref)}: its own /Properties entry ${k.toString()} is not kept`
    for (const g of names) {
      const r = props.get(PDFName.of(propName(g))), o = look(X, r)
      if (!(r instanceof PDFRef) || !(o instanceof PDFDict) || o.get(PDFName.of('Name'))?.decodeText?.() !== ocgName(g) || text(r) !== `${groups.get(g)} 0 R`) return `the form ${text(ref)}: its /Properties do not name the group ${g}`
    }
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
        // (" sets the word and character spacing it is given before its T*: a split writes them as Tw and Tc, the same numbers)
        const want = o.op === "'" ? [['T*', null]] : [['Tw', o.args[0]], ['Tc', o.args[1]], ['T*', null]]
        for (const [w, v] of want) {
          if (b[j]?.op !== w) return `operator ${i}: a split show's ${w} missing`
          if (v !== null && !(typeof v === 'number' && typeof b[j].args[0] === 'number' && Math.abs(b[j].args[0] - v) < 5e-7)) return `operator ${i}: a split show's ${w} not its own`
          j++
        }
      } else if (b[j]?.op === o.op && operand(b[j].args) === operand(o.args)) { j++; continue }
      const target = elementsOf(o)
      const got = []
      while (j < b.length && b[j].op === 'TJ') {
        for (const el of b[j].args[0]) got.push(el)
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
 * ids their indices, the SOURCE units — pipeline/live.mjs openPaper's `units`, layerOfPaper's `source.units`, each { kind, pieces:
 * [{ t: 'text', s } | { t: 'ph', src } | …] }, never a translation's (a record's, whose text pieces are `tr`: a TypeError): own.mjs
 * spells each against its `src` where it has one, else its pieces' plain source text, and the marking's `follows` is made of
 * them and the points read, unless `follows` is given, or null for none); `getDocument` and `documentOptions` the engine's PDF.js and the host's options; `OPS`
 * its operator codes; `texts`, the marks file's `marking.texts` (flat [macro source, text, …], or a Map; null: only a text
 * symbol's text is known, own.mjs's cell leads); `inkless`, the marks file's `marking.inkless` (the macros TeX said set no ink,
 * which own.mjs reads as no placeholder of ink, as the maker does; null: none known); `names`, the paper's theorem-like
 * environments' printed names (openPaper's `theoremNames`, source/paper-names.mjs), each a name a head's label may hold, as
 * "Theorem" is (own.mjs labelFormOf; null: the standard names alone); `PL`, `deflate`, `inflate` wrapOf's. Every page our compile marks is wrapped; one PDF.js reads past its
 * bounds (capped, timed out, its boxes merged, rotated) is left unwrapped, its units the original's. Returns { bytes, xref,
 * sha256, stats, unhidden, labelKept } — `stats` { wrapped, refusedPages, unhidden: { marks, across, spell, page, bounds }, split,
 * groups, labelKept } (integers, the head's: every unit counted), `unhidden` [[unit id, code of UNHIDDEN], …] ascending and
 * `labelKept` the unit ids whose label is left the original's ink, each of the units with a group in the document alone (a
 * unit with none is the original's: no reader can hide it), `pages` the pages wrapped as ranges (the host's delta must replace
 * every one: layerOfPaper refuses a delta that does not), `own` own.mjs's stats (the record's), `ledger` the content classes'
 * counts and first orphans (layout/ledger.mjs ledgerSummary: the head's base `ledger`), `ink` the ink units (layout/ink-units.mjs:
 * { base, units }, the page pass's `ours.ink`, opaque to the host; their ids from `inkFrom` on, the bundle's units before them:
 * the source units' and the paper's structural names', layer-proto/units.mjs bundleUnitsOf; `units.length` where it is not
 * given), `owned` own.mjs's whole result and `ledgerWhole` the ledger's
 * where `keepOwned` (the lab's); `figures` the figure units drawn and their counts (layout/figure-text.mjs: each its group in the
 * document; `figureUnits` every unit cut, with why, where `keepOwned`), none asked with `figures` false (the lab's A/B);
 * `bounds` { groupsPage, sequencesPage, groupsDoc } wrapOf's (tests) — or { refused (WRAP_WHYS), why }: the paper's
 * base is then arXiv's PDF. Never throws but a failed allocation
 */
/** a point as ownership reads it: its name in lower case, as every mark's name is written (marks.mjs MARK_NAME): a class that
 *  sets a title or a heading by \\uppercase (spconf's \\section, amsart's \\title) sets its marks' names in capitals with it,
 *  `/axt-H0E ri` (2610.20967v1, 2610.20581v1), the same mark at the same place */
const lowerPoint = x => (/[A-Z]/.test(x.name) ? { ...x, name: x.name.toLowerCase() } : x)

export async function wrapFinal(finalBytes, { PL, getDocument, documentOptions = {}, OPS, units, follows: given = undefined, texts, inkless, names: theoremNames, deflate, inflate, keepOwned = false, bounds = {}, figures: withFigureText = true, inkFrom = null }) {
  // (units required: null alone, said, asks for no spell check, the lab's pair whose source is not read; deflate and inflate
  // required, the written bytes read back)
  if (units === undefined) throw new TypeError('units: the paper\'s source units, or null said for no spell check')
  if (typeof deflate !== 'function' || typeof inflate !== 'function') throw new TypeError('deflate, inflate: functions of bytes (inflate(bytes, limit))')
  // (texts required, as units are: the marks file's `marking.texts` where the caller holds the marks, null said where it does not —
  // a caller that drops them where it has them would leave every cell's lead macro the original's, unseen)
  if (texts === undefined) throw new TypeError('texts: the marks file\'s marking.texts (flat [source, text, …] or a Map), or null said where the marks are not in hand')
  // (inkless required as texts are: a title that opens with \\boldmath, read as a placeholder of ink with no mark of its own,
  // kept its lead's JCAP header line and was the original's, 2609.20976v1 u0)
  if (inkless === undefined) throw new TypeError('inkless: the marks file\'s marking.inkless (the macros TeX said set no ink: an array or a Set), or null said where the marks are not in hand')
  // (names required as texts are: a host that drops them leaves every head of a name the paper defines ("Recall 7 (") the
  // original's ink in no group, its translation drawn over it where a figure's text takes it, 2501.14787v1 pp10-11)
  if (theoremNames === undefined || (theoremNames !== null && !(Array.isArray(theoremNames) && theoremNames.every(n => typeof n === 'string')))) throw new TypeError('names: the paper\'s theorem-like environments\' printed names (openPaper\'s theoremNames: an array of strings), or null said where the source is not read')
  // (the paper's SOURCE units: a translation's (a record's units, its text pieces `tr`) holds no text after a placeholder to
  // find its ink's end by, nor the source text the spell check reads)
  if (units !== null && (!Array.isArray(units) || units.some(u => u?.pieces?.some?.(p => p?.tr)))) throw new TypeError('units: the paper\'s source units (live.mjs openPaper\'s, layerOfPaper\'s `source.units`), not a translation\'s')
  // (the ink units' first id: the bundle's units before them, at least the source units')
  if (inkFrom !== null && !(Number.isInteger(inkFrom) && inkFrom >= (units?.length ?? 0))) throw new TypeError(`inkFrom: the bundle's units before the ink units (bundleUnitsOf(paper).length), at least units.length, or null (${String(inkFrom)})`)
  const inkBase = units ? inkFrom ?? units.length : 0
  // (each unit one the spell check can read: a source text or pieces; a hole, or an entry with neither, is no paper's units.
  // null alone asks for no spell check, the lab's pair whose source is not read)
  if (units !== null) for (let i = 0; i < units.length; i++) {
    const u = units[i]
    if (!u || typeof u !== 'object' || !(typeof u.src === 'string' || Array.isArray(u.pieces))) throw new TypeError(`units[${i}]: no source text and no pieces`)
  }
  let task = null
  const pages = [], facts = []
  try {
    task = getDocument({ ...documentOptions, data: finalBytes.slice() })
    const doc = await task.promise
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const ops = await page.getOperatorList()
      const ink = pageInk(OPS, ops, page.commonObjs, { rotate: page.rotate ?? 0, indices: true, turned: true, glyphsMax: GLYPHS_PAGE, boxesMax: BOXES_PAGE })
      const unread = ink.rotated || ink.capped || ink.timedOut || ink.degraded
      pages.push(unread ? { glyphs: [], turned: [], shapes: new Map(), pictures: [], figures: new Map(), boxes: [], paths: [], points: [], boxAt: [], view: [...page.view] } : { glyphs: ink.glyphs.map(g => ({ n: g.n, k: g.k, u: g.u, x0: g.x0, x1: g.x1, ix0: g.ix0, ix1: g.ix1, y: g.y, size: g.size, top: g.top, bottom: g.bottom, font: g.font, fill: g.fill, ...(g.blank ? { blank: true } : {}), ...(g.form ? { form: true } : {}), ...(g.clipped ? { clipped: true } : {}), ...(g.fid ? { fid: g.fid } : {}), ...(g.pid ? { pid: g.pid } : {}) })), turned: ink.turned, shapes: ink.shapes, pictures: ink.pictures, figures: ink.figures, boxes: ink.boxes, paths: ink.paths, points: ink.points.map(lowerPoint), paras: ink.paras ?? [], boxAt: ink.boxAt, view: [...page.view] })
      facts.push(unread ? null : alignOf(OPS, ops))
      page.cleanup()
    }
  } catch (e) {
    if (isMemoryError(e)) throw e
    return { refused: 'wrap-parse', why: `PDF.js: ${String(e?.message ?? e)}`.slice(0, 300) }
  } finally { await task?.destroy?.().catch?.(() => {}) }
  const names = new Set(pages.flatMap(pg => pg.points.map(x => x.name)))
  // (the texts the marking's probe showed the paper's macros set: the marks file's `marking.texts`, flat [source, text, …]
  // pairs, or a Map; a cell's lead macro is owned by them alone, own.mjs; and a split piece's ink, after a macro, ends as the
  // maker's reading parts it: marks.mjs followsOf `split`)
  const shown = texts instanceof Map ? texts : Array.isArray(texts) ? new Map(Array.from({ length: Math.floor(texts.length / 2) }, (_, j) => [texts[2 * j], texts[2 * j + 1]]).filter(([a, b]) => typeof a === 'string' && typeof b === 'string')) : null
  const follows = given !== undefined ? given : units ? followsOf(units, names, shown) : null
  const own = ownOf(pages, { units, follows, texts: shown, inkless: inkless === null ? null : new Set(inkless), names: theoremNames })
  // (the text inside the vector figures, no source unit's: its figure units, each its own group f<k>, a crowded one none;
  // layout/figure-text.mjs), cut before the ink units so that a figure's text is the figures' class, never an ink unit's
  const fig = withFigureText ? figureUnitsOf(pages, own) : { units: [], glyphs: pages.map(() => new Map()), turned: pages.map(() => new Map()), stats: { letters: 0 } }
  // (the figures' paths as their lines are read by then: let go before the wrap reads the pages again)
  for (const pg of pages) { pg.shapes = null; pg.figures = null }
  /** each page's owners with the figure units' groups: every one's (`all`: the ledger's, crowded or not) or the drawn ones' */
  const withFigures = all => own.glyphs.map((row, i) => {
    const m = fig.glyphs[i]
    if (!m?.size) return row
    const out = Array.from(row)
    for (const [g, k] of m) if (all || !fig.units[k].why) out[g] = fig.units[k].group
    return out
  })
  // (every glyph's content class: the record's counts, the sweep's orphans; layout/ledger.mjs: a figure unit's glyphs are the
  // figures', crowded or not), then the ink units, the text no unit owns made units of our glyphs (layout/ink-units.mjs), their
  // glyphs claimed before the wrap is planned, so that each is hidden by its own groups as any unit is; the ledger's orphans those
  // no unit owns still. None where the source is not read (units null: no id to start from, no echo)
  // (a display a unit opens with, which the marking passes over, in no group: its unit's for the ledger, so that no ink unit nor
  // kept block is made of it, own.mjs `leads`)
  const withLeads = rows => rows.map((row, i) => {
    const m = own.leads?.[i]
    if (!m?.size) return row
    const out = Array.from(row)
    for (const [g, group] of m) out[g] ??= group
    return out
  })
  const classed = ledgerOf(pages, { ...own, glyphs: withLeads(withFigures(true)) }, { units })
  const ink = units ? inkUnitsOf(pages, classed, { units, from: inkBase }) : []
  claimInk(own, ink, pages)
  const ledger = ink.length ? inkLeft(classed, { ...own, glyphs: withLeads(withFigures(true)) }, pages) : classed
  // (and the text no unit owns still, kept blocks after the ink units: never translated, lit as any unit is; their glyphs in no
  // group, so that the wrap and the ledger are as they were, and none is off where a page is not wrapped: nothing of it is hidden;
  // layout/ink-units.mjs rule 10)
  const kept = units ? keptUnitsOf(pages, classed, (p, g) => own.glyphs[p - 1]?.[g] ?? (fig.glyphs[p - 1]?.has(g) ? 'f' : null) ?? own.leads?.[p - 1]?.get(g) ?? null, { from: inkBase + ink.length }) : []
  const owners = withFigures(false)
  const plans = new Map()
  pages.forEach((pg, i) => {
    if (!facts[i] || !pg.points.length) return
    const plan = { facts: facts[i], ...planOf(pg.glyphs, owners[i], pg.paths, own.boxes[i]) }
    // (a turned glyph's group by its place in its show, as a level one's)
    for (const [j, k] of fig.turned[i] ?? []) {
      const u = fig.units[k], t = pg.turned[j]
      if (u.why || !(t.n >= 0)) continue
      let row = plan.shows.get(t.n)
      if (!row) plan.shows.set(t.n, (row = []))
      row[t.k] = u.group
    }
    plans.set(i + 1, plan)
  })
  const made = await wrapOf(finalBytes, plans, { PL, deflate, inflate, ...bounds })
  if (made.refused) return made
  // a figure unit drawn is one whose group the document holds; else why its ink stays the original's
  for (const u of fig.units) {
    if (u.why) continue
    const x = made.pages.get(u.page)
    u.why = !x?.ok ? 'page' : x.figureWhy?.get(u.group) ?? (made.groups.has(u.group) ? null : 'shared')
  }
  const figures = figureRecordOf(fig, made)
  // a unit on a page not wrapped, or with a placeholder where the page's groups were merged, is the original's
  for (const u of own.units.values()) {
    if (u.unhidden) continue
    for (const p of u.pages) {
      const x = made.pages.get(p)
      if (!x?.ok) { u.unhidden = 'page'; break }
      // (a merged page folds a unit's placeholders and its label into its text: neither can then be kept in place)
      if (x.merged && [...u.groups].some(g => g.endsWith('.p') || g.endsWith('.l'))) { u.unhidden = 'bounds'; break }
    }
  }
  const counts = Object.fromEntries(UNHIDDEN.map(k => [k, 0]))
  const unhidden = [], labelKept = []
  // (listed: the units with a group in the document, the only ones a reader could hide; one with none is the original's by
  // construction, counted alone. So the lists hold at most GROUPS_DOC, and a long paper's cut at it costs no base)
  const written = id => [...own.units.get(id).groups].some(g => made.groups.has(g))
  for (const [id, u] of [...own.units].sort((a, b) => a[0] - b[0])) {
    if (u.unhidden) { counts[u.unhidden]++; if (written(id)) unhidden.push([id, u.unhidden]) }
    else if (u.labelKept && written(id)) labelKept.push(id)
  }
  if (unhidden.length > UNHIDDEN_MAX || labelKept.length > UNHIDDEN_MAX) return { refused: 'wrap-bound', why: `${unhidden.length} units the original's, past ${UNHIDDEN_MAX}` }
  const stats = { ...made.stats, unhidden: counts, labelKept: labelKept.length }
  const wrappedPages = rangesOf([...made.pages].filter(([, x]) => x.ok).map(([p]) => p))
  return { bytes: made.bytes, xref: made.xref, sha256: made.sha256, stats, unhidden, labelKept, pages: wrappedPages, own: { ...own.stats, unhidden: counts }, ledger: ledgerSummary(ledger), ink: { base: inkBase, units: [...ink, ...kept].map(({ id, kind, cls, echo, pieces, rows, kept: k }) => ({ id, kind, cls, echo, pieces, rows, ...(k ? { kept: true } : {}) })), off: inkOff(ink, made.pages) }, figures, ...(keepOwned ? { owned: own, ledgerWhole: ledger, figureUnits: fig.units } : {}) }
}

/** the figure units as the page pass takes them: those drawn (their group in the document, `why` null), each { page, group,
 *  text, font, size, fill, angle, x, y, ux, uy, length, ascent, descent, anchor, form, set, before, after }, in the order of
 *  their groups; and the counts (the record's): units cut, drawn, each why, their letters, the forms written again, the sets of
 *  two units or more and the units in them, the units their column aligned */
function figureRecordOf(fig, made) {
  const stats = { units: fig.units.length, drawn: 0, letters: fig.stats.letters, forms: made.forms ?? 0, sets: fig.stats.sets ?? 0, grouped: fig.stats.grouped ?? 0, aligned: fig.stats.aligned ?? 0, ...Object.fromEntries(FIGURE_WHYS.map(w => [w, 0])) }
  const units = []
  for (const u of fig.units) {
    if (u.why) { stats[u.why]++; continue }
    stats.drawn++
    units.push({ page: u.page, group: u.group, text: u.text, font: u.font, size: u.size, fill: u.fill, angle: u.angle, x: u.x, y: u.y, ux: u.ux, uy: u.uy, length: u.length, ascent: u.ascent, descent: u.descent, anchor: u.anchor, form: u.form, set: u.set, before: u.before, after: u.after })
  }
  return { units, stats }
}

export { alignOf }
