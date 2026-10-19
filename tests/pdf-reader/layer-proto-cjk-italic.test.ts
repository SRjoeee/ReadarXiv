import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// A CJK italic run (the owner's ruling of 2026-10-19, Q17 row 3): in zh, zh-Hant, ja and ko alike it is drawn in the body's
// own face, the same face, size correction and weight as the upright, sheared CJK_SLANT_DEG about its baseline at draw time;
// a bold italic run is the bold face sheared. No Kai, no generated oblique file: the advance is the upright's, by construction
// (the run is measured in the same font string), and the shear is the SVG's skew about the run's baseline

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
type F = typeof import('@/pdf-reader/engine/layer-proto/fonts.mjs')
let L2: L2
let F: F
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  F = await import('@/pdf-reader/engine/layer-proto/fonts.mjs')
})
afterAll(() => F.setRoleFaces(null, 'times', null))

const TARGETS = ['zh', 'zh-TW', 'ja', 'ko'] as const
const style = (o: { bold?: boolean; italic?: boolean } = {}) => ({ fam: 'serif', design: 'times', bold: false, italic: false, caps: false, ...o })
const roles = (to: string) => F.setRoleFaces(to, 'times', resolveRules(BUILTIN_RULES, to).cjkFaces)

describe('a CJK italic run is the body face sheared, in every CJK target', () => {
  it('is one constant, 13 degrees', () => {
    expect(F.CJK_SLANT_DEG).toBe(13)
  })
  for (const to of TARGETS) {
    it(`${to}: the italic is the upright's face, weight and size, sheared; the bold italic the bold's`, () => {
      roles(to)
      const up = F.faceOf(style(), 'cjk', to), ital = F.faceOf(style({ italic: true }), 'cjk', to)
      expect(ital.id).toBe(up.id)
      expect([ital.family, ital.weight, ital.style, ital.size]).toEqual([up.family, up.weight, up.style, up.size])
      expect(up.oblique).toBe(0)
      expect(ital.oblique).toBe(F.CJK_SLANT_DEG)
      // (measured in the upright's own font string: its advance is the upright's)
      expect(F.fontString(ital, 100)).toBe(F.fontString(up, 100))
      const bold = F.faceOf(style({ bold: true }), 'cjk', to), boldIt = F.faceOf(style({ bold: true, italic: true }), 'cjk', to)
      expect(boldIt.id).toBe(bold.id)
      expect(boldIt.weight).toBe(bold.weight)
      expect(boldIt.oblique).toBe(F.CJK_SLANT_DEG)
      expect(bold.oblique).toBe(0)
      // no Kai, whatever the rule set names
      for (const f of [ital, boldIt]) expect(f.ids?.some(id => /kai/.test(id)), `${to} ${f.id}`).toBe(false)
      // a Latin run of the target keeps its own italic face, no shear
      const latin = F.faceOf(style({ italic: true }), 'latin', to)
      expect([latin.style, latin.oblique]).toEqual(['italic', 0])
    })
  }
})

describe('the shear as the SVG draws it', () => {
  const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
  const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
  const P = { ...resolveRules(BUILTIN_RULES, 'zh').params, autospace: 0, compressMax: -1, hyphen: 0 }
  const block = { page: 1, rects: [[1, 10, 97.85, 300, 106.83]], x0: 10, x1: 300, B: [100], exact: [true], sizes: [10], pitch0: 12, free: 0, indent: 0, after: 0, centred: false }
  it("skews an italic run about its own baseline by CJK_SLANT_DEG, and its characters keep the upright's places", () => {
    roles('zh')
    const u = (italic: boolean) => ({ kind: 'para', src: 'a b c', pieces: [{ t: 'text', s: '\u7532' }, ...(italic ? [{ t: 'open', id: 1, src: '\\textit{' }] : []), { t: 'text', s: '\u4e59\u4e19' }, ...(italic ? [{ t: 'close', id: 1, src: '}' }] : []), { t: 'text', s: '\u4e01' }] })
    const lay = (italic: boolean) => L2.layoutUnit2(L2.tokensOf2(u(italic) as never, new Map() as never, 'zh', BASE as never, DESIGNS as never, P as never), [block] as never, 10, P as never)
    const toPx = (x: number, y: number): [number, number] => [x, 792 - y]
    const svg = L2.svgOfUnit(lay(true) as never, 1, toPx, 1, 0)
    expect(svg).toMatch(/<text transform="translate\(([\d.]+) 692\) skewX\(-13\) translate\(-\1 -692\)"><tspan[^>]*>\u4e59\u4e19<\/tspan><\/text>/)
    // (in the line's order: the copy and a search take the runs as they read, the upright before and after the sheared one)
    expect(svg.replace(/<[^>]+>/g, '')).toBe('\u7532\u4e59\u4e19\u4e01')
    // (the places are the upright's: the same lay, only the drawing differs)
    const xsOf = (L: { lines: { items: { x: number }[] }[] }) => L.lines.flatMap(l => l.items.map(i => i.x))
    expect(xsOf(lay(true) as never)).toEqual(xsOf(lay(false) as never))
  })
  it('a babel name set in an italic CJK face is sheared the same way', () => {
    roles('ja')
    const face = F.faceOf(style({ italic: true }), 'cjk', 'ja')
    const svg = L2.svgOfName({ occurrence: 0, text: '\u8a3c\u660e', x: 50, baseline: 700, size: 10, face } as never, (x: number, y: number) => [x, 792 - y], 1)
    expect(svg).toContain('skewX(-13)')
  })
})
