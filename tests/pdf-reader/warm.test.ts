import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The faces a page's units will be drawn in, asked at once before the page is laid (layer-proto/warm.mjs; docs/PDF-READER.md
// §11.8): the paper's family read from its parts' layouts, the target's roles for it, each unit's characters in the face its
// kind and class give, one load a face, nothing asked twice, never a rejection. FontFace and document.fonts are stand-ins that
// record what is declared and loaded

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

/** a part's layout of `lines` lines set in each font (a line row of 8 numbers, its eighth the font's index), on page 1 */
function partOf(fonts: Record<string, number>) {
  const names = Object.keys(fonts)
  const lines: [number, number[]][] = []
  let id = 0
  names.forEach((name, f) => { for (let i = 0; i < (fonts[name] as number); i++) lines.push([id++, [1, 72, 540, 700 - i, 710 - i, 700 - i, 10, f]]) })
  return { layout: { fonts: names, lines } }
}
/** a host serving each face asked as one slice of the CJK and Latin blocks, recording the faces asked */
function host(asked: string[]) {
  return async (id: string) => { asked.push(id); return [{ url: `/s/${id}.woff2`, ranges: [0x20, 0x24f, 0x3000, 0x9fff, 0xff00, 0xffef] }] }
}

describe('familyOfParts: the paper\'s family by the lines set in each font', () => {
  it('the family whose fonts set the most lines; none, other', async () => {
    const { familyOfParts } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    expect(familyOfParts([partOf({ 'ABCDEF+CMR10': 30, 'ABCDEF+NimbusRomNo9L-Regu': 5 })])).toBe('cm')
    expect(familyOfParts([partOf({ 'ABCDEF+CMR10': 3 }), partOf({ 'XYZXYZ+NimbusRomNo9L-Regu': 20, 'XYZXYZ+NimbusRomNo9L-Medi': 4 })])).toBe('times')
    expect(familyOfParts([{ layout: null }, partOf({})])).toBe('other')
    expect(familyOfParts([])).toBe('other')
  })
})

describe('faceWarmer: one load a face for a page\'s units, before v0 checks them', () => {
  it('a Times paper in Chinese: the body\'s CJK characters in the regular face, a heading\'s in the bold, the Latin ones in Nimbus Roman', async () => {
    const { faceWarmer } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    const asked: string[] = []
    const w = faceWarmer({ faceSources: host(asked), target: 'zh' })
    await w.warm([{ heading: false, text: '\u4e2d\u6587 Transformer \u4e2d' }, { heading: true, text: '\u6458\u8981' }], 'times')
    expect(asked).toContain('shs-sc-regular')
    expect(asked).toContain('shs-sc-bold')
    expect(asked).toContain('nimbus-roman-regular')
    const cjk = loads.filter(l => /"axt-shs-sc[^"]*"/.test(l.font.split(',')[0] ?? ''))
    // (each face once, its characters once each, white space never)
    expect(cjk.map(l => l.text).sort()).toEqual(['\u4e2d\u6587', '\u6458\u8981'])
    const latin = loads.find(l => /Transformer/.test(l.text) || /[a-z]/.test(l.text))
    expect([...(latin?.text ?? '')].sort().join('')).toBe([...new Set('Transformer')].sort().join(''))
    expect(loads.every(l => !/\s/.test(l.text))).toBe(true)
  })

  it('a Computer Modern paper takes the light weights (the rules\' light designs): light for the body, semibold for a heading', async () => {
    const { faceWarmer } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    const asked: string[] = []
    await faceWarmer({ faceSources: host(asked), target: 'zh' }).warm([{ heading: false, text: '\u4e2d' }, { heading: true, text: '\u6587' }], 'cm')
    expect(asked).toContain('shs-sc-light')
    expect(asked).toContain('shs-sc-semibold')
    expect(asked).not.toContain('shs-sc-regular')
  })

  it('a character asked once is not asked again; a host that cannot say rejects nothing', async () => {
    const { faceWarmer } = await import('@/pdf-reader/engine/layer-proto/warm.mjs')
    const asked: string[] = []
    const w = faceWarmer({ faceSources: host(asked), target: 'zh' })
    await w.warm([{ heading: false, text: '\u4e2d\u6587' }], 'times')
    const n = loads.length
    await w.warm([{ heading: false, text: '\u6587\u4e2d' }], 'times')
    expect(loads.length).toBe(n)
    await w.warm([{ heading: false, text: '\u6587\u5b57' }], 'times')
    expect(loads.at(-1)?.text).toBe('\u5b57')
    const failing = faceWarmer({ faceSources: async () => { throw new Error('the table did not come') }, target: 'zh' })
    await expect(failing.warm([{ heading: false, text: '\u4e2d' }], 'times')).resolves.toBeUndefined()
  })
})
