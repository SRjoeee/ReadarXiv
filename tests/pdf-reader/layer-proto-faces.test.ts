import { readdirSync, readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COVERAGE } from '@/pdf-reader/engine/font-coverage.mjs'
import { FACES } from '@/pdf-reader/engine/font-roles.mjs'

// v0's faces (layer-proto/fonts.mjs roleFaceSet, run.mjs openProto's `faceSources`): the role table's files, served in
// slices or whole, and nothing else. A PDF.js document of its own making (one page of paragraphs, nothing drawn), fonts
// that load by their slices (a FontFace and document.fonts that know which characters each has loaded), and a canvas that
// measures a character at its face's width only once the slice that holds it has loaded, and records every measure taken
// before: the drawing of a slice run and a whole-file run is then the same only if nothing was measured early

interface Stub { family: string; src: string; url: string; weight: string; style: string; unicodeRange: string | undefined; status: string }
let faces: Stub[] = []
let fontLoads: { font: string; text: string }[] = []
let faceLoads: string[] = []
let early: string[] = []
let fontStrings = new Set<string>()
let rejects: (src: string) => boolean = () => false

/** the code points of a unicode-range descriptor, as [start, end] pairs */
function rangesOf(descriptor: string | undefined): number[][] | null {
  if (descriptor === undefined) return null
  return descriptor.split(',').map(x => x.trim().replace(/^U\+/, '').split('-').map(h => Number.parseInt(h, 16))).map(([a, z]) => [a!, z ?? a!])
}
const inRanges = (ranges: number[][] | null, cp: number) => ranges === null || ranges.some(([a, z]) => cp >= a! && cp <= z!)
/** whether a flat list of [start, end] pairs (a face's COVERAGE) holds a code point */
const flatHas = (flat: readonly number[], cp: number) => { for (let i = 0; i + 1 < flat.length; i += 2) if (cp >= flat[i]! && cp <= flat[i + 1]!) return true; return false }
/** a canvas font string as the engine writes it: its weight, its size and its quoted family list */
function parseFont(font: string) {
  const m = /^(?:italic )?(?:small-caps )?(\d+) ([\d.]+)px (.+)$/.exec(font)
  if (!m) throw new Error(`a font string the engine does not write: ${font}`)
  return { weight: Number(m[1]), px: Number(m[2]), families: [...m[3]!.matchAll(/"([^"]+)"/g)].map(x => x[1]!) }
}
/** a family's faces at the weight nearest the one asked (a family of one weight serves any) */
function facesAt(family: string, weight: number) {
  const mine = faces.filter(f => f.family === family)
  const weights = [...new Set(mine.map(f => Number(f.weight)))]
  const near = weights.sort((a, b) => Math.abs(a - weight) - Math.abs(b - weight))[0]
  return mine.filter(f => Number(f.weight) === near)
}
/** the role table's face a stub is: the cmap its file has */
const idOf = (f: Stub) => Object.values(FACES).find(F => F.family === f.family && String(F.weight) === f.weight && F.style === f.style)?.id

/** a canvas context that draws nothing and measures a character at its face's width once its slice has loaded */
const ctxStub = (canvas?: { width: number; height: number }) => new Proxy({} as Record<string | symbol, unknown>, {
  get(t, k) {
    if (k in t) return t[k]
    if (k === 'measureText') {
      return (s: string) => {
        const { weight, px, families } = parseFont(String(t.font))
        let width = 0
        for (const ch of s) {
          const cp = ch.codePointAt(0)!
          const held = families.some(fam => facesAt(fam, weight).some(f => f.status === 'loaded' && inRanges(rangesOf(f.unicodeRange), cp) && flatHas(COVERAGE[idOf(f)!] ?? [], cp)))
          // (a character whose slice is not loaded is measured in whatever the browser has: a width of another face)
          if (!held) early.push(`${t.font}|${ch}`)
          width += /[\u3000-\u9fff]/.test(ch) ? px : held ? px / 2 : px * 0.3
        }
        return { width, actualBoundingBoxAscent: 0.7 * px, actualBoundingBoxDescent: 0.2 * px }
      }
    }
    if (k === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4).fill(255) })
    if (k === 'createImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4) })
    if (k === 'canvas') return canvas
    return () => {}
  },
  set(t, k, v) { if (k === 'font') fontStrings.add(String(v)); t[k] = v; return true },
})

