import { describe, expect, it, vi } from 'vitest'
import { indexLayout, NAME_FLAG, NAME_KEYS, parseLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { openProto } from '@/pdf-reader/engine/layer-proto/run.mjs'
import { nameInTarget } from '@/pdf-reader/engine/layer-proto/layer2.mjs'

// babel's names drawn by v0 (D1a, run.mjs paintNames): a generated heading the layout file locates (its `names`) set in
// the target's word for it, the original's erased as a label's is, at its size and alignment, where the target has a word
// and the final names it so. A page of one heading no unit holds over a paragraph, with stubbed canvases and faces (an em
// a CJK character, half one any other). CJK text is written as \u escapes

vi.hoisted(() => {
  const ctxStub = (canvas?: { width: number; height: number }) => new Proxy({} as Record<string | symbol, unknown>, {
    get(t, k) {
      if (k in t) return t[k]
      if (k === 'measureText') return (s: string) => { const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(t.font ?? ''))?.[1] ?? 10); return { width: [...s].reduce((w, ch) => w + (/[\u3000-\u9fff]/.test(ch) ? px : px / 2), 0), actualBoundingBoxAscent: 0.7 * px, actualBoundingBoxDescent: 0.2 * px, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * px } }
      if (k === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4).fill(255) })
      if (k === 'createImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4) })
      if (k === 'canvas') return canvas
      return () => {}
    },
    set(t, k, v) { t[k] = v; return true },
  })
  const g = globalThis as Record<string, unknown>
  g.OffscreenCanvas = class { width = 8; height = 8; getContext() { return ctxStub(this) } }
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = function (this: HTMLCanvasElement) { return ctxStub(this) }
  g.FontFace = class { family: string; constructor(family: string) { this.family = family } load() { return Promise.resolve(this) } }
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add() {}, delete() {}, load: async () => [], check: () => true, ready: Promise.resolve() } })
  g.fetch = async () => ({ ok: false, json: async () => null })
})

const H = 300
/** the page: the heading `name` at x on y = 230 (its item `width` wide), whatever stands right of it on its line
 *  (`beside`), and a paragraph's line at y = 200; the layout file locating the heading as babel's `key`, `flags` its */
function paper({ name = 'Abstract', x = 20, width = 40, beside = null as [string, number, number] | null, key = 'abstract', flags = 0 } = {}) {
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (px: number, py: number) => [px * scale, (H - py) * scale], convertToPdfPoint: (px: number, py: number) => [px / scale, H - py / scale] })
  const item = (str: string, ix: number, w: number, y: number) => ({ str, transform: [10, 0, 0, 10, ix, y], width: w, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false })
  const items = [item(name, x, width, 230), ...(beside ? [item(beside[0], beside[1], beside[2], 230)] : []), item('Alpha beta gamma', 20, 100, 200)]
  const page = { view: [0, 0, 300, H], getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items, styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), cleanup() {}, commonObjs: { get: () => ({ name: 'NimbusRomNo9L-Regu' }) } }
  const file = {
    schema: 2, layout: '4', pdfjs: '6.3.289', paper: { id: '2610.00001', version: 1, pages: 1 }, left: '', views: [0, 0, 300, 300], fonts: ['NimbusRomNo9L-Regu'],
    units: [], lines: [], frames: [], erase: [], ph: [], labels: [], headings: [], pageText: [], held: [],
    names: [[1, NAME_KEYS.indexOf(key as never), 1, x, 230, x + width, 237, 228, 10, 0, flags]],
  }
  return {
    doc: { numPages: 1, getPage: async () => page },
    geometry: { schema: 1, kinds: ['para'], left: { pages: [[0, 0, 300, 300]], units: [[0, 0, [[1, 20, 197.85, 120, 206.83]]]] } },
    units: [{ kind: 'para', src: 'Alpha beta gamma', state: 'whole', pieces: [{ t: 'text', tr: true, s: '\u6c49\u5b57\u6c49\u5b57' }] }],
    tex: { use: 'lines', texOnly: true, index: indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(file)))), pieces: new Map() },
  }
}
const open = (o: object = {}, p = paper()) => openProto({ ...p, target: 'zh', pages: 1, scale: 1, dpr: 1, copy: false, labels: { captions: null }, ...o } as never)

