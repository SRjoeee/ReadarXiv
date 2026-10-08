import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captionNames } from '@/pdf-reader/engine/caption-names.mjs'
import { cjkFacesOf, rolesFor } from '@/pdf-reader/engine/font-roles.mjs'
import { defaultParams } from '@/pdf-reader/engine/layer-proto/layer2.mjs'
import type { TargetRules } from '@/pdf-reader/engine/layer-proto/target-rules.mjs'

// The instant layer's choices for a target, made in one call (layer-proto/target-rules.mjs rulesFor), so that a rule set
// read as data replaces that call alone: the built-in choices are today's, and v0's open takes every one of them from it
// (the fit's parameters, the leading and fill defaults, the hyphenation patterns, the CJK family). The call is replaced
// here by one that answers otherwise, and the run follows it

/** what rulesFor answers while a test sets it; the module's own otherwise */
const override = vi.hoisted(() => ({ rulesFor: null as null | ((target: string) => TargetRules) }))
vi.mock('@/pdf-reader/engine/layer-proto/target-rules.mjs', async importOriginal => {
  const actual = await importOriginal<typeof import('@/pdf-reader/engine/layer-proto/target-rules.mjs')>()
  return { ...actual, rulesFor: (target: string) => (override.rulesFor ?? actual.rulesFor)(target) }
})

const TARGETS = ['zh', 'zh-TW', 'ja', 'ko', 'de', 'fr', 'es', 'ru']

describe('the built-in rules for a target (rulesFor)', () => {
  beforeEach(() => { override.rulesFor = null })

  it("are today's choices, each where it was made: the fit's parameters with leadRel off and D on, the caption names, the patterns, the CJK family", async () => {
    const { BUILTIN_RULES, rulesFor } = await import('@/pdf-reader/engine/layer-proto/target-rules.mjs')
    expect(BUILTIN_RULES).toEqual({ schema: 1, version: 1 })
    const family = { zh: ['shs-sc', 'fandolkai'], 'zh-TW': ['shs-tc', 'bkai00mp'], ja: ['haranoaji', null], ko: ['shs-k', null] } as Record<string, [string, string | null]>
    for (const t of TARGETS) {
      const R = rulesFor(t)
      expect(R).toEqual({
        schema: 1, version: 1, target: t,
        params: { ...defaultParams(t), leadRel: false, adaptiveFill: { band: 0.05, track: 0.05, size: 1.1 } },
        labels: captionNames(t),
        patterns: t === 'de' ? ['en', 'de'] : t === 'ru' ? ['en', 'ru'] : ['en'],
        cjkFaces: family[t] ? { group: family[t]![0], kai: family[t]![1], light: ['cm', 'garamond'] } : null,
      })
      expect(R.cjkFaces).toEqual(cjkFacesOf(t))
    }
    // (a fresh object each call: a run changes its own parameters)
    expect(rulesFor('zh').params).not.toBe(rulesFor('zh').params)
    expect(rulesFor('zh').params.adaptiveFill).not.toBe(rulesFor('zh').params.adaptiveFill)
  })

  it("rolesFor draws in the CJK faces it is given, and in the table's own where it is given none", () => {
    for (const t of TARGETS) for (const f of ['cm', 'times', 'garamond', 'other'] as const) expect(rolesFor(t, f)).toEqual(rolesFor(t, f, cjkFacesOf(t)))
    expect(rolesFor('zh', 'times', { group: 'shs-tc', kai: null, light: ['times'] }).cjk).toEqual({ body: 'shs-tc-light', bold: 'shs-tc-semibold', italic: null, boldItalic: null })
    expect(rolesFor('de', 'cm', null).cjk).toBeNull()
    // (a CJK script given no CJK faces has none to draw in: refused, as a script of no roles is)
    expect(() => rolesFor('zh', 'cm', null)).toThrow(/no font roles for zh/)
  })
})

