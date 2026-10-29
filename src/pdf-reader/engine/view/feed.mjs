// The layer's feed (the shared reader view's contract §1.3, §2.2; docs/PDF-READER.md §11.8): what a host hears of a paper's
// layer, from any source, any number of times, in any order — a job's updates, a look's 202s, the catalog — merged into one
// layer: its units chunks and head read into the index, its parts read in page order against the chain they make, how far the
// parts go. Every object is fetched through the host's transport (`fetchObject`) once a digest while it is wanted, and read by
// the format's own readers (layer-proto/format.mjs: cap, digest against its ref, values, shape, chain). An object's bytes are
// let go once it is read (the door holds what it reads): the units and the head once the index is, a part once it is read, and
// a part a fork lets go with it. No DOM; the layer side is its one caller.
//
// The parts' chain (the bundle 4 contract M5, the Worker's M26). A part extends the chain where it begins after the last told
// and names that one's digest as its `prev` (a part told without `prev`, the catalog's, by its pages alone). A part beginning
// at or before the last one told, under another digest, is a fork: the chain is reset from its page, where the part joins
// what is told before it there and is heard later than every part it lets go (a source that comes late, a 202 made before a
// job's fork, does not undo the fork) or those parts are refused. A tell carrying the parts' end (the catalog) names the chain
// whole: its parts are the chain, and no later part forks them (a part may extend it, a later build's). A part that does not
// follow yet (a gap, a `prev` not told) waits until it does, and is not fetched before. A part refused (its fetch or its read)
// stops the chain at the part before it; told again, it is fetched and read again. The head first told is the layer's: another
// is passed over, with one warning.
//
// The late chunks (PDF-READER §19.15): a units chunk told past the head's — the bitmap figures' labels, which the maker announces
// after its last part — is read after the head's, in id order, into the index (format.mjs indexOf's, or indexWithLate's once the
// index is read: a new index, which `state()` gives and the side opens its door again with). One that cannot be fetched or read is
// passed over with a warning: those figures stay the original's, and nothing else of the layer is refused.
import { indexOf, indexWithLate, LATE_MAX, readHead, readPart, readUnitsChunk } from '../layer-proto/format.mjs'

/** a ref as the readers take it: its own fields, a part's `prev` left out (the readers read a part's own) */
const refOf = r => ({ kind: r.kind, sha256: r.sha256, bytes: r.bytes, ...(r.from === undefined ? {} : { from: r.from }), ...(r.to === undefined ? {} : { to: r.to }), ...(r.page === undefined ? {} : { page: r.page }) })
/** an error tagged with the feed's code for what it refused */
const coded = (e, code) => { const out = e instanceof Error ? e : new Error(String(e)); out.axtCode ??= code; return out }

/**
 * The feed of one paper's layer: `fetchObject(ref, signal)` the host's transport, `changed()` told after each change of what
 * `state()` gives (synchronously, from the feed's own tasks), `warn(what, error)` once each
 */
