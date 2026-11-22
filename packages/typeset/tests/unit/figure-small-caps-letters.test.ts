// A figure text in small capitals (its style's, a face's small capitals carried into its runs): a run asks the face's small
// capitals only where the face's smcp feature substitutes every lower-case letter of the run (@readarxiv/text ownSmallCapsOf);
// else its face is the plain one, measured and drawn in lower case, as a figure text in a face with no small capitals of its own
// is drawn (the class synthesizes none). Asked of a face for a letter it has none for, the run was drawn in lower case and
// measured in the canvas's synthesized small capitals: Linux Libertine's feature substitutes no Greek letter. Parts made by
// hand, words of our own.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { rolesFor } from '../../src/breaker/faces.ts'
import { figuresOf } from '../../src/lay/figures.ts'
import type { PaperReading } from '../../src/lay/read.ts'
import type { Metrics, RuleParams, Rows } from '../../src/types.ts'

const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, text) => (50 * [...text].length * size) / 100,
  ink: () => [70, 20, 0],
} as Metrics
/** a figure text of one line in `design`, set in small capitals (Style.caps) */
const member = (design: string): Placed =>
  ({
    ord: 7,
    kind: 'figure',
    text: 'u7',
    plain: 'Overview',
    lines: [[1, 0, 100, 160, 200, 208, 198, 100, 160]],
    style: { role: 'serif', size: 10, design, caps: 1 },
    room: { side: [60, 400] },
    align: 'l',
  }) as unknown as Placed
const rowsOf = (s: string): Rows =>
  ({ get: () => ({ ok: true, content: [{ t: 'text', s }] }) as unknown as Row }) as unknown as Rows
const R = { cjkQuotes: false, floorMin: 0.6, centredPunct: false, compressMax: 2 } as RuleParams
/** the faces the figure text's runs are drawn in, a German target */
const facesOf = (family: string, design: string, s: string) => {
  const paper = {
    designs: { serif: family, sans: 'helvetica', mono: 'courier' },
    roles: rolesFor('de', family, null),
  } as unknown as PaperReading
  const got = figuresOf({ page: 1, ties: [] } as unknown as Part, [member(design)], rowsOf(s), {
    paper,
    R,
    metrics,
    to: 'de',
  })
  return (got.laid.get(7)?.[0]?.[3] ?? []).map((it) => (it as { face: string }).face)
}

describe("a figure text's small capitals are asked of its face only for letters it has them for", () => {
  it("keeps Libertine's own small capitals for Latin letters, which its feature substitutes", () => {
    const faces = facesOf('libertine', 'LinLibertineT', 'Abc')
    expect(faces.length).toBeGreaterThan(0)
    expect(faces.every((f) => f.startsWith('small-caps ') && f.includes('axt-libertine'))).toBe(true)
  })
  it('sets a run with a Greek letter, which it does not substitute, in the plain face: lower case, measured as drawn', () => {
    for (const s of ['Αβγ', 'Abcδ']) {
      const faces = facesOf('libertine', 'LinLibertineT', s)
      expect(faces.length).toBeGreaterThan(0)
      expect(faces.some((f) => f.startsWith('small-caps '))).toBe(false)
    }
  })
  it('sets a run in a face with no small capitals of its own in the plain face, as it is drawn', () => {
    const faces = facesOf('times', 'NimbusRomNo9L-Regu', 'Abc')
    expect(faces.length).toBeGreaterThan(0)
    expect(faces.some((f) => f.startsWith('small-caps '))).toBe(false)
  })
})