const g = globalThis as Record<string, unknown>
beforeEach(() => {
  faces = []; fontLoads = []; faceLoads = []; early = []; fontStrings = new Set(); rejects = () => false
  vi.resetModules()
  g.OffscreenCanvas = class { width = 8; height = 8; getContext() { return ctxStub(this) } }
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = function (this: HTMLCanvasElement) { return ctxStub(this) }
  g.FontFace = class {
    family: string; src: string; url: string; weight: string; style: string; unicodeRange: string | undefined; status = 'unloaded'
    constructor(family: string, src: string, d: { weight?: string; style?: string; unicodeRange?: string } = {}) { this.family = family; this.src = src; this.url = /^url\("([^"]*)"\)$/.exec(src)?.[1] ?? src; this.weight = d.weight ?? '400'; this.style = d.style ?? 'normal'; this.unicodeRange = d.unicodeRange }
    load() {
      faceLoads.push(this.url)
      if (rejects(this.url)) { this.status = 'error'; return Promise.reject(new Error('network')) }
      this.status = 'loaded'
      return Promise.resolve(this)
    }
  }
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      add(f: Stub) { faces.push(f) },
      delete(f: Stub) { faces = faces.filter(x => x !== f) },
      check: () => true,
      ready: Promise.resolve(),
      // the faces of the text's families that hold a character of it, loaded; rejected if any one is
      async load(font: string, text: string) {
        fontLoads.push({ font, text })
        const { weight, families } = parseFont(font)
        const want = families.flatMap(fam => facesAt(fam, weight)).filter(f => [...text].some(ch => inRanges(rangesOf(f.unicodeRange), ch.codePointAt(0)!)))
        const done = await Promise.allSettled(want.map(f => (f as unknown as { load(): Promise<unknown> }).load()))
        if (done.some(d => d.status === 'rejected')) throw new Error('NetworkError')
        return want
      },
    },
  })
  // no hyphenation patterns: none is needed for these lines
  g.fetch = async () => ({ ok: false, json: async () => null })
})
afterEach(() => { vi.restoreAllMocks() })

type Slices = { url: string; ranges: number[] }[]
/** a face's coverage cut at every 0x1000 code points, a slice each (the lowest first): the cut of any host */
function cut(id: string, name = (n: number) => `/s/${id}-${n.toString(16)}.woff2`): Slices {
  const by = new Map<number, number[]>()
  const r = COVERAGE[id] as unknown as number[]
  for (let i = 0; i < r.length; i += 2) {
    for (let a = r[i]!; a <= r[i + 1]!;) {
      const chunk = a >> 12, z = Math.min(r[i + 1]!, ((chunk + 1) << 12) - 1)
      const list = by.get(chunk) ?? by.set(chunk, []).get(chunk)!
      list.push(a, z)
      a = z + 1
    }
  }
  return [...by].sort((x, y) => x[0] - y[0]).map(([n, ranges]) => ({ url: name(n), ranges }))
}
const slicesOfAll = async (id: string) => cut(id)

