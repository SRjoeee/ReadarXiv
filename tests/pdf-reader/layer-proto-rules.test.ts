import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { openProto } from '@/pdf-reader/engine/layer-proto/run.mjs'
import { BUILTIN_RULES, type RuleSet, resolveRules, TARGETS } from '@/pdf-reader/engine/rules/layout.mjs'

// v0's open reads every choice made for its target from the layout rule set it is given (layer-proto/run.mjs `rules`,
// rules/layout.mjs): none from the target's name. These are the wiring tests: a set passed changes the drawing, no set is
// the built-in one, the faces, the patterns and the float names are the set's. The set's own contract is
// rules-layout.test.ts's; the rows are the layer gate's

/** the requests the runs made (the hyphenation patterns among them) */
const asked = vi.hoisted(() => {
  // a canvas context that draws nothing and reads a white page, made before layer2.mjs loads (it measures with a canvas
  // of its own made then): an em a CJK character, half one any other
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
  const urls: string[] = []
  const g = globalThis as Record<string, unknown>
  g.OffscreenCanvas = class { width = 8; height = 8; getContext() { return ctxStub(this) } }
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = function (this: HTMLCanvasElement) { return ctxStub(this) }
  g.FontFace = class { family: string; constructor(family: string) { this.family = family } load() { return Promise.resolve(this) } }
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add() {}, delete() {}, load: async () => [], check: () => true, ready: Promise.resolve() } })
  g.fetch = async (url: string) => { urls.push(String(url)); return { ok: false, json: async () => null } }
  return urls
})
beforeEach(() => { asked.length = 0 })

/** a set to edit: the built-in one, copied */
const editable = () => structuredClone(BUILTIN_RULES) as unknown as { version: number; scripts: Record<string, Record<string, unknown>>; languages: Record<string, Record<string, unknown>> } & RuleSet

/** one page of 300 x 300 PDF units: the items of Times text at 10 pt, [text, x, width, row] each, on a 12 pt pitch from y = 200
 *  (the row each stands on, the next line by default); the unit's source is their text, or `src` where the page holds more
 *  than the unit writes */
function paper(lines: [string, number, number, number?][] = [['Alpha beta gamma', 20, 200]], tr = '\u6c49\u5b57\u6c49\u5b57', src = lines.map(l => l[0]).join(' ')) {
  const H = 300
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (H - y) * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, H - y / scale] })
  const rowOf = (i: number) => lines[i]![3] ?? i
  const items = lines.map(([str, x, width], i) => ({ str, transform: [10, 0, 0, 10, x, 200 - 12 * rowOf(i)], width, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }))
  const page = { view: [0, 0, 300, H], getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items, styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), cleanup() {}, commonObjs: { get: () => ({ name: 'NimbusRomNo9L-Regu' }) } }
  const rects = [...new Set(lines.map((_, i) => rowOf(i)))].map(r => [1, 20, 197.85 - 12 * r, 220, 206.83 - 12 * r])
  return {
    doc: { numPages: 1, getPage: async () => page },
    geometry: { schema: 1, kinds: ['para'], left: { pages: [[0, 0, 300, 300]], units: [[0, 0, rects]] } },
    units: [{ kind: 'para', src, state: 'whole', pieces: [{ t: 'text', tr: true, s: tr }] }],
  }
}
const open = (o: object = {}, p = paper()) => openProto({ ...p, target: 'zh', pages: 1, scale: 1, dpr: 1, copy: false, ...o } as never)

/** a float's label on the first line, which the unit's source does not write: "Figure 1:" and then the source */
const LABELLED = () => paper([['Figure 1:', 20, 45, 0], ['Alpha beta gamma', 70, 100, 0]], '\u6c49\u5b57\u6c49\u5b57', 'Alpha beta gamma')

