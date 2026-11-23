// @vitest-environment node
// A unit's label is what TeX set at its first line's start before its start mark (own/own.ts, MR 5). llncs's \institutename sets
// the first institute's number, `\noindent$^{1}$\enspace`, in the size around the block (\small) BEFORE the institutes' own
// `\scriptsize`, which is the unit's first piece (a placeholder of no mark of its own); every next number, `\and`'s, is set after
// it. So the first number is a superscript of the bigger size, raised 3.81 pt over the line of 6.97 pt text, the others 3.01: the
// label walk's baseline test (|G.y - F.y| under half the larger size, 3.485) takes the others and refuses the first, which no unit
// owns. Left where TeX set it, it stands at the original line's start while the unit's translation is centred: the number far
// from its text. In the translated TeX it is glued before its text, the line centred as a whole, as each other number is.
// Content of our own: a page as a stream of points and glyphs (each glyph its box), the units the ownership reads.
import { describe, expect, it } from 'vitest'
import { ownOf } from '../src/own/own.ts'

type G = {
  n: number
  k: number
  u: string
  x0: number
  x1: number
  y: number
  size: number
  top: number
  bottom: number
}
/** a page from runs: each run its text, its baseline, its size, its x; `pt` a point before the next glyph, `para` TeX's
 *  paragraph point `q<n>` there (marks.ts POINTS_TEX, kept apart: the page's `paras`) */
function page(items: ({ pt: string } | { para: string } | { s: string; y: number; size: number; x: number })[]) {
  const glyphs: G[] = []
  const points: { name: string; glyph: number; box: number }[] = []
  const paras: { name: string; glyph: number; box: number }[] = []
  for (const it of items) {
    if ('pt' in it) {
      points.push({ name: it.pt, glyph: glyphs.length, box: 0 })
      continue
    }
    if ('para' in it) {
      paras.push({ name: it.para, glyph: glyphs.length, box: 0 })
      continue
    }
    let x = it.x
    const w = 0.5 * it.size
    for (const u of it.s) {
      glyphs.push({
        n: glyphs.length,
        k: 0,
        u,
        x0: x,
        x1: x + w,
        y: it.y,
        size: it.size,
        top: it.y + 0.68 * it.size,
        bottom: it.y - 0.02 * it.size,
      })
      x += w
    }
  }
  return {
    glyphs,
    points,
    paras,
    boxes: [] as number[],
    paths: [] as number[],
    boxAt: glyphs.map(() => 0),
    view: [0, 0, 612, 792] as const,
  }
}
const groupsOf = (r: ReturnType<typeof ownOf>, pages: ReturnType<typeof page>[]) => {
  const out: Record<string, string> = {}
  r.glyphs.forEach((G, p) => {
    G.forEach((g, i) => {
      if (g) out[g] = (out[g] ?? '') + pages[p]!.glyphs[i]!.u
    })
  })
  return out
}
// (the block's units: a name, then two places, each opening with the size switch the institutes begin with, as the source holds
// it; a place's text its own)
const units = [
  { kind: 'author', src: 'Ann Lee' },
  {
    kind: 'affiliation',
    pieces: [
      { t: 'ph' as const, src: '\\scriptsize' },
      { t: 'text' as const, s: ' A School of Ours' },
    ],
  },
  { kind: 'affiliation', pieces: [{ t: 'text' as const, s: 'Another School' }] },
]
/** the block as TeX sets it: the name's line, then each place's line, the first place's number at `first` (its size and raise) */
const block = (first: { size: number; raise: number }) =>
  page([
    { pt: '0s' },
    { s: 'AnnLee', y: 613.49, size: 9.96, x: 260 },
    { pt: '0e' },
    // (the first institute: \noindent$^{1}$\enspace, then \scriptsize and the unit's start)
    { s: '1', y: 569.06 + first.raise, size: first.size, x: 220 },
    { pt: '1s' },
    { s: 'ASchoolofOurs', y: 569.06, size: 6.97, x: 228.75 },
    { pt: '1e' },
    // (the next: \and's \par\noindent$^{2}$\enspace after the call point, at the institutes' size)
    { pt: '2c' },
    { s: '2', y: 561.09 + 3.01, size: 4.98, x: 225 },
    { pt: '2s' },
    { s: 'AnotherSchool', y: 561.09, size: 6.97, x: 232.86 },
    { pt: '2e' },
  ])

describe('a number TeX set at a unit’s first line start, raised as a script', () => {
  it('is the unit’s label, whatever the size it was set in (the first institute’s, in the size around the block)', () => {
    // (llncs's first number: \small's script, 5.98 pt, raised 3.81 over the line)
    const pages = [block({ size: 5.98, raise: 3.81 })]
    const r = ownOf(pages, { units })
    expect(groupsOf(r, pages)).toMatchObject({ 'u1.l': '1', 'u2.l': '2' })
    expect(r.units.get(1)?.labelKept).toBe(false)
  })
  it('as the next one is, set in the block’s own size (the rule otherwise holds)', () => {
    const pages = [block({ size: 4.98, raise: 3.01 })]
    expect(groupsOf(ownOf(pages, { units }), pages)).toMatchObject({ 'u1.l': '1', 'u2.l': '2' })
  })
  it('but not a glyph of the line above: the name before it is no label of the place', () => {
    const pages = [block({ size: 5.98, raise: 3.81 })]
    const g = groupsOf(ownOf(pages, { units }), pages)
    expect(g.u0).toBe('AnnLee')
    expect(g['u1.l'] ?? '').toMatch(/^1?$/)
  })
})

describe('a glyph TeX set in the paragraph before a unit’s, on the same row', () => {
  // (acmart's author grid: each author a paragraph of its own, set side by side on one row; the "*" TeX set after the first
  // name, raised, no unit's, stands on the second name's row, its box meeting that line's extent, and between the first's end
  // mark and the second's start: by the line alone it read as the second name's label, carried before its translation across
  // the row. It is the first paragraph's: TeX's point `q<n>` at the second paragraph's start bounds the label)
  const row = (para: boolean) =>
    page([
      { pt: '0s' },
      { s: 'AnnLee', y: 652.14, size: 11.96, x: 117.82 },
      { pt: '0e' },
      { s: '*', y: 654.54, size: 8, x: 162 },
      ...(para ? [{ para: 'q2' }] : []),
      { pt: '1s' },
      { s: 'BoRay', y: 652.14, size: 11.96, x: 269.91 },
      { pt: '1e' },
    ])
  const units2 = [
    { kind: 'author', src: 'Ann Lee' },
    { kind: 'author', src: 'Bo Ray' },
  ]
  it('is no label of the next paragraph’s unit', () => {
    const pages = [row(true)]
    expect(groupsOf(ownOf(pages, { units: units2 }), pages)['u1.l']).toBeUndefined()
  })
  it('where TeX states no paragraph there, the row reads as before: the mark is the next name’s lead', () => {
    const pages = [row(false)]
    expect(groupsOf(ownOf(pages, { units: units2 }), pages)['u1.l']).toBe('*')
  })
})