/** a page of 300 x 300 PDF units, its text layer the given lines (each [text, baseline], 10 pt, x 20 to 280) */
function docOf(lines: [string, number][]) {
  const H = 300
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (H - y) * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, H - y / scale] })
  const items = lines.map(([str, y]) => ({ str, transform: [10, 0, 0, 10, 20, y], width: 260, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }))
  const page = { view: [0, 0, 300, H], getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items, styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), commonObjs: { get: () => ({ name: 'Times-Roman' }) }, cleanup() {} }
  return { numPages: 1, getPage: async () => page }
}
/** v0 over one page of paragraphs, one line each from the top (the source and its translation), in the role table's faces */
async function open(paras: [string, string][], o: Record<string, unknown> = {}) {
  const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
  const lines = paras.map(([src], i) => [src, 260 - 30 * i] as [string, number])
  const geometry = { schema: 1, kinds: paras.map(() => 'para'), left: { pages: [[0, 0, 300, 300]], units: paras.map((_, i) => [i, i, [[1, 20, lines[i]![1] - 2.15, 280, lines[i]![1] + 6.83]]]) } }
  const units = paras.map(([src, tr]) => ({ kind: 'para', src, state: 'whole', pieces: [{ t: 'text', tr: true, s: tr }] }))
  const run = await openProto({ doc: docOf(lines), target: 'zh', pages: 1, scale: 1, dpr: 1, copy: false, geometry, units, faceUrl: (f: string) => `/fonts/${encodeURIComponent(f)}`, ...o } as never)
  return run as Awaited<ReturnType<typeof openProto>>
}
const PARAS: [string, string][] = [['Alpha beta gamma', '\u6c49\u5b57 LLM \u6c49\u5b57\u6c49'], ['Delta epsilon zeta', '\u6c49\u5b57\u5b57 abc'], ['Eta theta iota', '\u5b57\u6c49\u5b57\u6c49\u5b57\u6c49']]

describe('slices or whole files give one drawing', () => {
  it('lays the same lines and widths and sets the same SVG, and measures no character before its slice has loaded', async () => {
    const whole = await open(PARAS)
    await whole.until(1)
    const wholeStats = JSON.stringify(whole.stats.map(({ ms, ...r }) => r)), wholeSvg = whole.rows[0]!.svg.innerHTML
    const wholeFaces = faces.slice()
    expect(whole.stats).toHaveLength(3)
    expect(early).toEqual([])
    // each face its whole file, declared with no unicode-range
    expect(wholeFaces.length).toBeGreaterThan(0)
    for (const f of wholeFaces) { expect(f.unicodeRange).toBeUndefined(); expect(f.src).toMatch(/^url\("\/fonts\/[A-Za-z0-9_.%-]+"\)$/) }

    vi.resetModules()
    faces = []; fontLoads = []; faceLoads = []; early = []
    const sliced = await open(PARAS, { faceSources: slicesOfAll })
    await sliced.until(1)
    expect(early).toEqual([])
    expect(JSON.stringify(sliced.stats.map(({ ms, ...r }) => r))).toBe(wholeStats)
    expect(sliced.rows[0]!.svg.innerHTML).toBe(wholeSvg)
    expect(sliced.skipped).toEqual([])
    // each slice one FontFace over its own code points, added once; the Chinese body in several, the others a few
    const urls = faces.map(f => f.url)
    expect(new Set(urls).size).toBe(urls.length)
    for (const f of faces) expect(f.unicodeRange).toMatch(/^U\+[0-9A-F]+(-[0-9A-F]+)?(, U\+[0-9A-F]+(-[0-9A-F]+)?)*$/)
    expect(faces.filter(f => f.family === FACES['shs-sc-regular']!.family && f.weight === '400').length).toBeGreaterThan(5)
    // only what the text needs is fetched: the Chinese body's slices that hold U+6C49, U+5B57 and U+6C38 (the warm-up's), its first
    const fetched = faceLoads.filter(u => u.includes('shs-sc-regular'))
    expect(fetched.length).toBeLessThan(faces.filter(f => f.url.includes('shs-sc-regular')).length)
    expect(fetched.some(u => u.includes('shs-sc-regular-5'))).toBe(true)
    expect(fetched.some(u => u.includes('shs-sc-regular-6'))).toBe(true)
  })
})

