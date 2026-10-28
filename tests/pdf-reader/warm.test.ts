import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The faces a page will be drawn in, loaded before the page is laid (layer-proto/warm.mjs; docs/PDF-READER.md §11.8): the
// paper's family read from its parts' layouts, what each page sets (its units with their original's style there, its babel
// names, its fonts), the target's roles for the family, the slices that hold what v0 will draw of the page in the faces it
// will draw it in, each slice once, WAVE_SLOTS at a time, never a rejection. FontFace and document.fonts are stand-ins that
// record what is declared and loaded

interface Stub { family: string; url: string; weight: string; status: string; unicodeRange?: string }
let declared: Stub[] = []
/** each FontFace load: its file and weight */
let loads: { url: string; weight: string }[] = []
/** the loads in flight, and the most there were at once */
let inFlight = 0, most = 0
/** a load's answer, held until released where `hold` is set */
let hold = false
let held: (() => void)[] = []
const g = globalThis as Record<string, unknown>
beforeEach(() => {
  declared = []
  loads = []
  inFlight = 0
  most = 0
  hold = false
  held = []
  vi.resetModules()
  g.OffscreenCanvas = class { width = 8; height = 8; getContext() { return { measureText: () => ({ width: 0 }) } } }
  g.FontFace = class {
    family: string; url: string; weight: string; status = 'unloaded'; unicodeRange?: string
    constructor(family: string, src: string, d: { weight?: string; unicodeRange?: string } = {}) { this.family = family; this.url = src; this.weight = d.weight ?? '400'; this.unicodeRange = d.unicodeRange }
    load() {
      this.status = 'loading'
      loads.push({ url: this.url, weight: this.weight })
      inFlight++
      most = Math.max(most, inFlight)
      return new Promise(resolve => {
        const done = () => { inFlight--; this.status = 'loaded'; resolve(this) }
        if (hold) held.push(done)
        else queueMicrotask(done)
      })
    }
  }
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      add(f: Stub) { declared.push(f) },
      delete(f: Stub) { declared = declared.filter(x => x !== f) },
      async load() { return [] },
    },
  })
})
afterEach(() => { vi.restoreAllMocks() })

/** a part's layout of `lines` lines set in each font (a line row of 8 numbers: page, x0, x1, baseline, top, bottom, size,
 *  font), one unit a font from id 0, on page 1 */
