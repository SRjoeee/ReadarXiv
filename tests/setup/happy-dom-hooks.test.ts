import { createRequire } from 'node:module'
import { PropertySymbol } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import { happyDomVersion, hooksOf, idEntryOf } from '../happy-dom-hooks'

// Devin on #329. tests/setup-memory.ts patches a private hook of happy-dom and reads the layout of a document's id table;
// after an upgrade that moves either, the patch must fail naming the version and the part, and not quietly find nothing
// (the memory would be back at 4 GB a worker, and nothing would say why)

const version = (createRequire(import.meta.url)('happy-dom/package.json') as { version: string }).version
const symbols = PropertySymbol as unknown as Record<string, unknown>

describe('the happy-dom parts the memory setup reaches into', () => {
  it('are all there in the installed version', () => {
    const hooks = hooksOf(symbols, Element.prototype)
    expect(typeof hooks.original).toBe('function')
    expect([hooks.addIdentifier, hooks.ownerDocument, hooks.window, hooks.elementIdMap].map(s => typeof s)).toEqual(['symbol', 'symbol', 'symbol', 'symbol'])
  })

  it('name the installed version when a symbol is gone', () => {
    const { addIdentifierToWindow: _gone, ...rest } = symbols
    const failure = () => hooksOf(rest, Element.prototype)
    expect(failure).toThrowError(Error)
    expect(failure).toThrowError(`happy-dom ${version}`)
    expect(failure).toThrowError('PropertySymbol.addIdentifierToWindow')
    expect(happyDomVersion()).toBe(version)
  })

  it('name the hook when the symbol is there and the element no longer has it', () => {
    const failure = () => hooksOf(symbols, {})
    expect(failure).toThrowError(`happy-dom ${version}`)
    expect(failure).toThrowError('Element.prototype[PropertySymbol.addIdentifierToWindow]')
  })

  it('name each of the other symbols the patch uses', () => {
    for (const name of ['ownerDocument', 'window', 'elementIdMap']) {
      const { [name]: _gone, ...rest } = symbols
      expect(() => hooksOf(rest, Element.prototype), name).toThrowError(`PropertySymbol.${name}`)
    }
  })
})

describe('the id table of a document', () => {
  const key = Symbol('elementIdMap')
  const table = (entry: unknown) => ({ [key]: new Map([['a', entry]]) })

  it('gives the entry of an id, nothing for an id it has not, in the layout happy-dom has today', () => {
    const doc = new DOMParser().parseFromString('<!doctype html><html><body><p id="a">x</p><p id="a">y</p></body></html>', 'text/html')
    const entry = idEntryOf(doc as unknown as Record<symbol, unknown>, hooksOf(symbols, Element.prototype).elementIdMap, 'a')
    expect(entry?.elements).toHaveLength(2)
    expect(entry).toHaveProperty('htmlCollection')
    expect(idEntryOf(doc as unknown as Record<symbol, unknown>, hooksOf(symbols, Element.prototype).elementIdMap, 'b')).toBeUndefined()
  })

  it('names the version and the table when it is not a map', () => {
    const failure = () => idEntryOf({ [key]: {} }, key, 'a')
    expect(failure).toThrowError(`happy-dom ${version}`)
    expect(failure).toThrowError('PropertySymbol.elementIdMap')
    expect(() => idEntryOf({}, key, 'a')).toThrowError('PropertySymbol.elementIdMap')
  })

  it('names the version and the entry when an entry is not of the shape the patch reads', () => {
    for (const entry of [null, 'a', {}, { elements: [] }, { htmlCollection: {} }, { elements: 'a', htmlCollection: {} }]) {
      const failure = () => idEntryOf(table(entry), key, 'a')
      expect(failure, JSON.stringify(entry)).toThrowError(`happy-dom ${version}`)
      expect(failure, JSON.stringify(entry)).toThrowError('`elements` and `htmlCollection`')
    }
  })
})