describe('a character in no served slice', () => {
  it('skips the unit with the why served, draws no other glyph for it, and fetches nothing for it', async () => {
    const hole = (id: string) => (id === 'shs-sc-regular' ? Promise.resolve(cut(id).map(s => ({ ...s, ranges: s.ranges.filter((_, i, a) => !(a[i - (i % 2)]! <= 0x8bed && a[i - (i % 2) + 1]! >= 0x8bed)) })).filter(s => s.ranges.length)) : slicesOfAll(id))
    // (the Chinese body serves every slice but the one that holds U+8BED, whole)
    const served = await hole('shs-sc-regular')
    expect(served.some(s => s.ranges.some((x, i) => i % 2 === 0 && x <= 0x8bed && s.ranges[i + 1]! >= 0x8bed))).toBe(false)
    const paras: [string, string][] = [['Alpha beta gamma', '\u6c49\u5b57\u6c49'], ['Delta epsilon zeta', '\u6c49\u5b57\u8bed LLM'], ['Eta theta iota', '\u5b57\u6c49']]
    const run = await open(paras, { faceSources: hole })
    await run.until(1)
    expect(run.skipped).toEqual([{ id: 1, kind: 'para', why: 'served', missing: [0x8bed], chars: 6, pages: [1] }])
    expect(run.stats.map(r => r.id).sort()).toEqual([0, 2])
    const svg = run.rows[0]!.svg.innerHTML
    expect(svg).toContain('data-u="0"')
    expect(svg).toContain('data-u="2"')
    expect(svg).not.toContain('data-u="1"')
    for (const ch of '\u8bed') expect(svg).not.toContain(ch)
    // none of its text was asked of a face, its Latin neither
    expect(fontLoads.some(l => l.text.includes('\u8bed'))).toBe(false)
    expect(fontLoads.some(l => l.text.includes('LLM'))).toBe(false)
    expect(early).toEqual([])
  })

  it('leaves a unit with a character the role table has in no face the original, on the default path too (whole files)', async () => {
    // U+10FFFD, a private use character, is in no face's coverage
    const run = await open([['Alpha beta gamma', '\u6c49\u5b57'], ['Delta epsilon zeta', 'abc \u{10FFFD}']])
    await run.until(1)
    expect(run.skipped.map(s => `${s.id}:${s.why}`)).toEqual(['1:served'])
    expect(run.skipped[0]).toMatchObject({ missing: [0x10fffd] })
    expect(run.stats.map(r => r.id)).toEqual([0])
  })
})

describe('an astral math letter in a Chinese unit', () => {
  // U+1D44E, a mathematical italic a, is in Latin Modern Math and in no other face: a Latin run reaches it through its
  // fallback. It was classed CJK (layer2.mjs cjkClassRe), set in the Chinese body, which has no fallback to it, and so its
  // unit was left the original's
  const paras: [string, string][] = [['Alpha beta gamma', '\u6c49\u5b57 \u{1D44E}\u{1D44F} \u6c49'], ['Delta epsilon zeta', '\u6c49\u5b57']]
  const cp = 0x1d44e

  const ways: [string, { faceSources?: typeof slicesOfAll }][] = [['served in slices', { faceSources: slicesOfAll }], ['whole files', {}]]
  it.each(ways)('is drawn, in the math face, with %s', async (_, o) => {
    expect(flatHas(COVERAGE['lm-math'] as unknown as number[], cp)).toBe(true)
    for (const id of Object.keys(FACES)) if (id !== 'lm-math') expect(flatHas(COVERAGE[id] as unknown as number[] ?? [], cp), id).toBe(false)
    const run = await open(paras, o)
    await run.until(1)
    expect(run.skipped).toEqual([])
    expect(run.stats.map(r => r.id).sort()).toEqual([0, 1])
    expect(run.rows[0]!.svg.innerHTML).toContain('\u{1D44E}\u{1D44F}')
    // the letters were asked of a run set in a Latin face whose family list reaches the math face, which was fetched
    const asked = fontLoads.filter(l => l.text.includes('\u{1D44E}'))
    expect(asked.length).toBeGreaterThan(0)
    for (const l of asked) {
      const families = parseFont(l.font).families
      expect(families[0]).not.toBe(FACES['shs-sc-regular']!.family)
      expect(families).toContain(FACES['lm-math']!.family)
    }
    expect(faceLoads.some(u => (o.faceSources ? u.includes('lm-math-1d') : u.includes(FACES['lm-math']!.file)))).toBe(true)
    expect(early).toEqual([])
  })

  it('leaves the unit the original where the math face is not served', async () => {
    const src = async (id: string) => (id === 'lm-math' ? null : slicesOfAll(id))
    const run = await open(paras, { faceSources: src })
    await run.until(1)
    expect(run.skipped.map(s => `${s.id}:${s.why}`)).toEqual(['0:served'])
    expect(run.skipped[0]).toMatchObject({ missing: [0x1d44e, 0x1d44f] })
    expect(run.stats.map(r => r.id)).toEqual([1])
  })
})

