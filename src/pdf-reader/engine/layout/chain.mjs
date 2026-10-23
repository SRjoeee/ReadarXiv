// The chained add-on (E3; the bundle 4 contract's C1.4 tail chain and C3c's hooks): a part's add-on made as the cut tries its
// ranges, its tail an incremental update after the tails of the parts before it, so that arXiv's PDF followed by the tails of
// parts 1 to k is a document whose removed pages are those of parts 1 to k, at every k. The cutter (layer-proto/cut.mjs) asks
// `chainAddon(index, { pages })` for each candidate range of a part (several times for one index while it fits the part's
// size) and `acceptAddon(index, { pages })` once its range is final: only that advances the chain. The plans are the prepare
// side's (layout/addon.mjs pagePlanOf: PDF.js's ink and the layout file), the removal the remover child's (layout/remove.mjs
// removerOf, over the service's transport `remove`): the prepare side holds no PDF object layer. The remover keeps no state:
// each ask carries the chain, and what comes back is checked against it as the part's reader checks the tail
// (layer-proto/format.mjs readPart: its /Prev the last section's, its startxref where its section is, its fresh numbers after
// the last tail's, the same root), so that a candidate asked and dropped leaves nothing behind.
//
// A part's manifest entries are the whole paper's add-on's (layout/addon.mjs paperAddon) for those pages: the boxes' share
// (BOXES_BYTES, BOXES_VALUES) is the paper's, spent in page order over the parts accepted and the candidate's own pages, so
// that many parts hold no more kept-ink boxes than one add-on of the whole paper could (equal to paperAddon wherever the
// share does not bind, and where it binds the same pages refused); a page with no kept ink takes no ask; a removed page is
// at N + the removed pages before it + 1. A remover gone for the run (its answer memory, clock, crashed or deadline, a
// transport that throws or answers nothing) is its death: from then on every dirty page is `tail not carried: <why>` (its
// units drawn by erase and restore), counted in the manifest's `uncarried`, and the parts before keep their tails. A refusal
// of one ask (`refused`, or an answer the checks refuse) costs that candidate alone: its dirty pages `tail not carried:
// refused`, the chain as it was, and the next candidate (a shorter range the cut tries) is asked again. The cut's size search
// asks a part's largest candidate first (its target range), so a death there (a clock or memory spent on the most pages) is
// final for the paper: the host sizes the per-ask clock for that ask. Imports the add-on's assembly, the exchange's payloads,
// the tail's reading, the manifest's check and the cutter's vocabulary: no object layer.
import { BundleRefusal } from '../layer-proto/bundle.mjs'
import { TAIL_NOT_CARRIED } from '../layer-proto/cut.mjs'
import { isMemoryError } from '../pipeline/memory.mjs'
import { rangeEntries, withRemoved } from './addon.mjs'
import { checkAddonManifest, REMOVAL } from './addon-manifest.mjs'
import { encodeAsk, readEntries, REMOVER_STATS } from './chain-wire.mjs'
import { TAIL_CAP, tailLinks } from './tail.mjs'

/** the remover's failures that end it for the run (chain-wire.mjs REMOVER_WHYS less `refused`); a refusal or a bad answer is
 *  the ask's alone, and a word none of the service's is `crashed` */
const GONE = Object.freeze(['memory', 'clock', 'crashed', 'deadline'])
/** the reason of a page whose plan alone passes what an ask holds */
export const PAST_ASK = 'its removal is more than the remover is asked at once'
/** the cutter's size refusal: a shorter part may fit */
const tooBig = (a, b, why) => new BundleRefusal(`pages ${a} to ${b}: ${why}`, { kind: 'part', path: 'addon.tail', data: { bound: 'tail' } })