describe("v0's open takes every choice for its target from the rule set it is given", () => {
  it('lays a unit at the set\'s leading: zh at 1.5 stands apart from zh at 1.3', async () => {
    // three lines of the original on a 12 pt pitch and a translation of two lines: the first state of the fit holds it,
    // its lines the set's leading apart
    // (the page fill off in both: it spreads each to its frame's foot)
    const three = paper([['Alpha beta', 20, 200], ['gamma delta', 20, 200], ['epsilon zeta', 20, 200]], '\u6c49'.repeat(30))
    const unfilled = editable()
    unfilled.scripts.Hans!.adaptiveFill = null
    const tight = await open({ rules: unfilled }, three)
    const set = editable()
    set.scripts.Hans!.adaptiveFill = null
    set.scripts.Hans!.leadBase = 1.5
    const loose = await open({ rules: set }, paper([['Alpha beta', 20, 200], ['gamma delta', 20, 200], ['epsilon zeta', 20, 200]], '\u6c49'.repeat(30)))
    await Promise.all([tight.until(1), loose.until(1)])
    const baselines = (run: Awaited<ReturnType<typeof open>>) => (run.placed[0]!.layout as unknown as { lines: { baseline: number }[] }).lines.map(l => l.baseline)
    expect(tight.stats[0]!.lead).toBe(1.3)
    expect(loose.stats[0]!.lead).toBe(1.5)
    expect(baselines(tight)).toHaveLength(2)
    expect(baselines(loose)).toHaveLength(2)
    expect(baselines(tight)[0]! - baselines(tight)[1]!).toBeCloseTo(15.6, 6)
    expect(baselines(loose)[0]! - baselines(loose)[1]!).toBeCloseTo(18, 6)
  })

  it('draws as the built-in set does where it is given none: the same parameters, the same page', async () => {
    for (const t of TARGETS) {
      const bare = await open({ target: t })
      const built = await open({ target: t, rules: BUILTIN_RULES })
      await Promise.all([bare.until(1), built.until(1)])
      expect(bare.P).toEqual(built.P)
      expect(bare.P).toEqual(resolveRules(BUILTIN_RULES, t).params)
      expect(bare.rows[0]!.svg.outerHTML).toBe(built.rows[0]!.svg.outerHTML)
      expect(bare.rows[0]!.ops).toEqual(built.rows[0]!.ops)
      bare.dispose()
      built.dispose()
    }
  })

  it('reports the set it was opened with: its schema and version', async () => {
    const run = await open()
    expect(run.rules).toEqual({ schema: 3, version: BUILTIN_RULES.version })
    const set = editable()
    set.version = 4
    expect((await open({ rules: set })).rules).toEqual({ schema: 3, version: 4 })
  })

  it('takes no params option: a host sets a field in the rule set, not on the open (a type test)', () => {
    type Options = Parameters<typeof openProto>[0]
    expectTypeOf<Options>().not.toHaveProperty('params')
    expectTypeOf<Options>().toHaveProperty('rules')
  })

  it("runs on the set's leading rule and fill: leadRel true and no adaptive fill (B) are the set's, not the run's defaults", async () => {
    const set = editable()
    set.languages.zh = { ...set.languages.zh!, leadRel: true, adaptiveFill: null }
    const run = await open({ rules: set })
    expect(run.P.leadRel).toBe(true)
    expect(run.P.adaptiveFill).toBeNull()
    const built = await open()
    expect(built.P.leadRel).toBe(false)
    expect(built.P.adaptiveFill).toEqual({ band: 0.05, track: 0.05, size: 1.1 })
  })

  it("loads the set's hyphenation patterns and draws in the set's CJK family", async () => {
    // (a language's patterns are fetched once in a module's life: this test's modules are its own)
    vi.resetModules()
    const run1 = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const fonts = await import('@/pdf-reader/engine/layer-proto/fonts.mjs')
    const set = editable()
    set.languages.zh = { ...set.languages.zh!, latinPatterns: 'de', cjkFaces: { group: 'shs-tc', kai: null, light: ['times', 'cm', 'garamond'] } }
    const run = await run1.openProto({ ...paper(), target: 'zh', pages: 1, scale: 1, dpr: 1, copy: false, rules: set } as never)
    // (the open's faces: Traditional Chinese's, light beside Times, as the set says; the paper's family read from its first
    // page keeps the set's family)
    expect(fonts.bodyFaceId()).toBe('shs-tc-light')
    await run.until(1)
    expect(fonts.roleFaces()?.cjk?.body).toBe('shs-tc-light')
    expect(asked.filter(u => u.startsWith('/hyph/')).sort()).toEqual(['/hyph/de.json', '/hyph/en.json'])
    // and the built-in set's patterns, for each target: English's for every target, the language's own, Russian's by rules
    for (const [t, want] of [['zh', ['en']], ['de', ['de', 'en']], ['fr', ['en']], ['ru', ['en']]] as const) {
      vi.resetModules()
      asked.length = 0
      const again = await import('@/pdf-reader/engine/layer-proto/run.mjs')
      await again.openProto({ ...paper(), target: t, pages: 1, scale: 1, dpr: 1, copy: false } as never)
      expect(asked.filter(u => u.startsWith('/hyph/')).map(u => u.slice(6, -5)).sort(), t).toEqual([...want])
    }
  })

  it('draws a float label of the set as text: a hostile name is not markup', async () => {
    // "Figure 1:" at the start of the unit's first line, which its source does not write: the label the final names in
    // the target's language
    const set = editable()
    set.languages.zh = { ...set.languages.zh!, labels: { ...set.languages.zh!.labels!, figure: '<img src=x onerror=alert(1)>', table: '\u8868' } }
    const run = await open({ rules: set, labels: { captions: { figure: 'target', table: 'target' } } }, LABELLED())
    await run.until(1)
    const svg = run.rows[0]!.svg
    expect(svg.textContent).toContain('<img src=x onerror=alert(1)> 1:')
    const tags = [...svg.querySelectorAll('*')].map(e => e.localName)
    expect(new Set(tags)).toEqual(new Set(['g', 'text', 'tspan']))
    expect(svg.querySelector('[onerror]')).toBeNull()
    // the built-in set's name for the same label
    const plain = await open({ labels: { captions: { figure: 'target', table: 'target' } } }, LABELLED())
    await plain.until(1)
    expect(plain.rows[0]!.svg.textContent).toContain('\u56fe 1:')
  })
})