describe('a face not served', () => {
  it('leaves the units of the runs set in it the original, though a fallback holds their characters', async () => {
    // Latin Modern Math holds the letters of "abc"; Nimbus Roman, the face a Latin run is set in, is not served
    expect(COVERAGE['lm-math']!.length).toBeGreaterThan(0)
    const holdsLetters = [0x61, 0x62, 0x63].every(cp => (COVERAGE['lm-math'] as unknown as number[]).some((x, i, a) => i % 2 === 0 && x <= cp && a[i + 1]! >= cp))
    expect(holdsLetters).toBe(true)
    const src = async (id: string) => (id === 'nimbus-roman-regular' ? null : slicesOfAll(id))
    const run = await open([['Alpha beta gamma', 'abc'], ['Delta epsilon zeta', '\u6c49\u5b57']], { faceSources: src })
    await run.until(1)
    expect(run.skipped.map(s => `${s.id}:${s.why}`)).toEqual(['0:served'])
    // the Chinese unit is set in the Chinese body, served
    expect(run.stats.map(r => r.id)).toEqual([1])
    expect(early).toEqual([])
  })

  it('leaves the units of a Chinese run the original where the Chinese body is not served', async () => {
    const src = async (id: string) => (id === 'shs-sc-regular' ? null : slicesOfAll(id))
    const run = await open([['Alpha beta gamma', '\u6c49\u5b57'], ['Delta epsilon zeta', 'abc']], { faceSources: src })
    await run.until(1)
    expect(run.skipped.map(s => `${s.id}:${s.why}`)).toEqual(['0:served'])
    // (the Latin run is set in Nimbus Roman, which is served; the Chinese body, its last fallback, is not needed)
    expect(run.stats.map(r => r.id)).toEqual([1])
  })
})

