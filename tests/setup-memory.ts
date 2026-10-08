// Vitest setup (issue #234): what kept every parsed paper alive for the length of a test file.
//
// 1. A document made by `DOMParser` does not hold the window.
//
// happy-dom writes every element that has an `id` onto its window as a named property (`window.S3`), the way a browser
// does for the page — and does it for the documents `DOMParser` makes too, which in a browser have no window and so no
// named access. The window then holds the first element of each id for good, an element holds its document, and every
// paper a fixture test parsed stayed in memory until its worker exited: thirteen papers 2 GB, one worker 4.2 GB, and
// `pnpm test` out of memory on a machine under 16 GB. The fix is the browser's rule: the window names only its own
// document's ids. A document's own id table, which `getElementById` reads, is left alone
//
// 2. The event loop turns after every test. V8 keeps what a WeakRef was made for — happy-dom makes them for its element
// caches — strongly reachable until the loop next turns, and vitest runs the tests of a file one after another on
// promises alone: all of a file's documents stayed, however full the heap
//
// tests/setup/memory.test.ts holds both
import { PropertySymbol } from 'happy-dom'
import { afterEach } from 'vitest'
import { hooksOf, idEntryOf } from './happy-dom-hooks'

type Internal = Record<symbol, unknown>

// Only where there is a happy-dom to patch: a test file that asks for the node environment (`// @vitest-environment node`,
// tests/e2e/lib/layer-api.test.ts) has no `Element`, and parses no paper
if (typeof Element !== 'undefined') {
  // happy-dom's private parts, looked for before anything is patched: what is not there is an Error naming the version
  // and the part (tests/happy-dom-hooks.ts), not a patch that quietly does nothing
  const hooks = hooksOf(PropertySymbol as unknown as Record<string, unknown>, Element.prototype)

  ;(Element.prototype as unknown as Record<symbol, unknown>)[hooks.addIdentifier] = function (this: Internal, id: string): void {
    hooks.original.call(this, id)
    const owner = this[hooks.ownerDocument] as Internal
    const window = this[hooks.window] as Record<string, unknown>
    if (!id || owner === window.document) return
    // What the call just wrote: the element, or the collection of those sharing the id
    const entry = idEntryOf(owner, hooks.elementIdMap, id)
    if (entry && (window[id] === entry.htmlCollection || entry.elements.includes(window[id]))) delete window[id]
  }

  // Once, now: a layout the hook cannot read fails here, in every file's setup, and not at the first element with an id
  // some test happens to make. Parsed after the patch, so that it leaves nothing on the window either
  new DOMParser().parseFromString('<!doctype html><html><body><p id="axt-hook-probe"></p></body></html>', 'text/html')
}

afterEach(() => new Promise<void>(resolve => setImmediate(resolve)))
