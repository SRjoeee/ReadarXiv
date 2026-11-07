// D.links on hand-made members, each held to today's links.mjs (engine 065c1d973) on the same case: matchUnit's tiers (geometry
// by a rendering's characters and by TeX's segments, a citation's key, a destination's name, a url, the order of a kind, the
// whole text, the ambiguous), placeUnit's pairs and whole texts, and the targets' kinds.
import { describe, expect, it } from 'vitest'
import {
  type Annot,
  type Cand,
  kindOfAnnot,
  linkKindOf,
  matchUnit,
  placeUnit,
  singleTarget,
  type Target,
  urlOf,
} from '../../../../packages/typeset/src/emit/links.ts'
import { hasToday, todayFile } from '../../../../packages/typeset/tests/replay/tap.ts'

type Today = Record<string, (...a: never[]) => unknown>
const today = hasToday ? ((await import(todayFile('layer-proto/links.mjs'))) as Today) : null
const call = (f: string, ...a: unknown[]) => (today![f] as (...x: unknown[]) => unknown)(...a)

const annot = (i: number, o: Partial<Annot> = {}): Annot => ({ i, dest: 'x', g2: { x: [], y: [], ch: [] }, ...o })
/** fresh targets each call: the whole tier reads `own` lazily and writes it back */
const targetsOf = (): Target[] => [
  { ord: 1, k: 1, kind: 'cite', keys: ['a', 'b'], draw: 'text', gap: new Set(['1|7', '1|8']), single: false },
  { ord: 3, k: 3, kind: 'cite', keys: ['c'], draw: 'text', single: true },
  { ord: 5, k: 5, kind: 'url', url: 'https://example.org/', draw: 'text', single: true },
  { ord: 7, k: 7, kind: 'internal', draw: 'crop', segs: [[1, 100, 500, 140, 510, 498]] },
  { ord: 9, k: 9, kind: 'internal', draw: 'text' },
  { ord: 11, k: 11, kind: 'note', draw: 'text' },
  { ord: null, pair: 'p1', kind: 'internal', name: 'sec:intro', draw: 'pair' },
  { draw: 'whole', own: () => [{ key: '1|40', page: 1, x0: 10, x1: 20, yb: 300 }] },
]
const CANDS: Record<string, Cand[]> = {
  'geometry by a rendering’s characters': [
    { q: 1, a: annot(0, { dest: 'cite.a', g2: { key: ['7', '8'], x: [1, 2], y: [1, 1], ch: ['[', '1'] } }) },
  ],
  'geometry by TeX’s segments': [
    { q: 1, a: annot(0, { dest: 'eq.1', g2: { key: ['99'], x: [110], y: [503], ch: ['x'] } }) },
  ],
  'a citation’s key, two of one target to its one piece': [
    { q: 1, a: annot(0, { dest: 'cite.c' }) },
    { q: 1, a: annot(1, { dest: 'cite.c' }) },
  ],
  'a destination a pair names, a url, the order of a kind': [
    { q: 1, a: annot(0, { dest: 'sec:intro' }) },
    { q: 1, a: annot(1, { url: 'https://example.org' }) },
    { q: 2, a: annot(2, { dest: 'Hfootnote.1' }) },
    { q: 2, a: annot(3, { dest: 'eq:2' }) },
  ],
  'two destinations for one piece: ambiguous; the whole text': [
    { q: 1, a: annot(0, { dest: 'eq:3' }) },
    { q: 1, a: annot(1, { dest: 'eq:4' }) },
    { q: 1, a: annot(2, { dest: 'toc.1', g2: { key: ['40'], x: [15], y: [300], ch: ['A'] } }) },
  ],
}

describe.skipIf(!today)('D.links', () => {
  for (const [name, cands] of Object.entries(CANDS))
    it(`matches: ${name}, as today`, () => {
      const mine = matchUnit({ cands, targets: targetsOf() })
      const theirs = call('matchUnit', { cands, targets: targetsOf() }) as typeof mine
      const flat = (r: typeof mine) => ({
        groups: r.groups.map((g) => ({ to: g.to.k ?? g.to.draw, annots: g.annots.map((c) => [c.q, c.a.i, c.tier]) })),
        tried: r.tried,
      })
      expect(flat(mine)).toEqual(flat(theirs))
    })
  it('reads the targets’ kinds and urls as today', () => {
    const pieces = [
      { t: 'ph', src: '\\cite{a, b}' },
      { t: 'ph', src: '\\citep[p.~3]{c}' },
      { t: 'ph', src: '\\url{https://x.org/a\\_b}' },
      { t: 'ph', src: '\\href{mailto:a@b.c}{mail}' },
      { t: 'ph', src: '\\footnote{x}' },
      { t: 'ph', src: '\\cref{fig:a,fig:b}' },
      { t: 'ph', src: '\\ref{sec:a}' },
      { t: 'ph', src: '$x$' },
      { t: 'nested' },
      { t: 'open', src: '\\href{https://y.org}{' },
      { t: 'open', src: '\\hyperlink{sec:b}{' },
      { t: 'open', src: '\\hyperref[sec:c]{' },
      { t: 'open', src: '\\textbf{' },
      null,
    ]
    for (const p of pieces) {
      const k = linkKindOf(p)
      expect(k).toEqual(call('linkKindOf', p))
      expect(singleTarget(p as never, k)).toBe(call('singleTarget', p, k))
    }
    for (const a of [{ url: 'https://a' }, { dest: 'cite.x' }, { dest: 'Hfootnote.2' }, { dest: ['p', 1] }])
      expect(kindOfAnnot(a)).toBe(call('kindOfAnnot', a))
    for (const u of ['https://a.org/x\\%20', 'not a url', 7]) expect(urlOf(u)).toBe(call('urlOf', u))
  })
  it('places a pair’s text and a whole text with what its link holds beside it, as today', () => {
    const tok = (s: string, link?: string) => ({ s, st: link ? { link } : {} })
    const line = {
      page: 1,
      baseline: 300,
      x0: 10,
      x1: 200,
      block: 0,
      items: [
        { t: tok('See', 'p1'), x: 10, w: 15 },
        { t: { space: true }, x: 25, w: 3 },
        { t: tok('there', 'p1'), x: 28, w: 22 },
        { t: { space: true }, x: 50, w: 3 },
        { t: tok('now.'), x: 53, w: 20 },
      ],
    }
    const runs = [
      {
        text: 'See there now.',
        xs: [10],
        items: [
          [0, 0],
          [2, 4],
          [4, 10],
        ] as [number, number][],
      },
    ]
    const lines = [{ line, runs }]
    const edge = (_l: unknown, run: { xs: number[]; text: string }, at: number) =>
      run.xs[0]! + (at / run.text.length) * 63
    const band = () => ({ top: 307, bottom: 298 })
    for (const draw of ['pair', 'whole'] as const) {
      const to: Target = {
        pair: 'p1',
        draw,
        own: [{ key: '1|5', page: 1, x0: 20, x1: 60, yb: 300 }],
      }
      const a = annot(0, {
        dest: 'sec:intro',
        boxes: [[5, 296, 90, 309]],
        g2: { key: ['5', '6'], x: [40, 80], y: [300, 300], ch: ['T', '9'] },
      })
      const groups = [{ to, annots: [{ q: 1, a, tier: 'key' }] }]
      const mine = placeUnit({ groups, lines: lines as never, edge: edge as never, band, scale: 1 })
      const theirs = call('placeUnit', { groups, lines, edge, band, scale: 1 })
      expect(mine).toEqual(theirs)
      expect(mine.records.length).toBe(1)
    }
  })
})