/**
 * The hooks of a chained add-on. `N` the paper's pages; `views` each page's view as the cutter writes them (`whole.left.pages`,
 * [x0, y0, x1, y1] a page), against which a part's manifest is checked as its reader will (a range whose manifest it would
 * refuse gets no add-on: null); `base` { bytes, xref }: the PDF the tails continue, its length and startxref (the head's base
 * whole, or, a delta over arXiv's PDF, the composed document arXiv's bytes and the delta's: O + D, the delta's startxref; the
 * delta is the tails' base and no tail, so TAIL_CAP binds it not, and its section's least and fresh numbers are no tail's root
 * and first: the first tail's are checked against none, its /Prev the delta's section, its numbers above the delta's /Size); `planOf(p)` the
 * page's plan (layout/addon.mjs pagePlanOf's, or null), a cheap lookup; `pdfjs` the version of the PDF.js the plans' facts
 * were read by (the remover refuses another than its pinned one); `remove({ from, to, plans })` the transport to the remover
 * child, `plans` the ask's bytes, resolving to its answer { ok: true, tail, entries } or { ok: false, why }.
 *
 * Returns { chainAddon, acceptAddon, state }: `chainAddon(index, { pages: [a, b] })` the add-on { manifest, tail } of the
 * range (tail null where no page is removed), or null; no effect on the chain until `acceptAddon(index, { pages })` commits
 * the range's last call's state; `state()` the chain committed (and the remover's death, null while it lives). Throws BundleRefusal (kind
 * `part`, data.bound `tail`) where the range's tail or entries pass what a part holds and it has more than one page with kept
 * ink, for the cutter to cut the part shorter; a memory-class error goes on as itself; nothing else is thrown
 */
