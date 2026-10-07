import { describe, expect, it } from 'vitest'
import { readerRuns } from '@/pdf-reader/support'

const fn = () => {}
/** a realm with every built-in the reader's PDF.js calls; `without` names the ones taken away */
function realm(without: string[] = []) {
  const has = (name: string) => (without.includes(name) ? undefined : fn)
  return {
    Map: { prototype: { getOrInsertComputed: has('getOrInsertComputed') } },
    Math: { sumPrecise: has('sumPrecise') },
    Uint8Array: { fromBase64: has('fromBase64'), prototype: { toBase64: has('toBase64'), toHex: has('toHex') } },
    RegExp: { escape: has('escape') },
    Float16Array: has('Float16Array'),
  } as unknown as typeof globalThis
}

describe("readerRuns: whether this browser runs the reader's PDF.js (final review)", () => {
  it('runs where every built-in PDF.js calls is there', () => {
    expect(readerRuns(realm())).toBe(true)
  })

  it.each(['getOrInsertComputed', 'sumPrecise', 'fromBase64', 'toBase64', 'toHex', 'escape', 'Float16Array'])('does not where %s is missing', name => {
    expect(readerRuns(realm([name]))).toBe(false)
  })

  it("does not on Chrome 131, the extension's floor, which has none of them (measured)", () => {
    expect(readerRuns(realm(['getOrInsertComputed', 'sumPrecise', 'fromBase64', 'toBase64', 'toHex', 'escape', 'Float16Array']))).toBe(false)
  })
})
