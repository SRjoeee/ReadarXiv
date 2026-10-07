import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ADDON_CAP, ADDON_MANIFEST_CAP, ADDON_MANIFEST_VALUES, checkAddonManifest, parseAddonManifest, REMOVAL, type RemovalManifest,
} from '@/pdf-reader/engine/layout/addon-manifest.mjs'
import { LayoutRefusal } from '@/pdf-reader/engine/layout/json.mjs'
import { REMOVAL as REMOVER_REMOVAL } from '@/pdf-reader/engine/layout/remove.mjs'

// The add-on's manifest as a reader reads it (E3's reader, in the module the reader's door may import): every bound is
// broken once, and each refusal names its path. The shapes are the remover's (layout/remove.mjs makeAddon) with the
// gate's `dirty` and `rules`: the shipped manifest (compact, each removed page's place its `at`) and the check's (every
// set at its fixed place, with the outline table and the crops' colours)

const utf8 = (s: string) => new TextEncoder().encode(s)

afterEach(() => { vi.restoreAllMocks() })

/** three pages: the first removed (its R page the add-on's fourth), the second drawn over paper alone, the third refused */
function shipped(): RemovalManifest {
  return {
    schema: 1, removal: REMOVAL, pages: 3, sets: {},
    page: {
      1: { ok: true, units: { 0: [72, 640.5, 300, 660], 4: [] }, at: { R: 4 }, dirty: [72, 640, 80, 650.25], rules: [72, 600, 540, 600.4] },
      2: { ok: true, rules: [100, 500, 400, 500.5] },
      3: { ok: false, refused: 'not planned' },
    },
    appended: 1769, stats: { removed: 10, rules: 0, cut: 10, hidden: 0, refused: 0, forms: 0, streams: 1 },
  }
}
/** the check's: every set's page p at its fixed place (R at 3 + p, P at 6 + p, …), the outline table, the colours */
function check(): RemovalManifest & { outlines: Record<string, (string | number)[]> } {
  return {
    schema: 1, removal: REMOVAL, pages: 3, sets: { R: 3, P: 6, F: 9, C: 12 },
    page: {
      1: { ok: true, units: { 0: [72, 640.5, 300, 660] }, dirty: [72, 640, 80, 650.25] },
      2: { ok: true, units: {} },
      3: { ok: false, refused: 'R: a vertical font' },
    },
    appended: 32402, stats: { removed: 12, rules: 1, cut: 12, hidden: 0, refused: 1, forms: 2, streams: 3 },
    colours: { '1.0': [255, 0, 0], '1.1': [0, 160, 0] },
    outlines: { 'QIMBDZ+NimbusRomNo9L-Regu': ['|389000', 9, -15, 371, 663, 'a|500000', 1, 0, 0, 0] },
  }
}
const VIEWS = [0, 0, 612, 792, 0, 0, 612, 792, 0, 0, 612, 792]
const bytesOf = (m: unknown) => utf8(JSON.stringify(m))
/** the refusal parseAddonManifest throws for `m`, or null */
function refusalOf(m: unknown, o: { pages: number; views?: number[] } = { pages: 3 }): LayoutRefusal | null {
  try { parseAddonManifest(bytesOf(m), o) } catch (e) { if (e instanceof LayoutRefusal) return e; throw e }
  return null
}
/** the shipped manifest with `edit` made to a copy */
// biome-ignore lint/suspicious/noExplicitAny: a test breaks the manifest's types on purpose
const edited = (edit: (m: any) => void, base: () => unknown = shipped) => { const m = structuredClone(base()); edit(m); return m }

