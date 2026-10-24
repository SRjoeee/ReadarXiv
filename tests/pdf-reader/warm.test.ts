import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The faces a page will be drawn in, asked at once before the page is laid (layer-proto/warm.mjs; docs/PDF-READER.md
// §11.8): the paper's family read from its parts' layouts, what each page sets (its units with their original's style there,
// its babel names, its fonts), the target's roles for the family, what v0 will draw of the page in the faces it will draw it
// in, one load a face, nothing asked twice, never a rejection. FontFace and document.fonts are stand-ins that record what is
// declared and loaded

interface Stub { family: string; url: string; weight: string; status: string; unicodeRange?: string }
let declared: Stub[] = []
let loads: { font: string; text: string }[] = []
const g = globalThis as Record<string, unknown>
beforeEach(() => {
  declared = []
  loads = []
  vi.resetModules()
  g.OffscreenCanvas = class { width = 8; height = 8; getContext() { return { measureText: () => ({ width: 0 }) } } }
  g.FontFace = class {
    family: string; url: string; weight: string; status = 'unloaded'; unicodeRange?: string
    constructor(family: string, src: string, d: { weight?: string; unicodeRange?: string } = {}) { this.family = family; this.url = src; this.weight = d.weight ?? '400'; this.unicodeRange = d.unicodeRange }
    load() { this.status = 'loaded'; return Promise.resolve(this) }
  }
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      add(f: Stub) { declared.push(f) },
      delete(f: Stub) { declared = declared.filter(x => x !== f) },
      async load(font: string, text: string) { loads.push({ font, text }); return [] },
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
/** a host serving each face asked as one slice of the CJK and Latin blocks, recording the faces asked */
function host(asked: string[]) {
  return async (id: string) => { asked.push(id); return [{ url: `/s/${id}.woff2`, ranges: [0x20, 0x24f, 0x3000, 0x9fff, 0xff00, 0xffef] }] }
}
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

describe('faceWarmer: one load a face for what v0 will draw of a page, before v0 checks it', () => {
  it('a Times paper in Chinese: each unit in its original\'s style, a heading with none in the bold, an author\'s never; the Latin ones in Nimbus Roman', async () => {
    const { faceWarmer } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    const asked: string[] = []
    const w = faceWarmer({ faceSources: host(asked), target: 'zh' })
    await w.warm({
      units: [
        { kind: 'para', text: '\u4e2d\u6587 Transformer \u4e2d', st: REGULAR },
        // (a heading set in a regular font is drawn regular, as v0 draws it in its original's style)
        { kind: 'heading', text: '\u7b80\u4ecb', st: REGULAR },
        { kind: 'author', text: '\u6d69\u8f89\u8d3e', st: REGULAR },
      ],
    }, 'times')
    expect(asked).toContain('shs-sc-regular')
    expect(asked).not.toContain('shs-sc-bold')
    expect(asked).toContain('nimbus-roman-regular')
    const cjk = loads.filter(l => /"axt-shs-sc[^"]*"/.test(l.font.split(',')[0] ?? ''))
    // (each face once, its characters once each, white space never; the author's characters not at all)
    expect(cjk.map(l => [...l.text].sort().join(''))).toEqual([[...'\u4e2d\u6587\u7b80\u4ecb'].sort().join('')])
    const latin = loads.find(l => /[a-z]/.test(l.text))
    expect([...(latin?.text ?? '')].sort().join('')).toBe([...new Set('Transformer')].sort().join(''))
    expect(loads.every(l => !/\s/.test(l.text))).toBe(true)
    // a heading the layout tells no style of: the bold
    const asked2: string[] = []
    await faceWarmer({ faceSources: host(asked2), target: 'zh' }).warm({ units: [{ kind: 'heading', text: '\u6458\u8981', st: null }] }, 'times')
    expect(asked2).toContain('shs-sc-bold')
    expect(asked2).not.toContain('shs-sc-regular')
  })

  it('a page\'s names in the target\'s words and style, its text fonts\' alphabets (no formula\'s), and page 1\'s likely faces', async () => {
    const { faceWarmer } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    const asked: string[] = []
    const math = { fam: 'math', bold: false, italic: true, caps: false, design: 'cm', known: true, name: 'CMMI10' } as const
    const mono = { fam: 'mono', bold: false, italic: false, caps: false, design: 'courier', known: true, name: 'NimbusMonL-Regu' } as const
    await faceWarmer({ faceSources: host(asked), target: 'zh' }).warm({ names: [{ key: 'abstract', capitals: false, st: BOLD }], fonts: [REGULAR, mono, math] }, 'times')
    // (the abstract's name, its word in Chinese, in the bold face its original is set in)
    expect(loads.some(l => /^700 /.test(l.font) && [...l.text].sort().join('') === [...'\u6458\u8981'].sort().join(''))).toBe(true)
    expect(asked).toContain('shs-sc-bold')
    expect(asked).toContain('nimbus-roman-regular')
    expect(asked).toContain('freemono-regular')
    // (a formula's font asks nothing: its glyphs are v0's to measure)
    const asked1: string[] = [], before = loads.length
    await faceWarmer({ faceSources: host(asked1), target: 'zh' }).warm({ fonts: [math] }, 'times')
    expect(asked1).toEqual([])
    expect(loads.length).toBe(before)
    // page 1's likely faces: the CJK body's regular and bold, the Latin's regular, bold and italic
    const asked2: string[] = []
    await faceWarmer({ faceSources: host(asked2), target: 'zh' }).warm({ likely: 'times' }, 'times')
    for (const id of ['shs-sc-regular', 'shs-sc-bold', 'nimbus-roman-regular', 'nimbus-roman-bold', 'nimbus-roman-italic']) expect(asked2).toContain(id)
    // (an alphabet target warms no CJK face)
    const asked3: string[] = []
    await faceWarmer({ faceSources: host(asked3), target: 'fr' }).warm({ likely: 'times' }, 'times')
    expect(asked3.some(id => id.startsWith('shs-'))).toBe(false)
  })

  it('a Computer Modern paper takes the light weights (the rules\' light designs): light for the body, semibold for a bold heading', async () => {
    const { faceWarmer } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    const asked: string[] = []
    const cmr = { fam: 'serif', bold: false, italic: false, caps: false, design: 'cm', known: true, name: 'CMR10' } as const
    await faceWarmer({ faceSources: host(asked), target: 'zh' }).warm({ units: [{ kind: 'para', text: '\u4e2d', st: cmr }, { kind: 'heading', text: '\u6587', st: { ...cmr, bold: true, name: 'CMBX12' } }] }, 'cm')
    expect(asked).toContain('shs-sc-light')
    expect(asked).toContain('shs-sc-semibold')
    expect(asked).not.toContain('shs-sc-regular')
  })

  it('a character asked once is not asked again; a host that cannot say rejects nothing', async () => {
    const { faceWarmer } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    const asked: string[] = []
    const w = faceWarmer({ faceSources: host(asked), target: 'zh' })
    await w.warm({ units: [{ kind: 'para', text: '\u4e2d\u6587', st: REGULAR }] }, 'times')
    const n = loads.length
    await w.warm({ units: [{ kind: 'para', text: '\u6587\u4e2d', st: REGULAR }] }, 'times')
    expect(loads.length).toBe(n)
    await w.warm({ units: [{ kind: 'para', text: '\u6587\u5b57', st: REGULAR }] }, 'times')
    expect(loads.at(-1)?.text).toBe('\u5b57')
    const failing = faceWarmer({ faceSources: async () => { throw new Error('the table did not come') }, target: 'zh' })
    await expect(failing.warm({ units: [{ kind: 'para', text: '\u4e2d', st: null }] }, 'times')).resolves.toBeUndefined()
  })
})
