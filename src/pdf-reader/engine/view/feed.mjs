// The layer's feed (the shared reader view's contract §1.3, §2.2; docs/PDF-READER.md §11.8): what a host hears of a paper's
// layer, from any source, any number of times, in any order — a job's updates, a look's 202s, the catalog — merged into one
// layer: its units chunks and head read into the index, its parts read in page order against the chain they make, how far the
// parts go. Every object is fetched through the host's transport (`fetchObject`) once a digest, and read by the format's own
// readers (layer-proto/format.mjs: cap, digest against its ref, values, shape, chain). No DOM; the layer side is its one caller.
//
// The parts' chain (the bundle 4 contract M5, the Worker's M26): a part extends the chain where it begins after the last told and
// names that one's digest as its `prev`; a part told without `prev` (the catalog's) by its pages alone. A part beginning at or
// before the last one told, under another digest, is a fork: the chain is reset from its page, the parts told before it there
// let go. A part that does not follow yet (a gap, a `prev` not told) waits until it does. A part refused (its fetch or its read)
// stops the chain at the part before it; told again, it is fetched and read again. The head first told is the layer's: another
// is passed over, with one warning.
import { indexOf, readHead, readPart, readUnitsChunk } from '../layer-proto/format.mjs'

const isAbort = e => e?.name === 'AbortError'
/** a ref as the readers take it: its own fields, a part's `prev` left out (the readers read a part's own) */
const refOf = r => ({ kind: r.kind, sha256: r.sha256, bytes: r.bytes, ...(r.from === undefined ? {} : { from: r.from }), ...(r.to === undefined ? {} : { to: r.to }), ...(r.page === undefined ? {} : { page: r.page }) })

/**
 * The feed of one paper's layer: `fetchObject(ref, signal)` the host's transport, `changed()` told after each change of what
 * `state()` gives (synchronously, from the feed's own tasks), `warn(what, error)` once each
 */
