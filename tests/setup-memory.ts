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

/** The parts of happy-dom's internals this reads: the id table of a document, and the window an element belongs to */
type IdTable = Map<string, { elements: unknown[]; htmlCollection: unknown }>
type Internal = Record<symbol, unknown>

const proto = Element.prototype as unknown as Record<symbol, (this: Internal, id: string) => void>
const addIdentifier = proto[PropertySymbol.addIdentifierToWindow]!

proto[PropertySymbol.addIdentifierToWindow] = function (this: Internal, id: string): void {
  addIdentifier.call(this, id)
  const owner = this[PropertySymbol.ownerDocument] as Internal
  const window = this[PropertySymbol.window] as Record<string, unknown>
  if (!id || owner === window.document) return
  // What the call just wrote: the element, or the collection of those sharing the id
  const entry = (owner[PropertySymbol.elementIdMap] as IdTable).get(id)
  if (entry && (window[id] === entry.htmlCollection || entry.elements.includes(window[id]))) delete window[id]
}

afterEach(() => new Promise<void>(resolve => setImmediate(resolve)))
