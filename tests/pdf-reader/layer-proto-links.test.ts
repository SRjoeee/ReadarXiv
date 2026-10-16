import { beforeAll, describe, expect, it } from 'vitest'
import type { LinkRecord } from '@/pdf-reader/engine/layer-proto/reader.mjs'
import { annotationsOf, askPage, build, bundleOf, installStubs, openRun, PAPERS, rowsOf, type Run } from './helpers/order-paper'

// The links of a laid page, left in place (PR 3a-1; the 3a design §3.1, §3.5, §3.6): the run reads each page's Link annotations as
// the page is drawn and, once the page is final, freezes them into the records pageOf answers. Over the synthetic papers of
// helpers/order-paper.ts, each page's annotations are one over the first characters of every unit's first line there (a destination)
// and one in the margin with no glyph under it (a url), beside a widget and a link with an action, which are not links a reader
// carries. A unit laid has its text erased, so its annotation is dropped (LK8); a unit left the original's keeps its text, so its
// annotation stays where it stands, over the original's ink (LK7); the margin's has no text to lose and stays. The drawing is
// unchanged by any of it (the order test compares every page's markup and operations); LK12 here

beforeAll(() => { installStubs() })

const pagesOf = (n: number) => Array.from({ length: n }, (_, i) => i + 1)
/** the ids of the units left the original's (skipped: a table's column withheld, a unit with a page that cannot be read) */
const leftOf = (run: Run) => new Set(run.skipped.map(s => s.id))

for (const free of [true, false]) {
  describe(`links left in place, the run ${free ? 'letting go of what it laid' : 'keeping it'}`, () => {
    for (const paper of PAPERS) {
      it(`${paper.name}: a unit left the original's keeps its link where it stands, a unit laid loses it, the margin's stays`, async () => {
        const P = build(paper)
        const run = await openRun(P, { free })
        for (const p of pagesOf(P.paper.pages)) await askPage(run, p)
        const left = leftOf(run)
        let total = 0, drawn = 0, inPlace = 0
        for (const p of pagesOf(P.paper.pages)) {
          if (run.failed(p)) { expect(() => run.linksOf(p), `page ${p} failed`).toThrow(RangeError); continue }
          drawn++
          const all = annotationsOf(P.paper.specs, p)
          // (the annotations a reader carries: every one but the widget and the link with an action)
          total += all.length - 2
          const own = P.paper.specs.filter(s => s.lines.some(l => l.page === p))
          const want = own.filter(s => left.has(s.id)).map(s => {
            const a = all[own.indexOf(s)]! as { rect: number[]; dest: string; overlaidText: string }
            return { boxes: a.rect, dest: a.dest, name: a.overlaidText, moved: false, border: { width: 1, rgb: [0, 255, 0], style: 'solid' } }
          })
          const got = run.linksOf(p)
          // (a unit's own first: ranked by its owner, the margin's after every owned one; no unit moves a link yet)
          expect(got.map(({ order: _, ...r }) => r), `${paper.name} page ${p}`).toEqual([...want, { boxes: [270, 2, 290, 12], url: `https://example.org/p${p}`, name: '', moved: false }])
          expect(got.map(r => r.order), `${paper.name} page ${p} ranks`).toEqual(got.map((_, i) => i))
          inPlace += got.length
        }
        const s = run.linkStats
        expect({ total: s.total, unsupported: s.unsupported, unread: s.unread, moved: s.moved }).toEqual({ total, unsupported: drawn, unread: 0, moved: 0 })
        expect(s.inPlace).toBe(inPlace)
        expect(s.inPlace + s.dropped.unmatched).toBe(total)
        expect(s.dropped.ambiguous + s.dropped.unplaced).toBe(0)
      })
    }
  })
}