describe("v0 draws babel's names in the target's words (D1a)", () => {
  it("sets the target's word for a name the layout file locates, its ink erased, before the page's units", async () => {
    const run = await open()
    await run.until(1)
    expect(run.names).toEqual([expect.objectContaining({ occurrence: 1, key: 'abstract', page: 1, drawn: true, why: null, text: '\u6458\u8981', size: 10, x: 20 })])
    const svg = run.rows[0]!.svg
    expect(svg.querySelector('[data-n="1"]')?.textContent).toBe('\u6458\u8981')
    // its erase the page's first operation, the unit's after it; its characters accounted, which no put-back returns
    expect(run.rows[0]!.ops[0]).toMatchObject({ op: 'erase' })
    expect(run.audit.find(a => a.what === 'erase' && a.name === 1)).toBeDefined()
    expect(run.names[0]!.chars.map(c => c.ch).join('')).toBe('Abstract')
  })

  it("keeps the original's where the final keeps the paper's, the target has no word, or no labels are asked", async () => {
    const source = await open({ labels: { captions: { abstract: 'source' } } })
    await source.until(1)
    expect(source.names.map(n => [n.drawn, n.why])).toEqual([[false, 'source']])
    expect(source.rows[0]!.svg.querySelector('[data-n]')).toBeNull()
    // zh's preface: babel's word empty
    const none = await open({}, paper({ key: 'preface' }))
    await none.until(1)
    expect(none.names.map(n => [n.drawn, n.why])).toEqual([[false, 'no word']])
    // (a run opened with no labels draws no name, as it draws no float's label in the target's)
    const plain = await open({ labels: null })
    await plain.until(1)
    expect(plain.names).toEqual([])
  })

  it('sets capitals where the original is in them, keeps a centred name\'s centre, and shrinks into the room on its line or leaves it', async () => {
    const caps = await open({ target: 'de' }, paper({ name: 'ABSTRACT', flags: NAME_FLAG.CAPITALS }))
    await caps.until(1)
    expect(caps.names[0]).toMatchObject({ drawn: true, text: 'ZUSAMMENFASSUNG' })
    // centred: "Résumé", 30 wide, about the original's middle (40)
    const centred = await open({ target: 'fr' }, paper({ x: 100, flags: NAME_FLAG.CENTRED }))
    await centred.until(1)
    expect(centred.names[0]).toMatchObject({ drawn: true, text: 'Résumé', size: 10, x: 105 })
    // a word wider than the room before the next text on its line: shrunk to fit, to the script's last floor (0.6)
    const tight = await open({ target: 'de' }, paper({ beside: ['text', 64, 20] }))
    await tight.until(1)
    expect(tight.names[0]).toMatchObject({ drawn: false, why: 'unfit' })
    const fits = await open({ target: 'fr' }, paper({ beside: ['text', 64, 20] }))
    await fits.until(1)
    expect(fits.names[0]).toMatchObject({ drawn: true, text: 'Résumé', size: 10 })
  })

  it('nameInTarget: the word, capitals by the target\'s locale, none for an empty word, a `source` answer or the original\'s own word', () => {
    const labels = { abstract: 'Résumé', ref: 'Références', index: 'Index', preface: '' }
    expect(nameInTarget({ key: 'abstract', capitals: false }, 'Abstract', labels, null, 'fr')).toBe('Résumé')
    expect(nameInTarget({ key: 'ref', capitals: true }, 'REFERENCES', labels, {}, 'fr')).toBe('RÉFÉRENCES')
    expect(nameInTarget({ key: 'abstract', capitals: false }, 'Abstract', labels, { abstract: 'source' }, 'fr')).toBeNull()
    expect(nameInTarget({ key: 'abstract', capitals: false }, 'Abstract', labels, { abstract: 'target' }, 'fr')).toBe('Résumé')
    expect(nameInTarget({ key: 'preface', capitals: false }, 'Preface', labels, null, 'fr')).toBeNull()
    expect(nameInTarget({ key: 'index', capitals: false }, 'Index', labels, null, 'fr')).toBeNull()
    expect(nameInTarget({ key: 'glossary', capitals: false }, 'Glossary', labels, null, 'fr')).toBeNull()
    expect(nameInTarget({ key: 'abstract', capitals: false }, 'Abstract', null, null, 'fr')).toBeNull()
  })
})