describe('a slice that does not load', () => {
  it('leaves the units whose characters are in it the original, with the why face; a unit in other slices is drawn', async () => {
    // U+6C49 is in the slice of 0x6000, U+5B57 in the slice of 0x5000
    rejects = src => src.includes('shs-sc-regular-6.woff2')
    const run = await open([['Alpha beta gamma', '\u6c49'], ['Delta epsilon zeta', '\u5b57\u5b57'], ['Eta theta iota', '\u6c49\u5b57']], { faceSources: slicesOfAll })
    await run.until(1)
    expect(run.skipped.map(s => `${s.id}:${s.why}`)).toEqual(['0:face', '2:face'])
    expect(run.stats.map(r => r.id)).toEqual([1])
    // no other face is tried for U+6C49: every load that asked for it was for the same font, once for each unit
    const asked = fontLoads.filter(l => l.text.includes('\u6c49'))
    expect(asked).toHaveLength(2)
    expect(new Set(asked.map(l => l.font)).size).toBe(1)
    expect(run.rows[0]!.svg.innerHTML).not.toContain('data-u="0"')
    expect(run.rows[0]!.svg.innerHTML).not.toContain('data-u="2"')
  })

  it('keeps a failed FontFace for the run it failed in, and lets it go before the next open, which declares it again', async () => {
    rejects = src => src.includes('shs-sc-regular-6.woff2')
    const first = await open([['Alpha beta gamma', '\u6c49'], ['Delta epsilon zeta', '\u6c49']], { faceSources: slicesOfAll })
    await first.until(1)
    // (both units: the failed slice stays declared, and fails each)
    expect(first.skipped.map(s => `${s.id}:${s.why}`)).toEqual(['0:face', '1:face'])
    expect(faces.some(f => f.url.includes('shs-sc-regular-6.woff2') && f.status === 'error')).toBe(true)
    rejects = () => false
    const second = await open([['Alpha beta gamma', '\u6c49']], { faceSources: slicesOfAll })
    await second.until(1)
    expect(second.skipped).toEqual([])
    expect(second.stats.map(r => r.id)).toEqual([0])
    expect(faces.filter(f => f.url.includes('shs-sc-regular-6.woff2')).map(f => f.status)).toEqual(['loaded'])
  })

  it('takes a table that rejects, or is not a table, for a face that failed, never for a face not served', async () => {
    const bad: [string, (id: string) => Promise<unknown>][] = [
      ['rejected', async id => { if (id === 'shs-sc-regular') throw new Error('offline'); return slicesOfAll(id) }],
      ['not an array', async id => (id === 'shs-sc-regular' ? { url: '/s/x.woff2' } : slicesOfAll(id))],
      ['a url that ends its own string', async id => (id === 'shs-sc-regular' ? [{ url: '/s/x.woff2"), local("Arial', ranges: [0x6c49, 0x6c49] }] : slicesOfAll(id))],
      ['ranges out of order', async id => (id === 'shs-sc-regular' ? [{ url: '/s/x.woff2', ranges: [0x6c49, 0x6c49, 0x5b57, 0x5b57] }] : slicesOfAll(id))],
      ['an odd count', async id => (id === 'shs-sc-regular' ? [{ url: '/s/x.woff2', ranges: [0x6c49] }] : slicesOfAll(id))],
    ]
    for (const [what, faceSources] of bad) {
      vi.resetModules()
      faces = []
      const run = await open([['Alpha beta gamma', '\u6c49\u5b57']], { faceSources })
      await run.until(1)
      expect(run.skipped.map(s => `${s.id}:${s.why}`), what).toEqual(['0:face'])
      expect(faces.some(f => f.src.includes('local(') || f.url.includes('x.woff2')), what).toBe(false)
    }
  })
})

describe("a unit's tokens as runs", () => {
  it('holds the characters each face draws and measures: a space, and the hyphen of a hyphenated word, in their words\' face', async () => {
    const { setRoleFaces, faceOf, runsOfTokens } = await import('@/pdf-reader/engine/layer-proto/fonts.mjs')
    setRoleFaces('ru', 'times')
    const reg = faceOf({ fam: 'serif', design: 'times', bold: false, italic: false, caps: false }, 'latin', 'ru')
    const bold = faceOf({ fam: 'serif', design: 'times', bold: true, italic: false, caps: false }, 'latin', 'ru')
    const runs = runsOfTokens([
      { s: '\u043f\u0440\u0438\u0432\u0435\u0442', face: reg, hyph: 'ru' }, { space: true, face: reg }, { s: '\u043c\u0438\u0440', face: reg },
      { space: true, face: bold }, { s: 'x', face: bold }, { crop: {}, w100: 0 }, { blockTo: 3, w100: 0 },
    ] as never)
    expect(runs).toHaveLength(2)
    expect(runs[0]!.face).toBe(reg)
    expect([...runs[0]!.text].sort().join('')).toBe([...'\u043f\u0440\u0438\u0432\u0435\u0442\u043c -'].sort().join(''))
    expect(runs[1]!.face).toBe(bold)
    expect([...runs[1]!.text].sort().join('')).toBe(' x')
  })
})

