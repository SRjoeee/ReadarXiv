// The parts of happy-dom's internals that tests/setup-memory.ts reaches into (issue #234): a private hook on every
// element and the layout of a document's id table. Neither is public API, so a happy-dom upgrade may move them — and a
// patch that quietly finds nothing would put the memory back at 4 GB a worker without a word. Everything is looked for
// here, and what is not found is an Error that names the installed version and the part that is missing (Devin on #329)
import { createRequire } from 'node:module'

type Internal = Record<symbol, unknown>

/** The version of happy-dom that is installed, for the message; its package has no `exports`, so its manifest can be read */
export function happyDomVersion(): string {
  try {
    return (createRequire(import.meta.url)('happy-dom/package.json') as { version?: string }).version ?? 'unknown version'
  } catch {
    return 'unknown version'
  }
}

const missing = (what: string): Error =>
  new Error(`happy-dom ${happyDomVersion()}: tests/setup-memory.ts patches ${what}, and this version does not have it. The patch is what keeps a parsed paper from staying in memory (tests/setup/memory.test.ts): update it to the new layout, or drop it if happy-dom no longer names a document's elements on its window`)

/** The symbols the patch uses, and the hook it wraps */
export interface Hooks {
  addIdentifier: symbol
  ownerDocument: symbol
  window: symbol
  elementIdMap: symbol
  /** the hook as happy-dom has it, to be called before the patch's own work */
  original: (this: Internal, id: string) => void
}

/** Finds the hook and the symbols in happy-dom's `PropertySymbol` and on `Element.prototype`, or throws saying which is not there */
export function hooksOf(symbols: Record<string, unknown>, prototype: object): Hooks {
  const symbol = (name: string): symbol => {
    const found = symbols[name]
    if (typeof found !== 'symbol') throw missing(`PropertySymbol.${name}`)
    return found
  }
  const addIdentifier = symbol('addIdentifierToWindow')
  const original = (prototype as Record<symbol, unknown>)[addIdentifier]
  if (typeof original !== 'function') throw missing('Element.prototype[PropertySymbol.addIdentifierToWindow]')
  return { addIdentifier, ownerDocument: symbol('ownerDocument'), window: symbol('window'), elementIdMap: symbol('elementIdMap'), original: original as Hooks['original'] }
}

/** What a document's id table holds for one id: the elements, and the collection of them that the window names */
export interface IdEntry { elements: unknown[]; htmlCollection: unknown }

/** The entry the document's id table has for `id` (undefined where it has none), or an Error where the table is not a map of that shape */
export function idEntryOf(owner: Internal, elementIdMap: symbol, id: string): IdEntry | undefined {
  const table = owner[elementIdMap]
  if (!(table instanceof Map)) throw missing('the document\'s id table (PropertySymbol.elementIdMap, a Map by id)')
  const entry: unknown = table.get(id)
  if (entry === undefined) return undefined
  if (typeof entry !== 'object' || entry === null || !Array.isArray((entry as IdEntry).elements) || !('htmlCollection' in entry)) throw missing('an entry of the id table with `elements` and `htmlCollection`')
  return entry as IdEntry
}
