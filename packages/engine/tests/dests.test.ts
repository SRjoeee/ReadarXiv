// Every destination of A's links resolved at the prepare (locate/dests.ts): each key as Link.to.dest writes it, resolved through
// A's own document (a stand-in of PDF.js's) to its page and the point it names; and the compile side untouched (read.ts, whose
// bytes the instrument's key reads through the compile side's bundle, stays the line's).
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { destinationsOf, destKeysOf } from '../src/locate/dests.ts'
import type { PdfJs } from '../src/read.ts'

/** a stand-in of PDF.js whose one document answers `named` by name and each page reference by its `num` (page index num - 10) */
function pdfjsOf(named: Record<string, unknown[] | null>, o: { failing?: number } = {}) {
  const seen = { opened: 0, destroyed: 0, asked: [] as string[] }
  const doc = {
    numPages: 9,
    getPage: () => Promise.reject(new Error('no page is read')),
    getDestination: async (id: string) => {
      seen.asked.push(id)
      return named[id] ?? null
    },
    getPageIndex: async (ref: { num: number }) => {
      if (ref.num === o.failing) throw new Error('no such page')
      return ref.num - 10
    },
    destroy: async () => {
      seen.destroyed++
    },
  }
  const pdfjs: PdfJs = {
    getDocument: () => {
      seen.opened++
      return { promise: Promise.resolve(doc), destroy: () => doc.destroy() }
    },
    OPS: {},
  }
  return { pdfjs, seen }
}
const ref = (num: number) => ({ num, gen: 0 })
const key = (d: unknown) => JSON.stringify(d)
const A = new Uint8Array([1, 2, 3])

describe('every destination of A resolved on A (dests.ts)', () => {
  it('a named destination resolves to its page and XYZ point', async () => {
    const { pdfjs } = pdfjsOf({ 'cite.a': [ref(13), { name: 'XYZ' }, 72, 540, null] })
    const m = await destinationsOf(pdfjs, A, new Set([key('cite.a')]))
    expect(m.get(key('cite.a'))).toEqual({ page: 4, x: 72, y: 540 })
  })
  it('FitH gives its top alone; Fit gives no point; FitR gives its left and top; XYZ with a null side gives none there', async () => {
    const { pdfjs } = pdfjsOf({
      h: [ref(10), { name: 'FitH' }, 700],
      f: [ref(11), { name: 'Fit' }],
      r: [ref(12), { name: 'FitR' }, 50, 100, 300, 400],
      z: [ref(12), { name: 'XYZ' }, null, 650, 0],
    })
    const m = await destinationsOf(pdfjs, A, new Set(['h', 'f', 'r', 'z'].map(key)))
    expect(m.get(key('h'))).toEqual({ page: 1, x: null, y: 700 })
    expect(m.get(key('f'))).toEqual({ page: 2, x: null, y: null })
    expect(m.get(key('r'))).toEqual({ page: 3, x: 50, y: 400 })
    expect(m.get(key('z'))).toEqual({ page: 3, x: null, y: 650 })
  })
  it('an explicit array resolves without getDestination', async () => {
    const { pdfjs, seen } = pdfjsOf({})
    const k = key([ref(12), { name: 'XYZ' }, 0, 700, 0])
    const m = await destinationsOf(pdfjs, A, new Set([k]))
    expect(m.get(k)).toEqual({ page: 3, x: 0, y: 700 })
    expect(seen.asked).toEqual([])
  })
  it('a name the document lacks is null; a getPageIndex that rejects is null, the others kept', async () => {
    const { pdfjs } = pdfjsOf(
      { a: [ref(13), { name: 'XYZ' }, 1, 2, 0], b: [ref(99), { name: 'XYZ' }, 1, 2, 0] },
      { failing: 99 },
    )
    const m = await destinationsOf(pdfjs, A, new Set(['a', 'b', 'gone'].map(key)))
    expect(m.get(key('a'))).toEqual({ page: 4, x: 1, y: 2 })
    expect(m.get(key('b'))).toBeNull()
    expect(m.get(key('gone'))).toBeNull()
  })
  it('a key that is no destination (not JSON, a number, an unknown fit) is null', async () => {
    const { pdfjs } = pdfjsOf({ u: [ref(13), { name: 'Odd' }, 1, 2] })
    const m = await destinationsOf(pdfjs, A, new Set(['{', '12', key('u')]))
    expect([...m.values()]).toEqual([null, null, null])
  })
  it('the document is opened once and let go, and not at all where there is no key', async () => {
    const { pdfjs, seen } = pdfjsOf({ a: [ref(13), { name: 'Fit' }] })
    await destinationsOf(pdfjs, A, new Set([key('a'), key('b')]))
    expect(seen).toMatchObject({ opened: 1, destroyed: 1 })
    const none = pdfjsOf({})
    expect((await destinationsOf(none.pdfjs, A, new Set())).size).toBe(0)
    expect(none.seen.opened).toBe(0)
  })
  it('the keys are the distinct destinations of every page’s link annotations, as Link.to writes them', () => {
    const link = (dest: unknown) => ({ annotationType: 2, rect: [0, 0, 1, 1], dest })
    const keys = destKeysOf([
      [link('cite.a'), link('cite.a'), { annotationType: 2, rect: [0, 0, 1, 1], url: 'https://x.org' }],
      null,
      [link([ref(12), { name: 'Fit' }]), { annotationType: 1, rect: [0, 0, 1, 1], dest: 'note' }],
    ])
    expect([...keys].sort()).toEqual([key('cite.a'), key([ref(12), { name: 'Fit' }])].sort())
  })
})

describe('the compile side untouched', () => {
  it('read.ts is byte-identical to the line’s head (the instrument’s key reads the compile side’s bundle)', () => {
    const bytes = readFileSync(join(import.meta.dirname, '../src/read.ts'))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(READ_TS_SHA256)
  })
})
const READ_TS_SHA256 = 'c8430df86c12587f3ab17650ce1ea54fcec3e4103d1d5a137a7baff16688dd6d'