export function createFeed({ fetchObject, changed = () => {}, warn = () => {} }) {
  const ac = new AbortController()
  let disposed = false
  /** an abort of the feed's own (its dispose), as against one of the host's transport, which is that object refused */
  const gone = () => disposed || ac.signal.aborted
  /** each wanted object's bytes by digest, fetched once while held, let go once read (or refused, or let go by a fork) */
  const bytes = new Map()
  const fetch = r => {
    let p = bytes.get(r.sha256)
    if (!p) {
      p = Promise.resolve().then(() => fetchObject(r, ac.signal))
      p.catch(() => {})
      bytes.set(r.sha256, p)
    }
    return p
  }
  // ---------------------------------------------------------------- the index
  let headRef = null, otherHead = false
  let index = null, refused = null
  let resolveIndex
  const indexed = new Promise(r => { resolveIndex = r })
  let reading = false
  /** the units refs told, whose bytes go with the index */
  const unitShas = new Set()
  /** every units ref told, by its first id: the head's are read by the head's list, those past it are the late chunks */
  const toldUnits = new Map()
  /** the late chunks' refs read into the index, or passed over, by digest */
  const lateDone = new Set()
  let readingLate = false
  function refuse(code, e) {
    if (refused || disposed) return
    refused = code
    warn(`the layer's ${code}`, e)
    resolveIndex(null)
    changed()
  }
  async function readIndex() {
    if (reading || index || refused || !headRef) return
    reading = true
    try {
      const head = await fetch(headRef).then(b => readHead(b, { ref: refOf(headRef) })).catch(e => { throw coded(e, 'head') })
      bytes.delete(headRef.sha256)
      if (gone()) return
      // the head names its chunks: fetched at once, read in id order (each after the one before)
      for (const r of head.units) unitShas.add(r.sha256)
      const got = head.units.map(r => fetch(r).catch(e => { throw coded(e, 'units') }))
      for (const g of got) g.catch(() => {})
      const chunks = []
      for (let i = 0; i < head.units.length; i++) {
        const b = await got[i]
        chunks.push(await readUnitsChunk(b, { ref: refOf(head.units[i]), before: chunks.at(-1) ?? null }).catch(e => { throw coded(e, 'units') }))
        // (each chunk's bytes let go once it is read, not at the index: a later chunk may be long in coming)
        bytes.delete(head.units[i].sha256)
        if (gone()) return
      }
      // (the late chunks told so far, in the index from the first: a catalog names them with the head's)
      const late = []
      for (const r of lateRefs(chunks.at(-1)?.to ?? -1)) {
        lateDone.add(r.sha256)
        try { late.push(await readUnitsChunk(await fetch(r), { ref: refOf(r), before: late.at(-1) ?? chunks.at(-1) ?? null })) } catch (e) {
          if (gone()) return
          warn('the layer\'s late units', e)
          break
        } finally { bytes.delete(r.sha256) }
      }
      // (late chunks the index refuses, a unit of another kind among them: passed over, the layer the head's)
      try { index = indexOf(head, [...chunks, ...late]) } catch (e) {
        if (!late.length) throw e
        warn('the layer\'s late units', e)
        index = indexOf(head, chunks)
      }
      for (const sha of unitShas) bytes.delete(sha)
      resolveIndex(index)
      changed()
      void readChain()
      void readLate()
    } catch (e) {
      bytes.delete(headRef.sha256)
      for (const sha of unitShas) bytes.delete(sha)
      if (!gone()) refuse(e?.axtCode ?? 'index', e)
    } finally { reading = false }
  }

  /** the late chunks' refs told and not yet read, from the id after `last` on, as long as they follow one another */
  function lateRefs(last) {
    const out = []
    for (let next = last + 1, r; (r = toldUnits.get(next)) && out.length < LATE_MAX; next = r.to + 1) {
      if (lateDone.has(r.sha256)) continue
      out.push(r)
    }
    return out
  }
  /** a late chunk told after the index: read alone, the index's dropped ids told it, and the index made anew with it */
  async function readLate() {
    if (!index || readingLate || disposed) return
    readingLate = true
    try {
      for (let [r] = lateRefs(index.units.length - 1); r && !disposed; [r] = lateRefs(index.units.length - 1)) {
        lateDone.add(r.sha256)
        try {
          const c = await readUnitsChunk(await fetch(r), { ref: refOf(r), dropped: [...index.dropped] })
          if (disposed) return
          index = indexWithLate(index, c)
          changed()
        } catch (e) {
          if (gone()) return
          // (a late chunk that cannot be read: its figures stay the original's, and the layer is the layer it was)
          warn('the layer\'s late units', e)
          return
        } finally { bytes.delete(r.sha256) }
      }
    } finally { readingLate = false }
  }

  // ---------------------------------------------------------------- the chain
  /** the chain as told, in page order; the parts told that do not follow yet; when each part was first heard; the digests
   *  refused; the parts the last end told names (a fork leaves them be); each part read, by digest (its reading a function
   *  of the part before it, which its `prev` names) */
  let told = [], gen = 0, seq = 0, named = null
  const waiting = new Map(), heard = new Map(), refusedParts = new Set(), readOf = new Map()
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
  /** the chain told anew from `at` on: the parts let go there, their bytes with them where they are not read */
  function cut(at) {
    for (const t of told.slice(at)) bytes.delete(t.sha256)
    told = told.slice(0, at)
  }
  /** a part told: placed where it extends or forks the chain, else false (it waits) */
  function place(r) {
    if (r.from <= lastTo()) {
      // a fork, where it joins, is later than the parts it lets go (or they are refused), and lets go none the end names
      const at = told.findIndex(t => t.to >= r.from)
      const dropped = told.slice(at)
      if (!joins(r)) return false
      const live = dropped.filter(t => !refusedParts.has(t.sha256))
      if (live.some(t => named?.has(t.sha256) || heard.get(t.sha256) > heard.get(r.sha256))) return false
      cut(at)
    } else if (r.from !== lastTo() + 1 || !joins(r)) return false
    told.push(r)
    void fetch(r)
    gen++
    return true
  }
  function settle() {
    for (let more = true; more;) {
      more = false
      for (const [sha, r] of waiting) if (r.from === lastTo() + 1 && joins(r)) { waiting.delete(sha); told.push(r); void fetch(r); gen++; more = true; break }
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
        // a chain told anew (a fork, a catalog's shorter one): what was read past their common part let go, at once
        let same = 0
        while (same < read.length && same < told.length && read[same].sha256 === told[same].sha256) same++
        if (read.length > same) { read = read.slice(0, same); changed() }
        for (let i = 0; i < told.length && !disposed && at === gen; i++) {
          const r = told[i]
          if (read[i]?.sha256 === r.sha256) continue
          // read past where the chain was told anew: what was read after it let go
          if (read.length > i) { read = read.slice(0, i); changed() }
          if (refusedParts.has(r.sha256)) break
          const before = read[i - 1] ?? null
          let part = readOf.get(r.sha256)
          if (!part || part.prev !== (before?.sha256 ?? null)) {
            try {
              part = await readPart(await fetch(r), { ref: refOf(r), index, chain: before?.chain ?? null })
            } catch (e) {
              if (gone()) return
              bytes.delete(r.sha256)
              if (at !== gen) break
              // the chain stops at the part before it; told again, it is fetched and read again
              refusedParts.add(r.sha256)
              warn(`the layer's part from page ${r.from}`, e)
              changed()
              break
            }
            bytes.delete(r.sha256)
            readOf.set(r.sha256, part)
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

  /** the parts of a tell that carries the end, as the chain whole: contiguous from page 1 to the end's `through`, in page
   *  order (the catalog's); null where they are not (a job's last parts told with the end are placed as any part is) */
  function chainOf(parts, through) {
    // (a catalog of no part ends at page 0: the paper refused before its first page)
    if (!parts.length) return through === 0 ? [] : null
    const sorted = [...parts].sort((a, b) => a.from - b.from)
    for (let i = 0; i < sorted.length; i++) if (sorted[i].from !== (i ? sorted[i - 1].to + 1 : 1) || !(sorted[i].to >= sorted[i].from)) return null
    return sorted.at(-1)?.to === through ? sorted : null
  }

  return {
    /** what the host has heard: merged, deduplicated by digest; the units and the head fetched at once, each part once it is in
     *  the chain */
    tell({ units, head, parts, end: told1 } = {}) {
      if (disposed || refused) return
      for (const r of units ?? []) {
        if (!Number.isInteger(r?.from) || toldUnits.has(r.from)) continue
        toldUnits.set(r.from, r)
        // (before the index, every chunk told is fetched at once; after it, only one past it, a late chunk, is)
        if (!index) { unitShas.add(r.sha256); void fetch(r) }
      }
      if (index && units?.length) void readLate()
      if (head) {
        if (!headRef) { headRef = head; void readIndex() } else if (head.sha256 !== headRef.sha256 && !otherHead) { otherHead = true; warn('another head is passed over', new Error(head.sha256)) }
      }
      let moved = false
      for (const r of parts ?? []) {
        if (!heard.has(r.sha256)) heard.set(r.sha256, ++seq)
        // a part refused and told again: fetched and read again
        if (refusedParts.delete(r.sha256)) { bytes.delete(r.sha256); moved = true; gen++ }
      }
      // a tell with the end names the chain whole (the catalog's)
      const whole = told1 && Array.isArray(parts) ? chainOf(parts, told1.through) : null
      if (whole) {
        const same = whole.length === told.length && whole.every((r, i) => r.sha256 === told[i].sha256)
        // (none named before: the first catalog, which drops the waiters whatever chain it names, an empty one too)
        const sameNamed = !!named && whole.length === named.size && whole.every(r => named.has(r.sha256))
        if (!same) {
          const keep = told.findIndex((t, i) => t.sha256 !== whole[i]?.sha256)
          cut(keep < 0 ? told.length : keep)
          for (const r of whole.slice(told.length)) { told.push(r); void fetch(r); waiting.delete(r.sha256) }
          gen++
          moved = true
        }
        // one rule: a catalog drops the parts waiting from before it, unless it is the catalog in force told again, which
        // keeps the parts heard since (a later build's, waiting for their predecessors)
        if (!same || !sameNamed) waiting.clear()
        named = new Set(whole.map(r => r.sha256))
      } else {
        for (const r of parts ?? []) {
          if (told.some(t => t.sha256 === r.sha256)) continue
          if (place(r)) { waiting.delete(r.sha256); moved = true } else waiting.set(r.sha256, r)
        }
      }
      if (moved) settle()
      if (told1 && (!end || end.through !== told1.through || end.refused !== told1.refused)) { end = { through: told1.through, ...(told1.refused ? { refused: told1.refused } : {}) }; moved = true; changed() }
      if (moved) void readChain()
    },
    /** the index once read; null where it is refused, or the feed disposed */
    index: () => indexed,
    /** what is read so far: the index, the parts read in page order, how far the parts go once told, whether the parts read
     *  reach it, why the layer is refused, and how many objects' bytes are held now */
    state() {
      const through = read.at(-1)?.pages[1] ?? 0
      return { index, parts: read, end, ended: !!end && !!index && through >= end.through, refused, held: bytes.size }
    },
    /** the fetches let go, nothing more read */
    dispose() {
      if (disposed) return
      disposed = true
      ac.abort()
      bytes.clear()
      resolveIndex(null)
    },
  }
}