/** a column of units on a 300 x 300 page, each { kind, rows (its lines, 12 pt apart from y 200), tr }: every line 200 pt
 *  wide in words of Times at 10 pt, the unit's source their text (the leftover switch's page, below) */
function column(units: { kind: string; rows: number[]; tr: string }[]) {
  const H = 300
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (H - y) * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, H - y / scale] })
  const words = (u: number, r: number) => `unit${u} line${r} alpha beta gamma delta`
  const items = units.flatMap((u, ui) => u.rows.map(r => ({ str: words(ui, r), transform: [10, 0, 0, 10, 20, 200 - 12 * r], width: 200, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false })))
  const page = { view: [0, 0, 300, H], getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items, styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), cleanup() {}, commonObjs: { get: () => ({ name: 'NimbusRomNo9L-Regu' }) } }
  return {
    doc: { numPages: 1, getPage: async () => page },
    geometry: { schema: 1, kinds: units.map(u => u.kind), left: { pages: [[0, 0, 300, 300]], units: units.map((u, i) => [i, i, u.rows.map(r => [1, 20, 197.85 - 12 * r, 220, 206.83 - 12 * r])]) } },
    units: units.map((u, ui) => ({ kind: u.kind, src: u.rows.map(r => words(ui, r)).join(' '), state: 'whole', pieces: [{ t: 'text', tr: true, s: u.tr }] })),
  }
}
// A, six lines, translated in two (thirty characters, twenty a line): filled to 2 em of 10 pt over a pitch of 12, 1.667,
// its last line at 180, 40 over its original's last (140); B and C, two lines each, under it, each translated in one; D, a
// caption below them
const SWITCH_PAGE = () => column([
  { kind: 'para', rows: [0, 1, 2, 3, 4, 5], tr: '\u6c49'.repeat(30) },
  { kind: 'para', rows: [6, 7], tr: '\u5b57'.repeat(20) },
  { kind: 'para', rows: [8, 9], tr: '\u5b57'.repeat(20) },
  { kind: 'caption', rows: [11], tr: '\u56fe'.repeat(10) },
])
/** a page's drawing, its SVG and its operations, as one SHA-256 */
const drawingOf = async (run: Awaited<ReturnType<typeof open>>) => {
  const bytes = new TextEncoder().encode(`${run.rows[0]!.svg.outerHTML}\n${JSON.stringify(run.rows[0]!.ops)}`)
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
}
/** SWITCH_PAGE's drawing by the engine before the leftover switch (0be9390d, D6's F6b, built in a scratch directory from
 *  `git archive 0be9390d src`), opened with its built-in set but Chinese's fill top at 2 em as the set is now: what 'foot'
 *  must still draw */