export function chainedAddon({ N, views, base, planOf, remove, pdfjs }) {
  if (!Number.isInteger(N) || N < 1 || !Array.isArray(views) || views.length !== N) throw new TypeError('N, views: the paper\'s pages and a view of each')
  if (!Number.isInteger(base?.bytes) || !Number.isInteger(base?.xref)) throw new TypeError('base: arXiv\'s PDF\'s bytes and startxref')
  if (typeof planOf !== 'function' || typeof remove !== 'function' || typeof pdfjs !== 'string') throw new TypeError('planOf, remove, pdfjs')
  let committed = Object.freeze({ end: base.bytes, xref: base.xref, next: null, root: null, kids: Object.freeze([]), empty: null, r: 0, boxes: Object.freeze({ bytes: 0, values: 0 }) })
  let pending = new Map()
  /** the remover's failure, once it fails: a fact of the remover, kept across candidates, unlike the chain */
  let dead = null

  /** the part's manifest checked as its reader will (format.mjs partShape: views from `a` to a thousandth, as the part writes
   *  them, its removed pages after the told) */
  const holds = (manifest, a, b) => {
    const flat = []
    for (let p = a; p <= b; p++) for (const x of views[p - 1]) flat.push(Math.round(x * 1000) / 1000)
    try {
      checkAddonManifest(manifest, { pages: N, views: flat, shipped: true, part: { from: a, to: b, atFrom: N + committed.r + 1 } })
      return true
    } catch (e) {
      if (isMemoryError(e)) throw e
      return false
    }
  }

  /**
   * The remover's answer read and checked against the chain and the pages asked: { over } | { tail, links, read } | { why }
   * (`gone` where the remover is gone for the run: a failure of GONE's, a word none of the service's, or no answer at all; an
   * answer the checks refuse is this ask's `refused`)
   */
  function answerOf(answer, asked) {
    const bad = { why: 'refused' }
    if (!answer || typeof answer !== 'object') return { why: 'crashed', gone: true }
    if (answer.ok !== true) return answer.why === 'refused' ? bad : { why: GONE.includes(answer.why) ? answer.why : 'crashed', gone: true }
    const { tail, entries } = answer
    if (tail !== null && (!(tail instanceof Uint8Array) || tail.length < 1 || tail.length > TAIL_CAP)) return bad
    let read
    try { read = readEntries(entries) } catch (e) {
      if (isMemoryError(e)) throw e
      return bad
    }
    if (read.over) return asked.length > 1 && tail === null ? { over: true } : bad
    // the entries: exactly the pages asked; a removed page's units the plan's, its removed page the next of the document's
    const keys = Object.keys(read.page)
    if (keys.length !== asked.length || asked.some(p => !Object.hasOwn(read.page, p))) return bad
    let removed = 0
    for (const p of asked) {
      const e = read.page[p]
      if (!e.ok) continue
      if (e.at.R !== N + committed.r + removed + 1) return bad
      removed++
      const ids = planOf(p).remove.units.map(u => String(u[0]))
      const got = Object.keys(e.units)
      if (got.length !== new Set(ids).size || ids.some(id => !Object.hasOwn(e.units, id))) return bad
    }
    if (read.kids.length !== removed || (removed === 0) !== (tail === null)) return bad
    if (tail === null) return read.empty === committed.empty ? { tail: null, read } : bad
    // the tail: its section continues the chain, as the part's reader checks it (readPart, chain check 5)
    const links = tailLinks(tail)
    if (links === null || links.startxref !== committed.end + links.xrefAt || links.prev !== committed.xref) return bad
    if ((committed.root !== null && links.root !== committed.root) || (committed.next !== null && links.first !== committed.next)) return bad
    // (its removed pages and the empty stream among its fresh numbers: the empty one written once, first, in the first tail)
    const fresh = n => Number.isInteger(n) && n >= links.first && n <= links.last
    if (read.kids.some((n, i) => !fresh(n) || (i > 0 && n <= read.kids[i - 1]))) return bad
    if (committed.empty === null ? read.empty !== links.first : read.empty !== committed.empty) return bad
    if (read.kids.includes(read.empty)) return bad
    return { tail, links, read }
  }

  async function chainAddon(_index, { pages }) {
    const [a, b] = pages
    const key = `${a}-${b}`
    // (acceptAddon commits the range's last call: a call that throws or answers null leaves no state of an earlier one)
    pending.delete(key)
    const { page, asked, spent } = rangeEntries(planOf, a, b, committed.boxes)
    const stats = {}
    for (const k of REMOVER_STATS) stats[k] = 0
    const unchanged = { ...committed, boxes: spent }
    const done = (tail, state) => {
      const manifest = { schema: 1, removal: REMOVAL, pages: N, sets: {}, page, appended: tail === null ? 0 : tail.length, stats }
      if (!holds(manifest, a, b)) return null
      pending.set(key, Object.freeze(state))
      return { manifest, tail }
    }
    // (a page with kept ink and no remover to remove it: its units drawn the old way, the count recorded)
    const uncarried = why => {
      withRemoved(page, asked, planOf, Object.fromEntries(asked.map(p => [p, { ok: false, refused: `${TAIL_NOT_CARRIED}: ${why}` }])))
      stats.uncarried = asked.length
      return done(null, unchanged)
    }
    if (asked.length === 0) return done(null, unchanged)
    if (dead !== null) return uncarried(dead)
    let ask = null
    try {
      ask = encodeAsk({
        from: a, to: b, pages: N, pdfjs, chain: { end: committed.end, xref: committed.xref, next: committed.next, kids: committed.kids, empty: committed.empty },
        plans: asked.map(p => ({ p, ...planOf(p).remove })),
      })
    } catch (e) {
      // (a text past what a string holds is an ask past its cap, as any other; any other error is a defect of the plans)
      if (!(e instanceof RangeError && /Invalid string length/.test(e.message))) throw e
    }
    if (ask === null) {
      if (asked.length > 1) throw tooBig(a, b, 'the removal of its pages is more than the remover is asked at once')
      withRemoved(page, asked, planOf, { [asked[0]]: { ok: false, refused: PAST_ASK } })
      return done(null, unchanged)
    }
    let answer
    try { answer = await remove({ from: a, to: b, plans: ask }) } catch (e) {
      if (isMemoryError(e)) throw e
      answer = { ok: false, why: 'crashed' }
    }
    const got = answerOf(answer, asked)
    if (got.over) throw tooBig(a, b, 'its removed pages pass what a part holds')
    if (got.why !== undefined) {
      // (gone: dead for the run, whatever the cut tries next; refused: this candidate's pages alone, the chain as it was)
      if (got.gone) dead = got.why
      return uncarried(got.why)
    }
    withRemoved(page, asked, planOf, got.read.page)
    Object.assign(stats, got.read.stats)
    if (got.tail === null) return done(null, unchanged)
    return done(got.tail, {
      end: committed.end + got.tail.length, xref: got.links.startxref, next: got.links.last + 1, root: got.links.root,
      kids: Object.freeze([...committed.kids, ...got.read.kids]), empty: got.read.empty, r: committed.r + got.read.kids.length, boxes: spent,
    })
  }

  function acceptAddon(_index, { pages }) {
    const state = pending.get(`${pages[0]}-${pages[1]}`)
    if (state !== undefined) committed = state
    pending = new Map()
  }

  const state = () => ({ ...committed, kids: [...committed.kids], boxes: { ...committed.boxes }, dead })
  return { chainAddon, acceptAddon, state }
}