describe('parseAddonManifest', () => {
  it('reads the shipped manifest and the check\'s, every field as it was written', () => {
    for (const m of [shipped(), check()]) {
      expect(parseAddonManifest(bytesOf(m), { pages: 3 })).toEqual(m)
      expect(parseAddonManifest(bytesOf(m), { pages: 3, views: VIEWS })).toEqual(m)
    }
  })

  it('REMOVAL is one constant, the remover\'s (layout/remove.mjs re-exports it)', () => {
    expect(REMOVAL).toBe('4')
    expect(REMOVER_REMOVAL).toBe(REMOVAL)
    expect([ADDON_CAP, ADDON_MANIFEST_CAP, ADDON_MANIFEST_VALUES]).toEqual([4 * 2 ** 20, 256 * 1024, 100_000])
  })

  it('refuses a page past `pages`', () => {
    expect(refusalOf(edited(m => { m.page[4] = { ok: true } }))?.path).toBe('page.4')
    expect(refusalOf(edited(m => { delete m.page[3]; m.page[4] = { ok: true } }))?.path).toBe('page.4')
    expect(refusalOf(shipped(), { pages: 2 })?.path).toBe('pages')
    expect(refusalOf(edited(m => { m.page['01'] = m.page[1]; delete m.page[1] }))?.path).toBe('page.01')
  })

  it('refuses `at` past the document', () => {
    // the shipped add-on holds arXiv's 3 pages and one removed page: the document's pages are 4
    expect(refusalOf(edited(m => { m.page[1].at.R = 5 }))?.path).toBe('page.1.at.R')
    expect(refusalOf(edited(m => { m.page[1].at.R = 3 }))?.path).toBe('page.1.at.R')
    expect(refusalOf(edited(m => { m.page[2] = { ok: true, at: { R: 4 } } }))?.path).toBe('page.2.at.R')
    expect(refusalOf(edited(m => { m.page[1].at = { X: 4 } }))?.path).toBe('page.1.at.X')
    expect(refusalOf(edited(m => { m.sets = { R: 3, P: 7 } }, check))?.path).toBe('sets.P')
  })

  it('refuses a stride broken', () => {
    expect(refusalOf(edited(m => { m.page[1].dirty.push(1) }))?.path).toBe('page.1.dirty')
    expect(refusalOf(edited(m => { m.page[2].rules.pop() }))?.path).toBe('page.2.rules')
    expect(refusalOf(edited(m => { m.page[1].units[0].push(1, 2) }))?.path).toBe('page.1.units.0')
    expect(refusalOf(edited(m => { m.outlines.f = ['a', 1, 2, 3] }, check))?.path).toBe('outlines.f')
    // and a box that is empty, or not within its page's view where the views are given
    expect(refusalOf(edited(m => { m.page[1].dirty = [80, 640, 72, 650] }))?.path).toBe('page.1.dirty[2]')
    expect(refusalOf(edited(m => { m.page[1].rules = [72, 600, 640, 601] }), { pages: 3, views: VIEWS })?.path).toBe('page.1.rules[2]')
    expect(refusalOf(edited(m => { m.page[1].rules = [72, 600, 640, 601] }))).toBeNull()
  })

  it('refuses 1e400, and any number not finite', () => {
    const text = JSON.stringify(shipped()).replace('[72,640,80,650.25]', '[72,640,80,1e400]')
    expect(text).toContain('1e400')
    expect(() => parseAddonManifest(utf8(text), { pages: 3 })).toThrow(LayoutRefusal)
    try { parseAddonManifest(utf8(text), { pages: 3 }) } catch (e) { expect((e as LayoutRefusal).path).toBe('page.1.dirty[3]') }
    expect(refusalOf(edited(m => { m.appended = 1.5 }))?.path).toBe('appended')
    expect(refusalOf(edited(m => { m.stats.cut = -1 }))?.path).toBe('stats.cut')
  })

  it('refuses values past the cap with JSON.parse never called, and bytes past the cap before they are decoded', () => {
    const many = edited(m => { m.page[2].rules = Array.from({ length: 4 * 25_001 }, (_, i) => [1, 2, 3, 4][i % 4]) })
    const bytes = bytesOf(many)
    expect(bytes.length).toBeLessThan(ADDON_MANIFEST_CAP)
    const parse = vi.spyOn(JSON, 'parse')
    expect(() => parseAddonManifest(bytes, { pages: 3 })).toThrow(`more than ${ADDON_MANIFEST_VALUES} values`)
    expect(() => parseAddonManifest(new Uint8Array(ADDON_MANIFEST_CAP + 1), { pages: 3 })).toThrow(`more than ${ADDON_MANIFEST_CAP}`)
    expect(parse).not.toHaveBeenCalled()
  })

  it('refuses a `refused` of 201 characters, and reads one of 200', () => {
    expect(refusalOf(edited(m => { m.page[3].refused = 'x'.repeat(201) }))?.path).toBe('page.3.refused')
    expect(refusalOf(edited(m => { m.page[3].refused = 'x'.repeat(200) }))).toBeNull()
    expect(refusalOf(edited(m => { m.page[3].refused = '' }))?.path).toBe('page.3.refused')
    expect(refusalOf(edited(m => { delete m.page[3].refused }))?.path).toBe('page.3.refused')
    // a removed page says nothing refused, and a refused page holds no removal
    expect(refusalOf(edited(m => { m.page[2].refused = 'why' }))?.path).toBe('page.2.refused')
    expect(refusalOf(edited(m => { m.page[3].at = { R: 4 } }))?.path).toBe('page.3.at')
  })

  it('refuses another schema, another remover, a key not of the schema, and a value by its type', () => {
    expect(refusalOf(edited(m => { m.schema = 2 }))?.path).toBe('schema')
    expect(refusalOf(edited(m => { m.removal = '3' }))?.path).toBe('removal')
    expect(refusalOf(edited(m => { m.extra = 1 }))?.path).toBe('extra')
    expect(refusalOf(edited(m => { m.page[1].more = 1 }))?.path).toBe('page.1.more')
    expect(refusalOf(edited(m => { m.page[2].ok = 1 }))?.path).toBe('page.2.ok')
    expect(refusalOf(edited(m => { m.page[1].units = { a: [] } }))?.path).toBe('page.1.units.a')
    expect(refusalOf(edited(m => { m.colours = { '4.0': [255, 0, 0] } }, check))?.path).toBe('colours.4.0')
    expect(refusalOf(edited(m => { m.colours['1.0'] = [256, 0, 0] }, check))?.path).toBe('colours.1.0')
    expect(refusalOf([])?.path).toBe('')
    expect(() => parseAddonManifest('{}' as unknown as Uint8Array, { pages: 3 })).toThrow('not bytes')
  })

  it('checkAddonManifest reads a manifest already parsed by the same rules', () => {
    const m = shipped()
    expect(checkAddonManifest(m, { pages: 3 })).toBe(m)
    expect(() => checkAddonManifest(edited(m => { m.page[1].dirty.push(1) }), { pages: 3 })).toThrow(LayoutRefusal)
  })
})
