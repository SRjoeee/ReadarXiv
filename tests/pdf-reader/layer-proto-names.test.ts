import { describe, expect, it, vi } from 'vitest'
import { indexLayout, LABEL_KINDS, NAME_FLAG, NAME_KEYS, parseLayout, UNIT_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
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
 *  (`beside`), and a paragraph's line at y = 200; the layout file locating the heading as babel's `key`, `flags` its, its
 *  TeX column the paragraph's (20 to 120). `runIn`: IEEEtran's "Abstract—Deep …": the paragraph's line is the heading's,
 *  its dash (the unit's label, 60 to 64) and then its text from 64, the file locating it and the name leading it (RUN_IN,
 *  `glue` after the dash; `whole` false: not located whole, laid by v0's geometry); `bare`: no unit at all, the
 *  paragraph's line text no unit holds (a page of references alone); `column`: the name's TeX column in its row;
 *  `nameSize`: its size there (the unit's lines are 10) */
function paper({ name = 'Abstract', x = 20, width = 40, beside = null as [string, number, number] | null, key = 'abstract', flags = 0, runIn = false, glue = 0, bare = false, whole = true, column = [20, 120], nameSize = 10, text = '\u6c49\u5b57\u6c49\u5b57' } = {}) {
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (px: number, py: number) => [px * scale, (H - py) * scale], convertToPdfPoint: (px: number, py: number) => [px / scale, H - py / scale] })
  const item = (str: string, ix: number, w: number, y: number) => ({ str, transform: [10, 0, 0, 10, ix, y], width: w, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false })
  const items = [item(name, x, width, 230), ...(beside ? [item(beside[0], beside[1], beside[2], 230)] : []), ...(runIn ? [item('\u2014', 60, 4, 230), item('Alpha beta gamma', 64 + glue, 100, 230)] : [item('Alpha beta gamma', 20, 100, 200)])]
  const page = { view: [0, 0, 300, H], getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items, styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), cleanup() {}, commonObjs: { get: () => ({ name: 'NimbusRomNo9L-Regu' }) } }
  const file = {
    schema: 2, layout: '4', pdfjs: '6.3.289', paper: { id: '2610.00001', version: 1, pages: 1 }, left: '', views: [0, 0, 300, 300], fonts: ['NimbusRomNo9L-Regu'],
    units: runIn ? [[0, UNIT_KINDS.indexOf('para'), 9, 0, 1]] : [], lines: runIn ? [[0, [1, 64 + glue, 164 + glue, 230, 237, 227.5, 10, 0]]] : [], frames: runIn ? [[0, [1, 0, 0, 1, -1, 0]]] : [],
    erase: [], ph: [], labels: runIn ? [[0, LABEL_KINDS.indexOf('number'), 1, 60, 230, 64, 237, 228]] : [], headings: [], pageText: [], held: [],
    names: [[1, NAME_KEYS.indexOf(key as never), 1, x, 230, x + width, 237, 228, nameSize, 0, flags | (runIn ? NAME_FLAG.RUN_IN : 0), runIn ? 0 : -1, glue, column[0], column[1]]],
  }
  return {
    doc: { numPages: 1, getPage: async () => page },
    geometry: { schema: 1, kinds: bare ? [] : ['para'], left: { pages: [[0, 0, 300, 300]], units: bare ? [] : [[0, 0, [runIn ? [1, 64 + glue, 227.85, 164 + glue, 236.83] : [1, 20, 197.85, 120, 206.83]]]] } },
    units: bare ? [] : [{ kind: 'para', src: 'Alpha beta gamma', state: 'whole', pieces: [{ t: 'text', tr: true, s: text }] }],
    // (the translation's one text piece the source's: the file locates the run-in unit whole)
    tex: { use: 'lines', texOnly: true, index: indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(file)))), pieces: new Map(runIn && whole ? [[0, [[0]]]] : []) },
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

  it("keeps the original's where the target has no word or no labels are asked, whatever a compile of the translation says", async () => {
    // (a final that keeps the paper's English, `source`, does not decide for a name TeX identified: I4's ruling)
    const source = await open({ labels: { captions: { abstract: 'source' } } })
    await source.until(1)
    expect(source.names.map(n => [n.drawn, n.why, n.text])).toEqual([[true, null, '\u6458\u8981']])
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

  it("sets a run-in name as its unit's line start whatever its width, the original's joint and glue after it", async () => {
    // IEEEtran's "Abstract—…": zh's word, narrower than "Abstract", leaves no gap before the dash
    const zh = await open({}, paper({ runIn: true }))
    await zh.until(1)
    expect(zh.names[0]).toMatchObject({ drawn: true, why: null, text: '\u6458\u8981', unit: 0, size: 10, x: 20 })
    expect(zh.rows[0]!.svg.querySelector('[data-n]')).toBeNull()
    // the dash right where the word ends, no gap: its place after the second ideograph one advance on, as the second's
    // after the first (a run of single characters, each at its own place)
    const run = [...(zh.rows[0]!.svg.querySelectorAll('tspan') ?? [])].find(t => t.textContent?.startsWith('\u6458\u8981\u2014'))
    const xs = (run?.getAttribute('x') ?? '').split(' ').map(Number)
    expect(xs[0]).toBe(20)
    expect(xs[2]! - xs[1]!).toBeCloseTo(xs[1]! - xs[0]!, 1)
    expect(zh.names[0]!.chars.map(c => c.ch).join('')).toBe('Abstract')
    // (the same where v0 lays the unit by its own geometry: the joint is the file's label of it)
    const own = await open({}, paper({ runIn: true, whole: false }))
    await own.until(1)
    expect(own.rows[0]!.svg.textContent?.replace(/\s+/g, '')).toContain('\u6458\u8981\u2014\u6c49\u5b57')
    // de's, wider than its own room (75 against 40): not shrunk, and no space after the dash, as the original has none
    // (the unit's text begins with the source's white space after \begin{abstract}, which TeX skips)
    const de = await open({ target: 'de' }, paper({ runIn: true, text: ' Tiefe Netze' }))
    await de.until(1)
    expect(de.names[0]).toMatchObject({ drawn: true, why: null, text: 'Zusammenfassung', unit: 0, size: 10, x: 20 })
    const line = [...(de.rows[0]!.svg.querySelectorAll('text') ?? [])].map(t => t.textContent).join('|')
    expect(line).toContain('Zusammenfassung\u2014Tiefe')
    // the original's glue after the joint kept, no place to break (amsthm's \labelsep: 3 pt at the original's 10): the
    // translation set that many ems after the dash's end (the stub's half an em), at whatever size the unit is drawn
    const glued = await open({ target: 'de' }, paper({ runIn: true, glue: 3, text: 'Tiefe Netze' }))
    await glued.until(1)
    const spans = [...(glued.rows[0]!.svg.querySelectorAll('tspan') ?? [])]
    const dash = spans.find(t => t.textContent === '\u2014'), after = spans.find(t => t.textContent?.startsWith('Tiefe'))
    const size = Number(dash?.getAttribute('font-size'))
    expect(Number(after?.getAttribute('x')) - (Number(dash?.getAttribute('x')) + 0.5 * size)).toBeCloseTo(0.3 * size, 1)
    // (the glue's em the unit's own size, not the name's: a name of 20 before text of 10 keeps 3 pt as 0.3 em of the text)
    const big = await open({ target: 'de' }, paper({ runIn: true, glue: 3, nameSize: 20, text: 'Tiefe Netze' }))
    await big.until(1)
    const bs = [...(big.rows[0]!.svg.querySelectorAll('tspan') ?? [])]
    const bdash = bs.find(t => t.textContent === '\u2014'), bafter = bs.find(t => t.textContent?.startsWith('Tiefe'))
    const bsize = Number(bdash?.getAttribute('font-size'))
    expect(Number(bafter?.getAttribute('x')) - (Number(bdash?.getAttribute('x')) + 0.5 * bsize)).toBeCloseTo(0.3 * bsize, 1)
    // its unit left the original's (a character no served face holds): the name with it
    const left = await open({ target: 'de' }, paper({ runIn: true }))
    await left.until(1)
    expect(left.names[0]).toMatchObject({ drawn: false, why: 'inline: served', unit: 0 })
    expect(left.rows[0]!.svg.textContent).not.toContain('Zusammenfassung')
  })

  it("takes its room from its TeX column (the file's), on a page no unit holds as on any other", async () => {
    const bare = await open({ target: 'de' }, paper({ bare: true }))
    await bare.until(1)
    expect(bare.names[0]).toMatchObject({ drawn: true, text: 'Zusammenfassung', size: 10, x: 20 })
    // a column narrower than the page's text (20 to 70 against 20 to 120): the word (75) shrunk into its 50
    const narrow = await open({ target: 'de' }, paper({ bare: true, column: [20, 70] }))
    await narrow.until(1)
    expect(narrow.names[0]).toMatchObject({ drawn: true, text: 'Zusammenfassung', x: 20 })
    expect(narrow.names[0]!.size).toBeCloseTo(10 * 50 / 75, 1)
  })

  it("nameInTarget: the word, capitals by the target's locale, none for an empty word or the original's own word", () => {
    const labels = { abstract: 'Résumé', ref: 'Références', index: 'Index', preface: '' }
    expect(nameInTarget({ key: 'abstract', capitals: false }, 'Abstract', labels, 'fr')).toBe('Résumé')
    expect(nameInTarget({ key: 'ref', capitals: true }, 'REFERENCES', labels, 'fr')).toBe('RÉFÉRENCES')
    expect(nameInTarget({ key: 'preface', capitals: false }, 'Preface', labels, 'fr')).toBeNull()
    expect(nameInTarget({ key: 'index', capitals: false }, 'Index', labels, 'fr')).toBeNull()
    expect(nameInTarget({ key: 'glossary', capitals: false }, 'Glossary', labels, 'fr')).toBeNull()
    expect(nameInTarget({ key: 'abstract', capitals: false }, 'Abstract', null, 'fr')).toBeNull()
  })
})