const BEFORE_THE_SWITCH = '8bbac5fa00176badb835aa6e10bb614e4d00860ad954641f8ae0cec5d8d7a4b6'

describe("the leftover switch over a whole run (openProto, D6's F6c): 'pack' moves the paragraphs up under a short one and paints them last, from the top; 'foot' draws as before the switch", () => {
  const packed = () => { const set = editable(); set.scripts.Hans!.leftover = 'pack'; return set }
  type Laid = { id: number; layout: { lines: { baseline: number }[] } }
  const linesOf = (run: Awaited<ReturnType<typeof open>>, id: number) => (run.placed.find((p: { id: number }) => p.id === id) as unknown as Laid).layout.lines.map(l => l.baseline)
  /** the units in the order their drawing was made on the page (the audit's first entry of each) */
  const painted = (run: Awaited<ReturnType<typeof open>>) => [...new Set(run.audit.map((a: { unit: number }) => a.unit))]
  const packOf = (run: Awaited<ReturnType<typeof open>>, id: number) => (run.stats.find(r => r.id === id) as unknown as { pack?: number }).pack

  it("with 'pack', B rises what A leaves and C what B then leaves, each recorded, painted after the others, top first", async () => {
    const run = await open({ rules: packed() }, SWITCH_PAGE())
    await run.until(1)
    const [a0, a1] = linesOf(run, 0)
    expect([a0, a1!]).toEqual([200, expect.closeTo(180, 2)])
    // (B keeps the original's distance under A's last drawn line: it rises what A's last line stands over A's original last)
    const [b0] = linesOf(run, 1), [c0] = linesOf(run, 2)
    expect(b0! - 128).toBeCloseTo(a1! - 140, 6)
    // (and C, under B's one line, what B's line then stands over B's original last, 116)
    expect(c0! - 104).toBeCloseTo(b0! - 116, 6)
    expect(packOf(run, 1)).toBeCloseTo(40, 1)
    expect(packOf(run, 2)).toBeCloseTo(52, 1)
    expect(packOf(run, 0)).toBeUndefined()
    // (the caption is no paragraph: it stays; the two that moved are painted last, the upper first)
    expect(linesOf(run, 3)).toEqual([68])
    expect(painted(run)).toEqual([0, 3, 1, 2])
    run.dispose()
  })

  it("with 'foot', nothing moves, the units are painted in their laying order, and the drawing is the one before the switch", async () => {
    const set = editable()
    expect(set.scripts.Hans!.leftover).toBe('foot')
    const foot = await open({ rules: set }, SWITCH_PAGE()), built = await open({}, SWITCH_PAGE()), pack = await open({ rules: packed() }, SWITCH_PAGE())
    await Promise.all([foot.until(1), built.until(1), pack.until(1)])
    expect([linesOf(foot, 1), linesOf(foot, 2)]).toEqual([[128], [104]])
    expect(foot.stats.some(r => 'pack' in r)).toBe(false)
    expect(painted(foot)).toEqual([0, 1, 2, 3])
    expect(await drawingOf(foot)).toBe(BEFORE_THE_SWITCH)
    expect(await drawingOf(built)).toBe(BEFORE_THE_SWITCH)
    expect(await drawingOf(pack)).not.toBe(BEFORE_THE_SWITCH)
    for (const r of [foot, built, pack]) r.dispose()
  })
})