function partOf(fonts: Record<string, number>) {
  const names = Object.keys(fonts)
  const lines: [number, number[]][] = []
  names.forEach((name, f) => {
    const rows: number[] = []
    for (let i = 0; i < (fonts[name] as number); i++) rows.push(1, 72, 540, 700 - 12 * i, 710 - 12 * i, 698 - 12 * i, 10, f)
    lines.push([f, rows])
  })
  return { layout: { fonts: names, lines } }
}
/** a host serving each face asked in three slices: Latin (L), CJK below U+8000 (A), CJK from U+8000 (B); the faces asked */
function host(asked: string[]) {
  return async (id: string) => {
    asked.push(id)
    return [{ url: `/s/${id}-L.woff2`, ranges: [0x20, 0x24f] }, { url: `/s/${id}-A.woff2`, ranges: [0x3000, 0x7fff] }, { url: `/s/${id}-B.woff2`, ranges: [0x8000, 0x9fff, 0xff00, 0xffef] }]
  }
}
/** the slices loaded, as `<face id>-<slice>` */
const loaded = () => loads.map(l => /\/s\/([^"]+)\.woff2/.exec(l.url)?.[1]).sort()
const REGULAR = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true, name: 'NimbusRomNo9L-Regu' } as const
const BOLD = { ...REGULAR, bold: true, name: 'NimbusRomNo9L-Medi' } as const

describe('familyOfParts: the paper\'s family by the lines set in each font', () => {
  it('the family whose fonts set the most lines; none, other', async () => {
    const { familyOfParts } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    expect(familyOfParts([partOf({ 'ABCDEF+CMR10': 30, 'ABCDEF+NimbusRomNo9L-Regu': 5 })])).toBe('cm')
    expect(familyOfParts([partOf({ 'ABCDEF+CMR10': 3 }), partOf({ 'XYZXYZ+NimbusRomNo9L-Regu': 20, 'XYZXYZ+NimbusRomNo9L-Medi': 4 })])).toBe('times')
    expect(familyOfParts([{ layout: null }, partOf({})])).toBe('other')
    expect(familyOfParts([])).toBe('other')
  })
})

describe('pagesOfParts: what each page sets, by the parts read so far', () => {
  it('a unit\'s style on its page is its lines\' most common font by width, formulas\' fonts aside; the page\'s fonts and serif design', async () => {
    const { pagesOfParts } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    // unit 0: two short lines in bold and one long in regular (regular wins by width); unit 1: a bold line and a formula's line
    const part = {
      layout: {
        fonts: ['AAAAAA+NimbusRomNo9L-Regu', 'AAAAAA+NimbusRomNo9L-Medi', 'AAAAAA+CMMI10', 'AAAAAA+NimbusMonL-Regu'],
        lines: [
          [0, [1, 72, 120, 700, 710, 698, 10, 1, 1, 72, 120, 688, 698, 686, 10, 1, 1, 72, 540, 676, 686, 674, 10, 0]],
          [1, [1, 72, 300, 650, 660, 648, 10, 1, 1, 72, 540, 638, 648, 636, 10, 2]],
          [2, [2, 72, 540, 700, 710, 698, 10, 3]],
        ] as [number, number[]][],
        names: [[0, 0, 1, 72, 720, 140, 730, 718, 10, 1, 0, -1, 0, 72, 540], [0, 11, 2, 72, 600, 120, 610, 598, 9, 0, 2, -1, 0, 72, 540]],
      },
    }
    const pages = pagesOfParts([part, { layout: null, left: [[7, null, [[3, 72, 600, 540, 610]]]] }])
    const p1 = pages.get(1)
    expect(p1?.units.get(0)?.bold).toBe(false)
    expect(p1?.units.get(1)?.bold).toBe(true)
    expect(p1?.fonts.map(f => f.name).sort()).toEqual(['NimbusRomNo9L-Medi', 'NimbusRomNo9L-Regu'])
    expect(p1?.serif).toBe('times')
    expect(p1?.names).toEqual([{ key: 'abstract', capitals: false, st: expect.objectContaining({ bold: true }) }])
    const p2 = pages.get(2)
    expect(p2?.units.get(2)?.fam).toBe('mono')
    expect(p2?.serif).toBeNull()
    expect(p2?.names).toEqual([{ key: 'figure', capitals: true, st: expect.objectContaining({ bold: false }) }])
    // (a part with no layout: its units by their left rectangles, no style told)
    expect(pages.get(3)?.units.get(7)).toBeNull()
  })
})

describe('faceWarmer: the slices of what v0 will draw of a page, loaded before v0 checks it', () => {
  it('a Times paper in Chinese: each unit in its original\'s style, a heading with none in the bold, an author\'s never; the Latin ones in Nimbus Roman', async () => {
    const { faceWarmer } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    const asked: string[] = []
    await faceWarmer({ faceSources: host(asked), target: 'zh' }).warm({
      units: [
        { kind: 'para', text: '\u4e2d\u6587 Transformer \u4e2d', st: REGULAR },
        // (a heading set in a regular font is drawn regular, as v0 draws it in its original's style)
        { kind: 'heading', text: '\u7b80\u4ecb', st: REGULAR },
        // (an author's unit is never drawn: its characters, here the only ones from U+8000, are not asked)
        { kind: 'author', text: '\u8d3e\u8f89', st: REGULAR },
      ],
    }, 'times')
    expect(asked).toContain('shs-sc-regular')
    expect(asked).not.toContain('shs-sc-bold')
    expect(loaded()).toEqual(['nimbus-roman-regular-L', 'shs-sc-regular-A'])
    // a heading the layout tells no style of: the bold
    loads = []
    await faceWarmer({ faceSources: host([]), target: 'zh' }).warm({ units: [{ kind: 'heading', text: '\u7b80\u4ecb', st: null }] }, 'times')
    expect(loaded()).toEqual(['shs-sc-bold-A'])
  })

  it('a page\'s names in the target\'s words and style, its text fonts\' alphabets, no formula\'s', async () => {
    const { faceWarmer } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    const math = { fam: 'math', bold: false, italic: true, caps: false, design: 'cm', known: true, name: 'CMMI10' } as const
    const mono = { fam: 'mono', bold: false, italic: false, caps: false, design: 'courier', known: true, name: 'NimbusMonL-Regu' } as const
    // (the abstract's name, its word in Chinese across both CJK slices, in the bold face its original is set in)
    await faceWarmer({ faceSources: host([]), target: 'zh' }).warm({ names: [{ key: 'abstract', capitals: false, st: BOLD }] }, 'times')
    expect(loaded()).toEqual(['shs-sc-bold-A', 'shs-sc-bold-B'])
    loads = []
    await faceWarmer({ faceSources: host([]), target: 'zh' }).warm({ fonts: [REGULAR, mono, math] }, 'times')
    expect(loaded()).toEqual(['freemono-regular-L', 'nimbus-roman-regular-L'])
    // (a formula's font asks nothing: its glyphs are v0's to measure)
    loads = []
    const asked: string[] = []
    await faceWarmer({ faceSources: host(asked), target: 'zh' }).warm({ fonts: [math] }, 'times')
    expect(asked).toEqual([])
    expect(loads).toEqual([])
  })

  it('page 1\'s likely faces (v0\'s warmFaces): the CJK body\'s regular and bold, the Latin\'s regular, bold and italic; none of CJK for an alphabet', async () => {
    const { faceWarmer } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    await faceWarmer({ faceSources: host([]), target: 'zh' }).warm({ likely: 'times' }, 'times')
    expect(loaded()).toEqual(['nimbus-roman-bold-L', 'nimbus-roman-italic-L', 'nimbus-roman-regular-L', 'shs-sc-bold-A', 'shs-sc-regular-A'])
    // (an alphabet target warms no CJK face)
    loads = []
    const asked3: string[] = []
    await faceWarmer({ faceSources: host(asked3), target: 'fr' }).warm({ likely: 'times' }, 'times')
    expect(asked3.some(id => id.startsWith('shs-'))).toBe(false)
  })

  it('a Computer Modern paper takes the weights every family takes (the ruling of 2026-10-29): Regular for the body, Bold for a bold heading', async () => {
    const { faceWarmer } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    const asked: string[] = []
    const cmr = { fam: 'serif', bold: false, italic: false, caps: false, design: 'cm', known: true, name: 'CMR10' } as const
    await faceWarmer({ faceSources: host(asked), target: 'zh' }).warm({ units: [{ kind: 'para', text: '\u4e2d', st: cmr }, { kind: 'heading', text: '\u6587', st: { ...cmr, bold: true, name: 'CMBX12' } }] }, 'cm')
    expect(loaded()).toEqual(['shs-sc-bold-A', 'shs-sc-regular-A'])
    expect(asked.some(id => /^shs-sc-(light|semibold)$/.test(id))).toBe(false)
  })

  it('WAVE_SLOTS slices at a time; a slice loaded or loading is not asked again; a host that cannot say rejects nothing', async () => {
    const { faceWarmer, WAVE_SLOTS } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    // (a face in twelve slices of a CJK block each, and a page whose characters are in every one)
    const many = async (id: string) => Array.from({ length: 12 }, (_, i) => ({ url: `/s/${id}-${i}.woff2`, ranges: [0x4e00 + 0x100 * i, 0x4eff + 0x100 * i] }))
    const w = faceWarmer({ faceSources: many, target: 'zh' })
    hold = true
    const text = Array.from({ length: 12 }, (_, i) => String.fromCodePoint(0x4e00 + 0x100 * i)).join('')
    const wave = w.warm({ units: [{ kind: 'para', text, st: REGULAR }] }, 'times')
    for (let i = 0; i < 40 && (held.length || loads.length < 12); i++) {
      await new Promise(r => setTimeout(r, 0))
      held.shift()?.()
    }
    hold = false
    for (const done of held.splice(0)) done()
    await wave
    expect(loads.length).toBe(12)
    expect(most).toBe(WAVE_SLOTS)
    // (asked again, nothing is loaded again)
    const n = loads.length
    await w.warm({ units: [{ kind: 'para', text, st: REGULAR }] }, 'times')
    expect(loads.length).toBe(n)
    const failing = faceWarmer({ faceSources: async () => { throw new Error('the table did not come') }, target: 'zh' })
    await expect(failing.warm({ units: [{ kind: 'para', text: '\u4e2d', st: null }] }, 'times')).resolves.toBeUndefined()
  })
})

describe('a page reached before its own part, and a wave let go', () => {
  it('a page only a unit running on from an earlier part reaches is not covered until its own part is read', async () => {
    const { pagesOfParts } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    // (part 1 covers page 1; its unit 0 runs on to page 2, which part 2 covers)
    const part1 = { pages: [1, 1], layout: { fonts: ['AAAAAA+NimbusRomNo9L-Regu'], lines: [[0, [1, 72, 540, 100, 110, 98, 10, 0, 2, 72, 540, 700, 710, 698, 10, 0]]] as [number, number[]][] } }
    const part2 = { pages: [2, 2], layout: { fonts: ['BBBBBB+NimbusRomNo9L-Medi'], lines: [[1, [2, 72, 540, 650, 660, 648, 10, 0]]] as [number, number[]][], names: [[0, 11, 2, 72, 600, 120, 610, 598, 9, 0, 0, -1, 0, 72, 540]] } }
    const first = pagesOfParts([part1])
    expect(first.get(1)?.covered).toBe(true)
    expect(first.get(2)?.covered).toBe(false)
    expect([...(first.get(2)?.units.keys() ?? [])]).toEqual([0])
    const both = pagesOfParts([part1, part2])
    expect(both.get(2)?.covered).toBe(true)
    expect([...(both.get(2)?.units.keys() ?? [])].sort()).toEqual([0, 1])
    expect(both.get(2)?.names.map(n => n.key)).toEqual(['figure'])
  })

  it('a wave whose signal is aborted begins no slice more; those loading settle', async () => {
    const { faceWarmer, WAVE_SLOTS } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    const many = async (id: string) => Array.from({ length: 12 }, (_, i) => ({ url: `/s/${id}-${i}.woff2`, ranges: [0x4e00 + 0x100 * i, 0x4eff + 0x100 * i] }))
    const ac = new AbortController()
    hold = true
    const text = Array.from({ length: 12 }, (_, i) => String.fromCodePoint(0x4e00 + 0x100 * i)).join('')
    const wave = faceWarmer({ faceSources: many, target: 'zh' }).warm({ units: [{ kind: 'para', text, st: REGULAR }] }, 'times', { signal: ac.signal })
    for (let i = 0; i < 20 && loads.length < WAVE_SLOTS; i++) await new Promise(r => setTimeout(r, 0))
    expect(loads.length).toBe(WAVE_SLOTS)
    ac.abort()
    hold = false
    for (const done of held.splice(0)) done()
    await wave
    expect(loads.length).toBe(WAVE_SLOTS)
  })
})
