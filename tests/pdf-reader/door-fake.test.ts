import { describe, expect, it } from 'vitest'
import { BundleRefusal } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import type { LayerDocument } from '@/pdf-reader/engine/layer-proto/door.mjs'
import type { Row } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { BUILTIN_RULES } from '@/pdf-reader/engine/rules/layout.mjs'
import { type DoorSetup, runDoorConformance } from './helpers/door-conformance'
import { createFakeDoor, type FakeDoorOptions } from './helpers/fake-door'
import { made, N } from './helpers/format-paper'

// The fake door (helpers/fake-door.ts) against the readiness protocol (helpers/door-conformance.ts), then what only the fake
// has: its modes and controls

/** the harness the suite opens a door through: the fake over the small paper, a composed document for each count of tails */
async function openFake(s: DoorSetup, opts: FakeDoorOptions = {}) {
  const door = createFakeDoor(opts)
  const docs = new Map<number, LayerDocument>()
  const docFor = (r: number): LayerDocument => {
    let d = docs.get(r)
    if (!d) {
      d = { numPages: N + r, getPage: async (n: number) => { await s.hold?.(n); if (s.failPages?.includes(n)) throw new Error(`page ${n} cannot be read`); return { n } } }
      docs.set(r, d)
    }
    return d
  }
  const parts = s.paper.readParts.slice(0, s.parts)
  const layer = await door.openLayer({
    index: s.paper.index, doc: docFor(parts.at(-1)?.chain.r ?? 0), parts, target: 'zh', faceSources: (async () => null) as never, hyphUrl: () => '', leftPart: s.leftPart, onRetired: s.onRetired,
  })
  return { door, layer, advance: () => door.advance(), docFor, closure: (p: number): readonly number[] => opts.closure?.(p) ?? [p] }
}

describe('the fake door', () => {
  runDoorConformance(s => openFake(s))
})

describe('the fake door gating on rows', () => {
  // the units' rows come from the harness after each part, as a door that waits for them is given them
  runDoorConformance(async s => {
    const h = await openFake(s, { rows: 'gate' })
    const rows = s.paper.index.units.map((_, id) => [id, [], 'whole', null, null] as Row)
    return { ...h, supplyRows: () => { h.layer.take(rows) } }
  })
})

describe('the fake door with the closures of an in-order door', () => {
  // (the small paper: a unit runs from page 1 onto page 2, so pages 1 and 2 are laid together and each later page after the pages before it)
  const inOrder = (p: number) => (p <= 2 ? [1, 2] : Array.from({ length: p }, (_, i) => i + 1))
  runDoorConformance(s => openFake(s, { closure: inOrder }))
})

describe('the fake door in auto mode', () => {
  runDoorConformance(async s => {
    const h = await openFake(s, { laying: 'auto' })
    return { ...h, advance: async () => { await h.advance(); await new Promise(r => setTimeout(r, 5)) } }
  })
})

describe('the fake door: what only it has', () => {
  it('lays on its own in auto mode', async () => {
    const M = await made()
    const h = await openFake({ paper: M, parts: 3, leftPart: async () => new Uint8Array(), onRetired: () => {} }, { laying: 'auto' })
    const page = await h.layer.pageOf(1, { lang: 'zh' })
    expect(page.svg.getAttribute('lang')).toBe('zh')
    h.layer.dispose()
  })

  it('counts a read that rejects with a falsy value as a failure', async () => {
    const M = await made()
    for (const value of [undefined, null, 0, '']) {
      const door = createFakeDoor()
      const doc = { numPages: N, getPage: async () => { throw value } }
      const parts = M.readParts.slice(0, 3)
      const layer = await door.openLayer({ index: M.index, doc: { numPages: N + 2, getPage: doc.getPage }, parts, target: 'zh', faceSources: (async () => null) as never, hyphUrl: () => '', leftPart: async () => new Uint8Array(), onRetired: () => {} })
      const one = layer.pageOf(1, { lang: 'zh' }).then(() => 'laid', () => 'failed')
      await door.advance()
      expect(await one).toBe('failed')
      expect(layer.pageState(1)).toBe('failed')
      layer.dispose()
    }
  })

  it('fails a page the test says to fail', async () => {
    const M = await made()
    const h = await openFake({ paper: M, parts: 3, leftPart: async () => new Uint8Array(), onRetired: () => {} })
    h.door.fail(3)
    const three = h.layer.pageOf(3, { lang: 'zh' }).then(() => 'laid', () => 'failed')
    await h.advance()
    expect(await three).toBe('failed')
    expect(h.layer.pageState(3)).toBe('failed')
    h.layer.dispose()
  })

  it('lays the closure of an asked page and tells it too, in order', async () => {
    const M = await made()
    const h = await openFake({ paper: M, parts: 3, leftPart: async () => new Uint8Array(), onRetired: () => {} }, { closure: p => Array.from({ length: p }, (_, i) => i + 1) })
    const events: [number, string][] = []
    h.layer.onPage((p, s) => events.push([p, s]))
    const three = h.layer.pageOf(3, { lang: 'zh' })
    expect([1, 2, 3].map(p => h.layer.pageState(p))).toEqual(['laying', 'laying', 'laying'])
    await h.advance()
    await three
    expect(events).toEqual([[1, 'laying'], [2, 'laying'], [3, 'laying'], [1, 'ready'], [2, 'ready'], [3, 'ready']])
    expect(h.layer.pageState(4)).toBe('waiting')
    h.layer.dispose()
  })

  it('makes a covered page wait for its rows in gate mode, until take or end', async () => {
    const M = await made()
    const h = await openFake({ paper: M, parts: 3, leftPart: async () => new Uint8Array(), onRetired: () => {} }, { rows: 'gate' })
    const one = h.layer.pageOf(1, { lang: 'zh' })
    expect(h.layer.pageState(1)).toBe('waiting')
    const { complete } = h.layer.take([[0, [], 'whole', null, null], [2, [], 'whole', null, null]])
    expect(complete).toEqual([1])
    expect(h.layer.pageState(1)).toBe('laying')
    await h.advance()
    await one
    // (page 2's units 3 and 5... wait for end())
    const two = h.layer.pageOf(2, { lang: 'zh' })
    expect(h.layer.pageState(2)).toBe('waiting')
    h.layer.end()
    expect(h.layer.pageState(2)).toBe('laying')
    await h.advance()
    await two
    h.layer.dispose()
  })

  it('is one layer at a time, and checks what it is given', async () => {
    const M = await made()
    const door = createFakeDoor()
    const base = { index: M.index, doc: { numPages: N, getPage: async () => ({}) }, target: 'zh', faceSources: (async () => null) as never, hyphUrl: () => '', rules: BUILTIN_RULES, leftPart: async () => new Uint8Array(), onRetired: () => {} }
    const layer = await door.openLayer(base)
    await expect(door.openLayer(base)).rejects.toThrow(/dispose/)
    layer.dispose()
    await expect(door.openLayer({ ...base, onRetired: undefined as never })).rejects.toThrow(TypeError)
    await expect(door.openLayer({ ...base, doc: { numPages: N + 3, getPage: async () => ({}) }, parts: M.readParts.slice(0, 1) })).rejects.toBeInstanceOf(BundleRefusal)
    const again = await door.openLayer(base)
    again.dispose()
  })
})
