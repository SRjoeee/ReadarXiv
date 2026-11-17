import { beforeAll, describe, expect, it } from 'vitest'
import { INK_FREE_SYMBOLS, INK_FREE_WORDS, inkFree } from '@/pdf-reader/engine/rules/tex-kernel.mjs'
import { PH_FLAG } from '@/pdf-reader/engine/layout/file.mjs'

// The control sequences TeX and the kernel define to set no ink and to read nothing after them (rules/tex-kernel.mjs): one
// table for the layout maker (no marks round one, and not a macro that may look ahead, so the placeholder after it keeps its
// marks: "Fig.\@ \ref{x}" lost the \ref's, 2602.23285) and for the layer (a placeholder that draws nothing, with no row)

/** every entry of the table, as a source */
const MEMBERS = [...INK_FREE_SYMBOLS, ...INK_FREE_WORDS.map(w => `\\${w}`)]

describe('the layer: an entry draws nothing, and a unit whose only placeholders without a row are entries is located whole', () => {
  type L1 = typeof import('@/pdf-reader/engine/layer-proto/layer1.mjs')
  type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  type Tex = typeof import('@/pdf-reader/engine/layer-proto/tex.mjs')
  let L1: L1
  let L2: L2
  let T: Tex
  beforeAll(async () => {
    // layer2.mjs measures with a canvas made when it loads; the test environment has none
    const g = globalThis as { OffscreenCanvas?: unknown }
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length }) } } }
    L1 = await import('@/pdf-reader/engine/layer-proto/layer1.mjs')
    L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
    T = await import('@/pdf-reader/engine/layer-proto/tex.mjs')
  })
  it('phClass2 and phClassProven: zero for each entry (a thin, medium or thick space and a control space stay the layer\'s space)', () => {
    for (const src of MEMBERS) {
      const want = ['\\,', '\\;', '\\:', '\\ '].includes(src) ? 'space' : 'zero'
      expect(L2.phClass2(src).cls, src).toBe(want)
      expect(L2.phClassProven(src).cls, src).toBe(want)
    }
    // guard: a kernel macro that starts with \@ is no entry
    expect(L2.phClassProven('\\@m').cls).toBe('other')
  })
  it('a control space is a backslash and any white space (a space, a tab or a line\'s end), and the layer draws it as a space, not as nothing', () => {
    // "vs.\<newline>answer routing": the table counts the backslash and the line's end as a control space (inkFree), so
    // phClass read it as 'zero' and drew '' between "vs." and the word that follows (the translation ran "vs.Antwort" together)
    for (const src of ['\\ ', '\\\n', '\\\t']) {
      expect(inkFree(src), src).toBe(true)
      expect([L2.phClass2(src).cls, L2.phClassProven(src).cls], src).toEqual(['space', 'space'])
      expect([L1.phClass(src), L1.texToText(src), L2.texToText2(src)], src).toEqual(['space', ' ', ' '])
    }
    // not a control space: a backslash with nothing after it, and the control symbols that are no space
    for (const src of ['\\', '\\@', '\\/']) expect(L1.phClass(src), src).not.toBe('space')
  })
  it('locatedWhole: no row for any entry passes; the found \\ref after it is still asked for, and a LOST one fails the unit', () => {
    const lu = (rows: [number, number, number[]][]) => ({ ph: new Map(rows.map(([k, flags, segs]) => [k, { kind: 'ref', flags, segs }])) }) as never
    const found: [number, number, number[]] = [3, 0, [1, 20, 100, 25, 107, 98]]
    for (const sym of MEMBERS) {
      const u = { kind: 'para', src: 'a', pieces: [{ t: 'text', s: 'Fig.' }, { t: 'ph', src: sym }, { t: 'text', s: ' ' }, { t: 'ph', src: '\\ref{x}' }] } as never
      const tr = [[0, 'Fig.'], [1, 1], [0, ' '], [1, 3]]
      expect(T.locatedWhole(lu([found]), u, tr), sym).toEqual({ ok: true, why: null, kOf: [-1, 1, -1, 3] })
      expect(T.locatedWhole(lu([[3, PH_FLAG.LOST, []]]), u, tr).why, sym).toBe('lost')
      expect(T.locatedWhole(lu([]), u, tr).why, sym).toBe('no row')
    }
  })
})