describe('a face asked before its table has loaded', () => {
  it('is awaited, not taken as not served', async () => {
    const wait: (() => void)[] = []
    const faceSources = (id: string) => (id === 'shs-sc-regular' ? new Promise<Slices>(ok => { wait.push(() => ok(cut(id))) }) : slicesOfAll(id))
    const run = await open([['Alpha beta gamma', '\u6c49\u5b57']], { faceSources })
    let settled = false
    const laid = run.until(1).then(() => { settled = true })
    for (let i = 0; i < 20; i++) await new Promise(ok => setTimeout(ok, 0))
    // the table has not come: nothing is decided, nothing skipped for want of it
    expect(settled).toBe(false)
    expect(run.skipped).toEqual([])
    expect(run.stats).toHaveLength(0)
    expect(wait.length).toBe(1)
    wait[0]!()
    await laid
    expect(run.skipped).toEqual([])
    expect(run.stats.map(r => r.id)).toEqual([0])
    expect(early).toEqual([])
  })
})

describe("the body face's first slice", () => {
  it.each([['zh', 'shs-sc-regular'], ['ja', 'haranoaji-regular'], ['de', 'nimbus-roman-regular'], ['ru', 'nimbus-roman-regular']])('is asked, and fetched, at the open (%s: %s)', async (target, body) => {
    const asked: string[] = []
    const faceSources = (id: string) => { asked.push(id); return slicesOfAll(id) }
    const run = await open([['Alpha beta gamma', 'abc']], { faceSources, target })
    // (before a page is drawn: nothing awaited but the open)
    expect(asked).toEqual([body])
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(faceLoads).toEqual([cut(body)[0]!.url])
    void run
  })
})

describe('no local source, no font rule of v0, no generic family', () => {
  const dir = 'src/pdf-reader/engine/layer-proto'
  it('names none in a source file of the layer', () => {
    for (const file of readdirSync(dir).filter(f => f.endsWith('.mjs') || f.endsWith('.d.mts'))) {
      const text = readFileSync(`${dir}/${file}`, 'utf8')
      expect(text, file).not.toMatch(/local\(/)
      expect(text, file).not.toMatch(/@font-face/)
    }
  })

  it('writes none in a sheet rule, a font string or a face source of a run', async () => {
    const GENERIC = /(^|[\s,:"'])(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|math|emoji|fangsong)($|[\s,;"'])/
    for (const how of ['default', 'slices'] as const) {
      vi.resetModules()
      faces = []; fontStrings = new Set()
      // a CJK run, a Latin run, a bold and an italic one, in the faces of the role table
      const run = await open([['Alpha beta gamma', '\u6c49\u5b57 LLM'], ['Delta epsilon zeta', 'abc \u6c49']], how === 'slices' ? { faceSources: slicesOfAll } : {})
      await run.until(1)
      expect(run.stats).toHaveLength(2)
      expect(faces.length).toBeGreaterThan(0)
      for (const f of faces) {
        expect(f.src, how).not.toMatch(/local\(/)
        expect(f.src, how).toMatch(/^url\("[^"()\\ ]+"\)$/)
        expect(f.family, how).toMatch(/^axt-[a-z0-9-]+$/)
      }
      // every font string v0 gave a canvas: the role table's families, quoted, and no generic one
      expect(fontStrings.size).toBeGreaterThan(0)
      for (const font of fontStrings) {
        if (/^100px "Times New Roman", Times$/.test(font)) continue // the instrument's reference width, never drawn (layer2.mjs wRef)
        expect(font, how).not.toMatch(GENERIC)
        expect(font, how).toMatch(/"axt-[a-z0-9-]+"/)
      }
      const rules = [...document.querySelectorAll('style')].flatMap(s => [...((s as HTMLStyleElement).sheet?.cssRules ?? [])].map(r => r.cssText))
      expect(rules.length).toBeGreaterThan(2)
      for (const rule of rules) {
        expect(rule, how).not.toMatch(/@font-face/)
        expect(rule, how).not.toMatch(/local\(/)
        for (const m of rule.matchAll(/font-family:\s*([^;}]+)/g)) expect(m[1], rule).not.toMatch(GENERIC)
      }
      // the SVG says no synthesized style: the sheet that holds .tl sets it off
      expect(rules.some(r => /\.tl\b/.test(r) && /font-synthesis:\s*none/.test(r)), how).toBe(true)
    }
  })
})