/** the requests the runs made (the hyphenation patterns among them) */
const asked = vi.hoisted(() => {
  // a canvas context that draws nothing and reads a white page, made before layer2.mjs loads (it measures with a canvas
  // of its own made then): an em a CJK character, half one any other
  const ctxStub = (canvas?: { width: number; height: number }) => new Proxy({} as Record<string | symbol, unknown>, {
    get(t, k) {
      if (k in t) return t[k]
      if (k === 'measureText') return (s: string) => { const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(t.font ?? ''))?.[1] ?? 10); return { width: [...s].reduce((w, ch) => w + (/[\u3000-\u9fff]/.test(ch) ? px : px / 2), 0), actualBoundingBoxAscent: 0.7 * px, actualBoundingBoxDescent: 0.2 * px } }
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

/** one page of 300 x 300 PDF units, a paragraph on it in Times */
function paper() {
  const H = 300
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (H - y) * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, H - y / scale] })
  const items = [{ str: 'Alpha beta gamma', transform: [10, 0, 0, 10, 20, 200], width: 200, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }]
  const page = { view: [0, 0, 300, H], getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items, styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), commonObjs: { get: () => ({ name: 'Times-Roman' }) }, cleanup() {} }
  return {
    doc: { numPages: 1, getPage: async () => page },
    geometry: { schema: 1, kinds: ['para'], left: { pages: [[0, 0, 300, 300]], units: [[0, 0, [[1, 20, 197.85, 220, 206.83]]]] } },
    units: [{ kind: 'para', src: 'Alpha beta gamma', state: 'whole', pieces: [{ t: 'text', tr: true, s: '\u6c49\u5b57\u6c49\u5b57' }] }],
  }
}

describe("v0's open takes every choice for its target from the one call", () => {
  beforeEach(() => { override.rulesFor = null; asked.length = 0 })

  it('the parameters, the leading and fill defaults, the patterns it loads and the CJK family are the call\'s, nothing of the target\'s own', async () => {
    const { rulesFor } = await vi.importActual<typeof import('@/pdf-reader/engine/layer-proto/target-rules.mjs')>('@/pdf-reader/engine/layer-proto/target-rules.mjs')
    const built = rulesFor('zh')
    const other: TargetRules = {
      ...built, version: 7,
      params: { ...built.params, leadBase: 1.7, leadRel: true, adaptiveFill: { band: 0.2, track: 0, size: 1 } },
      patterns: ['en', 'xx' as never],
      cjkFaces: { group: 'shs-tc', kai: null, light: ['times', 'cm', 'garamond'] },
    }
    override.rulesFor = t => (t === 'zh' ? structuredClone(other) : rulesFor(t))
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const { bodyFaceId, roleFaces } = await import('@/pdf-reader/engine/layer-proto/fonts.mjs')
    const P = paper()
    const run = await openProto({ ...P, target: 'zh', pages: 1, scale: 1, dpr: 1, copy: false } as never)
    expect(run.P.leadBase).toBe(1.7)
    expect(run.P.leadRel).toBe(true)
    expect(run.P.adaptiveFill).toEqual({ band: 0.2, track: 0, size: 1 })
    expect(run.rules).toEqual({ schema: 1, version: 7 })
    // (the open's faces: Traditional Chinese's, light beside Times, as the call says; the paper's family read from its
    // first page keeps the call's family)
    expect(bodyFaceId()).toBe('shs-tc-light')
    await run.until(1)
    expect(roleFaces()?.cjk?.body).toBe('shs-tc-light')
    expect(asked.filter(u => u.startsWith('/hyph/')).sort()).toEqual(['/hyph/en.json', '/hyph/xx.json'])
    // a parameter the host gives still wins over the call's, as before
    const given = await openProto({ ...paper(), target: 'zh', pages: 1, scale: 1, dpr: 1, copy: false, params: { leadBase: 1.1, adaptiveFill: false } } as never)
    expect(given.P.leadBase).toBe(1.1)
    expect(given.P.adaptiveFill).toBe(false)
  })

  it("opened with the built-in call, a run's parameters are today's: defaultParams' with leadRel off and D on", async () => {
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    for (const t of TARGETS) {
      const run = await openProto({ ...paper(), target: t, pages: 1, scale: 1, dpr: 1, copy: false } as never)
      expect(run.P).toEqual({ ...defaultParams(t), leadRel: false, adaptiveFill: { band: 0.05, track: 0.05, size: 1.1 } })
      expect(run.rules).toEqual({ schema: 1, version: 1 })
    }
  })
})
