// A figure text set in a face of small capitals is drawn in small capitals where the target's alphabet has them, as the body's
// units are (lay/read.ts tstyleOf, breaker/faces.ts faceOf): its style's design and small capitals carried into the figure's
// runs (Codex on #634, ec222ba69: a label in LMRomanCaps10-Regular translated into German was drawn in the paper's serif). A
// CJK target's runs keep the face the fitter gives them.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { rolesFor } from '../../src/breaker/faces.ts'
import { figuresOf } from '../../src/lay/figures.ts'
import type { PaperReading } from '../../src/lay/read.ts'
import type { Metrics, RuleParams, Rows } from '../../src/types.ts'

const metrics: Metrics = {
  ready: () => true,
  // (each character 50 at 100 px: half its size)
  advance: (_f, size, text) => (50 * [...text].length * size) / 100,
  ink: () => [70, 20, 0],
} as Metrics
const member = (design: string): Placed =>
  ({
    ord: 7,
    kind: 'figure',
    text: 'u7',
    plain: 'Overview',
    lines: [[1, 0, 100, 160, 200, 208, 198, 100, 160]],
    style: { role: 'serif', size: 10, design },
    room: { side: [60, 400] },
    align: 'l',
  }) as unknown as Placed
const rowsOf = (s: string): Rows =>
  ({ get: () => ({ ok: true, content: [{ t: 'text', s }] }) as unknown as Row }) as unknown as Rows
const R = { cjkQuotes: false, floorMin: 0.6, centredPunct: false, compressMax: 2 } as RuleParams
const faceOfLaid = (target: string, cjk: { group: string } | null, s: string, design: string) => {
  const paper = {
    designs: { serif: 'times', sans: 'helvetica', mono: 'courier' },
    roles: rolesFor(target, 'times', cjk),
  } as unknown as PaperReading
  const got = figuresOf({ page: 1, ties: [] } as unknown as Part, [member(design)], rowsOf(s), { paper, R, metrics })
  return (got.laid.get(7)?.[0]?.[3] ?? []).map((it) => (it as { face: string }).face)
}

describe("a figure text's small capitals", () => {
  it('draws a label set in a face of small capitals in small capitals in a Latin target, as tstyleOf reads its style', () => {
    const faces = faceOfLaid('de', null, 'Übersicht', 'ABCDEF+LMRomanCaps10-Regular')
    expect(faces.length).toBeGreaterThan(0)
    expect(faces.every((f) => f.includes('axt-lm-roman-caps'))).toBe(true)
    // (a label in the paper's roman: its serif, no small capitals)
    expect(
      faceOfLaid('de', null, 'Übersicht', 'ABCDEF+LMRoman10-Regular').some((f) => f.includes('axt-lm-roman-caps')),
    ).toBe(false)
  })
  it("keeps a CJK target's runs in the face the fitter gave them before: small capitals are no CJK face's", () => {
    // (the paper's design, as the fitter read it before a label's own was carried: the same face, fallbacks and all)
    const before = faceOfLaid('zh-TW', { group: 'shs-tc' }, '概覽', '')
    const caps = faceOfLaid('zh-TW', { group: 'shs-tc' }, '概覽', 'ABCDEF+LMRomanCaps10-Regular')
    const roman = faceOfLaid('zh-TW', { group: 'shs-tc' }, '概覽', 'ABCDEF+LMRoman10-Regular')
    expect(before.length).toBeGreaterThan(0)
    expect(caps).toEqual(before)
    expect(roman).toEqual(before)
  })
})