describe('what a page answers of its links', () => {
  const chain = PAPERS[0]!
  it('LK12: each ask is a new copy, equal and not the same, and a change to one touches no other', async () => {
    const run = await openRun(build(PAPERS[1]!))
    for (const p of pagesOf(4)) await askPage(run, p)
    const a = run.linksOf(2), b = run.linksOf(2)
    expect(a.length).toBeGreaterThan(1)
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
    for (const [i, r] of a.entries()) {
      expect(r, `record ${i}`).not.toBe(b[i])
      expect(r.boxes).not.toBe(b[i]!.boxes)
      if (r.border) expect(r.border).not.toBe(b[i]!.border)
    }
    a[0]!.boxes.length = 0
    a[0]!.name = 'changed'
    delete (a[1] as Partial<LinkRecord>).url
    expect(run.linksOf(2)).toEqual(b)
  })

  it('answers a page that is not final with a RangeError, never a list that would change', async () => {
    const run = await openRun(build(chain))
    expect(() => run.linksOf(1)).toThrow(RangeError)
    expect(() => run.linksOf(99)).toThrow(RangeError)
    await askPage(run, 1)
    expect(run.linksOf(1).length).toBeGreaterThan(0)
  })

  for (const how of ['throw', 'absent'] as const) {
    it(`LK12: annotations that ${how === 'throw' ? 'cannot be read' : 'a page has no call for'} give [] and a count, and the page is laid as ever`, async () => {
      const P = build({ ...chain, annots: how })
      const run = await openRun(P)
      for (const p of pagesOf(P.paper.pages)) await askPage(run, p)
      for (const p of pagesOf(P.paper.pages)) {
        expect(run.failed(p)).toBe(false)
        expect(run.linksOf(p)).toEqual([])
        expect(run.rows[p - 1]!.markup.length).toBeGreaterThan(0)
      }
      expect(run.linkStats).toEqual({ total: 0, inPlace: 0, moved: 0, dropped: { unmatched: 0, ambiguous: 0, unplaced: 0 }, unsupported: 0, unread: P.paper.pages })
      // (and the drawing is the page's with its links read)
      const base = await openRun(build(chain))
      for (const p of pagesOf(P.paper.pages)) await askPage(base, p)
      for (const p of pagesOf(P.paper.pages)) expect([JSON.stringify(run.rows[p - 1]!.ops), run.rows[p - 1]!.markup], `page ${p}`).toEqual([JSON.stringify(base.rows[p - 1]!.ops), base.rows[p - 1]!.markup])
    })
  }

  it('keeps the attribution of the gate under records only: each record names its annotation of the page and the tier that left it', async () => {
    const P = build(PAPERS[1]!)
    const rec = await openRun(P)
    const bare = await openRun(P, { records: false })
    expect(bare.linkSources).toBeUndefined()
    expect(bare.held()).toMatchObject({ records: false })
    for (const p of pagesOf(P.paper.pages)) { await askPage(rec, p); await askPage(bare, p) }
    // (the records change nothing of the answer)
    expect(bare.linksOf(2)).toEqual(rec.linksOf(2))
    const own = P.paper.specs.filter(s => s.lines.some(l => l.page === 2))
    const sources = rec.linkSources!(2)
    const records = rec.linksOf(2)
    expect(sources.length).toBe(records.length)
    // (annotation ranks in PDF.js's order among the page's Link annotations: the units' first, then the margin's, then the action's)
    const rank = (r: LinkRecord) => (r.url ? own.length : own.findIndex(s => `cite.${s.id}` === r.dest))
    expect(sources).toEqual(records.map(r => ({ annots: [[2, rank(r)]], tier: 'place' })))
    // (a copy: changing it changes no later answer)
    sources[0]!.annots[0]![1] = 99
    expect(rec.linkSources!(2)[0]!.annots[0]![1]).not.toBe(99)
  })
})

describe('the reader\'s door answers the links of a page', () => {
  const faceSources = async (id: string) => [{ url: `/f/${id}.otf`, ranges: [0, 0x10ffff] }]
  const hyphUrl = (lang: string) => `/hyph/${lang}.json`
  it('DR1: a page asked again answers equal links, not the same objects; stats counts them', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const P = build(PAPERS[1]!)
    const bundle = bundleOf(P)
    const layer = await openLayer({ bundle, doc: P.doc, target: 'zh', faceSources, hyphUrl })
    layer.take(rowsOf(bundle, P))
    layer.end()
    const a = await layer.pageOf(2, { lang: 'zh' })
    const b = await layer.pageOf(2, { lang: 'zh' })
    // (page 2 of the tables paper: its column of cells is left the original's; the margin's link)
    expect(a.links.length).toBeGreaterThan(1)
    expect(a.links.map(r => r.order)).toEqual(a.links.map((_, i) => i))
    expect(a.links).toEqual(b.links)
    expect(a.links).not.toBe(b.links)
    expect(a.links[0]).not.toBe(b.links[0])
    const s = layer.stats().links
    expect(s.total).toBeGreaterThan(0)
    expect(s.inPlace).toBeGreaterThanOrEqual(a.links.length)
    layer.dispose()
  })
})