export function createFeed({ fetchObject, changed = () => {}, warn = () => {} }) {
  const ac = new AbortController()
  let disposed = false
  /** each object's bytes by digest, fetched once; a failed fetch is let go, so that a ref told again is fetched again */
  const bytes = new Map()
  const fetch = r => {
    let p = bytes.get(r.sha256)
    if (!p) {
      p = Promise.resolve().then(() => fetchObject(r, ac.signal))
      bytes.set(r.sha256, p)
      p.catch(() => { if (bytes.get(r.sha256) === p) bytes.delete(r.sha256) })
    }
    return p
  }
  // ---------------------------------------------------------------- the index
  let headRef = null, otherHead = false
  let index = null, refused = null
  let resolveIndex
  const indexed = new Promise(r => { resolveIndex = r })
  let reading = false
  function refuse(why, e) {
    if (refused || disposed) return
    refused = why
    warn(`the layer's ${why}`, e)
    resolveIndex(null)
    changed()
  }
  async function readIndex() {
    if (reading || index || refused || !headRef) return
    reading = true
    try {
      const head = await readHead(await fetch(headRef), { ref: refOf(headRef) }).catch(e => { throw Object.assign(e, { why: 'head' }) })
      if (disposed) return
      // the head names its chunks: fetched at once, read in id order (each after the one before)
      const got = head.units.map(r => fetch(r).catch(e => { throw Object.assign(e, { why: 'units' }) }))
      for (const g of got) g.catch(() => {})
      const chunks = []
      for (let i = 0; i < head.units.length; i++) {
        const b = await got[i]
        chunks.push(await readUnitsChunk(b, { ref: refOf(head.units[i]), before: chunks.at(-1) ?? null }).catch(e => { throw Object.assign(e, { why: 'units' }) }))
        if (disposed) return
      }
      index = indexOf(head, chunks)
      resolveIndex(index)
      changed()
      void readChain()
    } catch (e) {
      if (!disposed && !isAbort(e)) refuse(e?.why ?? 'index', e)
    } finally { reading = false }
  }

  // ---------------------------------------------------------------- the chain
  /** the chain as told, in page order; the parts told that do not follow yet; every part ref told; the digests refused */
  let told = [], gen = 0
  const waiting = new Map(), known = new Set(), refusedParts = new Set()
  /** the parts read, aligned with `told` as far as it is read */
  let read = []
  let end = null
  const lastTo = () => told.at(-1)?.to ?? 0
  /** whether part ref `r` may begin at its page after the told parts before it: the first part names none, a later one the
   *  part ending before it (by digest where it names one) */
  const joins = r => {
    if (r.from === 1) return r.prev === undefined || r.prev === null
    const before = told.find(t => t.to === r.from - 1)
    return !!before && (r.prev === undefined || r.prev === before.sha256)
  }
  function place(r) {
    if (r.from <= lastTo()) {
      // a fork: the chain from its page reset, where it joins what was told before
      if (told.some(t => t.sha256 === r.sha256) || !joins(r)) return false
      told = told.filter(t => t.to < r.from)
      told.push(r)
    } else if (r.from === lastTo() + 1 && joins(r)) told.push(r)
    else return false
    gen++
    return true
  }
  function settle() {
    for (let more = true; more;) {
      more = false
      for (const [sha, r] of waiting) if (r.from === lastTo() + 1 && joins(r)) { waiting.delete(sha); told.push(r); gen++; more = true; break }
    }
  }
  let chaining = false, rechain = false
  async function readChain() {
    if (!index || disposed) return
    if (chaining) { rechain = true; return }
    chaining = true
    try {
      do {
        rechain = false
        const at = gen
        for (let i = 0; i < told.length && !disposed && at === gen; i++) {
          const r = told[i]
          if (read[i]?.sha256 === r.sha256) continue
          // read past where the chain was told anew: what was read after it let go
          if (read.length > i) { read = read.slice(0, i); changed() }
          if (refusedParts.has(r.sha256)) break
          let part
          try {
            part = await readPart(await fetch(r), { ref: refOf(r), index, chain: read[i - 1]?.chain ?? null })
          } catch (e) {
            if (disposed || isAbort(e)) return
            if (at !== gen) break
            // the chain stops at the part before it; told again, it is fetched and read again
            refusedParts.add(r.sha256)
            bytes.delete(r.sha256)
            warn(`the layer's part from page ${r.from}`, e)
            changed()
            break
          }
          if (disposed) return
          if (at !== gen || told[i] !== r) break
          read = [...read.slice(0, i), part]
          changed()
        }
        if (at !== gen) rechain = true
      } while (rechain && !disposed)
    } finally { chaining = false }
  }

  return {
    /** what the host has heard: merged, deduplicated by digest; fetched at once (units, head, parts) */
    tell({ units, head, parts, end: told1 } = {}) {
      if (disposed || refused) return
      for (const r of units ?? []) void fetch(r).catch(() => {})
      if (head) {
        if (!headRef) { headRef = head; void readIndex() } else if (head.sha256 !== headRef.sha256 && !otherHead) { otherHead = true; warn('another head is passed over', new Error(head.sha256)) }
      }
      let moved = false
      for (const r of parts ?? []) {
        if (known.has(r.sha256) && !refusedParts.has(r.sha256)) continue
        known.add(r.sha256)
        // a part refused and told again: fetched and read again
        if (refusedParts.delete(r.sha256)) { moved = true; gen++ }
        void fetch(r).catch(() => {})
        if (told.some(t => t.sha256 === r.sha256)) continue
        if (place(r)) moved = true
        else waiting.set(r.sha256, r)
      }
      if (moved) settle()
      if (told1 && (!end || end.through !== told1.through || end.refused !== told1.refused)) { end = { through: told1.through, ...(told1.refused ? { refused: told1.refused } : {}) }; moved = true; changed() }
      if (moved) void readChain()
    },
    /** the index once read; null where it is refused, or the feed disposed */
    index: () => indexed,
    /** what is read so far: the index, the parts read in page order, how far the parts go once told, whether the parts read
     *  reach it, and why the layer is refused */
    state() {
      const through = read.at(-1)?.pages[1] ?? 0
      return { index, parts: read, end, ended: !!end && !!index && through >= end.through, refused }
    },
    /** the fetches let go, nothing more read */
    dispose() {
      if (disposed) return
      disposed = true
      ac.abort()
      resolveIndex(null)
    },
  }
}
