// A page's operator list as the server's readers ask it of PDF.js (the layout maker's read of arXiv's PDF, the add-on's plans):
// waited for OPS_MS at most, and given up past it, that page alone. A page given up on is dark for the reader that asked (no ink,
// no plan) and costs nothing more than itself: no count of pages given up darkens a later page (a paper's time is its host's
// deadline, the prepare run's 1,200 s).
//
// What a page given up on leaves behind, read on the pinned PDF.js in Node on the lite worker (layout/pdf-lite.mjs: PDF.js's worker
// on the main thread, as the server runs it), the probes of 2026-10-17:
//   - OPS_MS bounds the waits of a parse, not its work. PDF.js slices a parse in microtasks, so no timer fires while a parse runs
//     that waits for nothing (a standard font's data, a CMap): on a page of 2,002,009 operations (image paints) the 100 ms timer
//     fired at 1,493 ms, when the list had come; on a page of 15,000 unclosed saves, the 1 s timer at 1,498 ms, as it came.
//     Such a parse is bounded by the page's own content alone (PDF.js's, not a bound of the engine's: the run's deadline, or a
//     reader in a thread or a process of its own, is what can stop it); one that waits is given up at OPS_MS.
//   - giveUp is PDF.js's own cancellation (PDFPageProxy._abortOperatorList on its _intentStates): the stream is cancelled, the
//     page's intent state dropped and the page cleaned up, so the page proxy holds nothing of the list (its promise is left
//     pending). The worker's parse goes on to its end, its chunks dropped by the cancelled stream (2608.12606's page 5, 146,115
//     operations, given up at 100 ms: 259 ms of CPU after). A parse waits only for what it asks the main thread, which comes, so
//     each parse given up on ends, and nothing of it is held: pages of 1,600,000 operations each given up mid-parse at a font's
//     data, 2 MiB held after for one, 3 for four, 5 for twelve (the document's fonts), the peak 63, 158 and 174 MiB; the same
//     twelve left to finish without the cancel, 70 MiB held and 513 MiB at the peak.
// So nothing a page given up on leaves grows with the pages given up before it, and no paper-wide count of them is kept: the
// rest is time, the host's deadline's.
//
// A memory-class error (pipeline/memory.mjs, the bundle 4 contract's C8.4) is never a page given up on: within and listWithin
// let it through, so that the run ends on it as the service's memory failure, not as a dark page of a degraded layer.
//
// An original module (no port statement). Imports the engine's memory predicate alone: PDF.js is the caller's.
import { isMemoryError } from '../pipeline/memory.mjs'

/** a page's operator list is waited for at most OPS_MS: past it the page has no ink and no plan, and the page's parse is given
 *  up (giveUp). PDF.js parses a page's whole content stream before it answers: 0.9 to 2.8 s for 2608.18626's page 8 (102,052
 *  operations) on a laptop, 2 to 4 times that reckoned on one vCPU; the corpus's 2,793 pages take 36.9 s in all, a paper's at
 *  most a few seconds (the slowest page 761 ms on the lite worker, 2026-10-17); the two longest books' slowest, 359 ms
 *  (2310.20360, 737 pages) and 93 ms (2106.10165, 471). A page's
 *  alone: no bound of the paper's time makes a page's ink hang on the pages before it (the page stream's darkness is
 *  page-local) */
export const OPS_MS = 10_000

/** a promise's value, or null where it does not come within `ms` or fails; a memory-class failure is thrown */
export function within(promise, ms) {
  let timer
  const late = new Promise(resolve => { timer = setTimeout(() => resolve(null), Math.max(0, ms)) })
  return Promise.race([Promise.resolve(promise).then(v => v, e => { if (isMemoryError(e)) throw e; return null }), late]).finally(() => clearTimeout(timer))
}

/** a page's operator list given up on: PDF.js's own cancellation (its rendering's, PDFPageProxy._abortOperatorList on its
 *  _intentStates, read on the pinned PDF.js by layout-make.test.ts), which cancels the list's stream, drops its intent state
 *  and cleans the page up. Where a PDF.js has none, a warning, once a paper (`seen`; `seen.who` names the reader), and the
 *  reader goes on: the list's chunks are then the page's until its parse ends */
export function giveUp(page, seen) {
  if (typeof page?._abortOperatorList !== 'function' || !(page?._intentStates instanceof Map)) {
    if (!seen.warned) console.warn(`${seen.who ?? 'layout maker'}: this PDF.js cancels no operator list; a page given up on holds its list until its parse ends`)
    seen.warned = true
    return
  }
  try {
    for (const state of [...page._intentStates.values()]) page._abortOperatorList({ intentState: state, reason: new Error(`the ${seen.who ?? 'layout maker'} gave up`), force: true })
  } catch {}
}

/** page `page`'s operator list within OPS_MS, or null: given up on (giveUp) and let go (page.cleanup) where it does not come or
 *  fails */
export async function listWithin(page, seen, ms = OPS_MS) {
  let list = null
  try { list = await within(page.getOperatorList(), ms) } catch (e) { if (isMemoryError(e)) throw e }
  if (list) return list
  // (a list that failed has no stream left to cancel, and giveUp's cancellation of it cleans up nothing: PDF.js's
  // _abortOperatorList returns early; after a cancellation, cleaning up is a no-op)
  giveUp(page, seen)
  page.cleanup?.()
  return null
}
