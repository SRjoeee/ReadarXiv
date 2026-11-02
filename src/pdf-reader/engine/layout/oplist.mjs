// A page's operator list as the engine's readers ask it of PDF.js. The prepare's readers (the layout maker's read of the base page, the
// marked original's pages) wait for it however long it takes (listOf): what a page holds is bounded by counts once it has come
// (ink.mjs OPS_CAP, STEPS_MAX, GLYPHS_PAGE, BOXES_CAP: a page past one is dark, that page alone, on every machine alike), and no
// clock decides what is read, so that no output depends on the box's speed or its load. A list that fails is that page's darkness
// alone (null, the page let go); a parse that never ends is the run's deadline's (the maker's clock, the prepare's deadline), the
// parts told before it standing. The reader's live reads in the browser (layer-proto/run.mjs) wait for a list at most a while of
// their own (listWithin): a page drawn there with nothing of its own while it waits, which changes no prepared output.
//
// What a page given up on leaves behind (listWithin), read on the pinned PDF.js in Node on the lite worker (layout/pdf-lite.mjs:
// PDF.js's worker on the main thread, as the server runs it), the probes of 2026-10-17:
//   - a wait bounds the waits of a parse, not its work. PDF.js slices a parse in microtasks, so no timer fires while a parse runs
//     that waits for nothing (a standard font's data, a CMap): on a page of 2,002,009 operations (image paints) the 100 ms timer
//     fired at 1,493 ms, when the list had come; on a page of 15,000 unclosed saves, the 1 s timer at 1,498 ms, as it came.
//   - giveUp is PDF.js's own cancellation (PDFPageProxy._abortOperatorList on its _intentStates): the stream is cancelled, the
//     page's intent state dropped and the page cleaned up, so the page proxy holds nothing of the list (its promise is left
//     pending). The worker's parse goes on to its end, its chunks dropped by the cancelled stream (2608.12606's page 5, 146,115
//     operations, given up at 100 ms: 259 ms of CPU after).
//
// A memory-class error (pipeline/memory.mjs, the bundle 4 contract's C8.4) is never a page given up on: listOf, orNull, within and
// listWithin let it through, so that the run ends on it as the service's memory failure, not as a dark page of a degraded layer.
//
// An original module (no port statement). Imports the engine's memory predicate alone: PDF.js is the caller's.
import { isMemoryError } from '../pipeline/memory.mjs'

/** a promise's value, or null where it fails; a memory-class failure is thrown */
export const orNull = promise => Promise.resolve(promise).then(v => v, e => { if (isMemoryError(e)) throw e; return null })

/** page `page`'s operator list however long it takes, or null where it fails (the page then let go): the prepare's readers' */
export async function listOf(page) {
  const list = await orNull(page.getOperatorList())
  if (list) return list
  page.cleanup?.()
  return null
}

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

/** page `page`'s operator list within `ms`, or null: given up on (giveUp) and let go (page.cleanup) where it does not come or
 *  fails (the reader's live reads, layer-proto/run.mjs; the prepare's readers wait: listOf) */
export async function listWithin(page, seen, ms) {
  let list = null
  try { list = await within(page.getOperatorList(), ms) } catch (e) { if (isMemoryError(e)) throw e }
  if (list) return list
  // (a list that failed has no stream left to cancel, and giveUp's cancellation of it cleans up nothing: PDF.js's
  // _abortOperatorList returns early; after a cancellation, cleaning up is a no-op)
  giveUp(page, seen)
  page.cleanup?.()
  return null
}
