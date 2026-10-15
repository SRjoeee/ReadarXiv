import { beforeAll, describe, expect, it, vi } from 'vitest'
import { askPage, build, type Built, bundleOf, installStubs, layerSnap, openRun, PAPERS, type Run, rowsOf, runSnap, shuffled, unitsOn } from './helpers/order-paper'

// The order of the asks (the 1b-D design §5, X1 and X2; PR 1b-D0): a page's answer is the same whichever page was asked before it
// and whatever else is asked beside it. Over the synthetic papers of helpers/order-paper.ts (units across page breaks, a table on
// three pages, a float, a footnote carried over a break, a page that cannot be read, a title page and fuller pages for the
// fill): each page's markup, operations, fill numbers, word table and unit records, taken as the page is ready, equal the page
// asked in order, 1 to N — whether the pages are asked in reverse, the last first, in the order three seeds give, each alone
// in a run of its own (X1), or, at the reader's door, in bursts of concurrent asks with aborts by signal and asks made again
// (X2). The engine lays a page asked by its closure alone (Need(p), 1b-D1): a unit's record or a fill number that depended on
// the order would fail one. And a page asked alone reads no more than its closure: the pages drawn, the units laid (X2's bound)

const seen = vi.hoisted(() => ({ runs: [] as unknown[] }))
vi.mock('@/pdf-reader/engine/layer-proto/run.mjs', async importOriginal => {
  const actual = await importOriginal<typeof import('@/pdf-reader/engine/layer-proto/run.mjs')>()
  return { ...actual, openProto: async (o: Parameters<typeof actual.openProto>[0]) => { const run = await actual.openProto(o); seen.runs.push(run); return run } }
})
beforeAll(() => { installStubs() })

/** what each paper is: the units laid, and the units left the original's and why (a column of cells on three pages is withheld; a unit with a page that cannot be read is refused) */
const SHAPE: Record<string, { laid: number; left: string[] }> = {
  'S-A chain': { laid: 8, left: [] },
  'S-B tables': { laid: 6, left: [1, 2, 3, 4, 5].map(id => `${id}:group: on two pages`) },
  'S-C float': { laid: 13, left: [] },
  'S-D footnote': { laid: 6, left: [] },
  'S-D footnote, page 4 unreadable': { laid: 4, left: ['4:page', '5:page'] },
  'S3 fill': { laid: 6, left: [] },
}
const pagesOf = (P: Built) => Array.from({ length: P.paper.pages }, (_, i) => i + 1)
/** the orders a paper's pages are asked in, besides 1 to N */
const orders = (n: number) => {
  const all = Array.from({ length: n }, (_, i) => i + 1)
  return { reverse: all.slice().reverse(), 'last first': [n, ...all.slice(0, -1)], 'seed 3': shuffled(all, 3), 'seed 11': shuffled(all, 11), 'seed 29': shuffled(all, 29) }
}
/** a generator of integers from a seed (a linear congruential generator's), the same on every run */
const lcg = (seed: number) => () => (seed = (seed * 1103515245 + 12345) % 2 ** 31)

describe('the run: a page asked in any order answers as the page asked in order', () => {
  /** the pages asked in `order`, each awaited; each page's answer taken as it is ready */
  async function ask(P: Built, order: number[], free: boolean) {
    const run = await openRun(P, { free })
    const snaps = new Map<number, ReturnType<typeof runSnap>>()
    for (const p of order) { await askPage(run, p); snaps.set(p, runSnap(run, p)) }
    return { run, snaps }
  }
  for (const paper of PAPERS) for (const free of [true, false]) {
    it(`${paper.name}${free ? ', the run letting go of what it laid' : ''}: reversed, the last first, three seeds, each page alone`, async () => {
      const P = build(paper), n = P.paper.pages
      const { run: want, snaps: wanted } = await ask(P, pagesOf(P), free)
      // (the paper is what its name says: units laid across the breaks, a table, a float and a footnote)
      expect({ laid: want.stats.length, left: want.skipped.map(x => `${x.id}:${x.why}`).sort() }, paper.name).toEqual(SHAPE[paper.name])
      expect([...wanted.values()].filter(s => 'failed' in s).length, paper.name).toBe(paper.fail ? 1 : 0)
      // a page's answer is final once it is ready: asked once more after all the others, it is the same
      for (const p of pagesOf(P)) expect(runSnap(want, p), `${paper.name} page ${p} again`).toEqual(wanted.get(p))
      for (const [how, order] of Object.entries(orders(n))) {
        const { run, snaps } = await ask(build(paper), order, free)
        for (const p of pagesOf(P)) {
          expect(snaps.get(p), `${paper.name} ${how} (${order}) page ${p}`).toEqual(wanted.get(p))
          expect(runSnap(run, p), `${paper.name} ${how} page ${p} at the end`).toEqual(wanted.get(p))
        }
        expect(run.skipped.map(s => `${s.id}:${s.why}`).sort(), `${paper.name} ${how} units left`).toEqual(want.skipped.map(s => `${s.id}:${s.why}`).sort())
      }
      // X1: each page first and alone, in a run of its own
      for (const p of pagesOf(P)) {
        const { snaps } = await ask(build(paper), [p], free)
        expect(snaps.get(p), `${paper.name} page ${p} alone`).toEqual(wanted.get(p))
      }
    })
  }

  for (const paper of PAPERS) it(`${paper.name}: a page asked alone draws, lays and readies no more and no less than its closure (X2)`, async () => {
    const P0 = build(paper)
    for (let p = 1; p <= P0.paper.pages; p++) {
      const P = build(paper)
      const run = await openRun(P)
      const C = run.closure(p)
      await askPage(run, p)
      const as = `${paper.name} page ${p}`
      // (page 1 drawn first, then the closure's pages in order, each once: its draw, the failed one among them read too)
      expect(P.doc.asked, as).toEqual(C.draw)
      // (the units laid are those on its pass pages, in their rank; every page its closure makes ready is)
      expect(run.order.every(id => unitsOn(P, C.pass).includes(id)), `${as}: laid ${run.order}`).toBe(true)
      expect(run.order.length, as).toBeLessThanOrEqual(C.lay.length)
      for (const q of C.ready) expect(run.ready(q) || run.failed(q), `${as}: page ${q} of its ready set`).toBe(true)
      expect(run.ready(p) || run.failed(p), as).toBe(true)
    }
  })

  it('a title page then fuller pages: each page\'s fill target is its own, whichever page is asked first', async () => {
    const paper = PAPERS.find(x => x.name === 'S3 fill')!
    const { run: want } = await ask(build(paper), [1, 2, 3, 4], true)
    // (the local tests' S3 paper: the targets of a title page and three fuller pages)
    expect(want.rows.map(r => r.fill?.target)).toEqual([1, 1.25, 1.667, 1.5])
    for (const order of [[4, 3, 2, 1], [3, 1, 4, 2], [2]]) {
      const { run } = await ask(build(paper), order, true)
      for (const p of order) expect(run.rows[p - 1]!.fill, `${order} page ${p}`).toEqual(want.rows[p - 1]!.fill)
    }
  })
})

describe('the reader\'s door: pageOf in any order, bursts, aborts and asks made again answer as the page asked in order', () => {
  const faceSources = async (id: string) => [{ url: `/f/${id}.otf`, ranges: [0, 0x10ffff] }]
  const hyphUrl = (lang: string) => `/hyph/${lang}.json`
  const lang = 'zh-Hans'
  /** the paper's layer, its rows taken at once and ended; the run it opened */
  async function open(P: Built) {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const bundle = bundleOf(P)
    const layer = await openLayer({ bundle, doc: P.doc, target: 'zh', faceSources, hyphUrl })
    layer.take(rowsOf(bundle, P))
    layer.end()
    return { layer, run: seen.runs.at(-1) as Run }
  }
  type Layer = Awaited<ReturnType<typeof open>>['layer']
  type Snap = ReturnType<typeof layerSnap> | { failed: true }
  /** a page asked for: its answer as it is ready, or that it failed */
  async function answer(layer: Layer, run: Run, p: number, o: { signal?: AbortSignal } = {}): Promise<Snap> {
    try {
      const { svg, words } = await layer.pageOf(p, { lang, ...o })
      return layerSnap(run, svg, words, p)
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      return { failed: true }
    }
  }
  async function inOrder(P: Built) {
    const { layer, run } = await open(P)
    const snaps = new Map<number, Snap>()
    for (const p of pagesOf(P)) snaps.set(p, await answer(layer, run, p))
    const states = pagesOf(P).map(p => layer.pageState(p)).join()
    layer.dispose()
    return { snaps, states }
  }

  for (const paper of PAPERS) {
    it(`${paper.name}: reversed, the last first, three seeds, each page alone`, async () => {
      const P = build(paper)
      const { snaps: wanted, states } = await inOrder(P)
      expect(states).toBe(pagesOf(P).map(p => (p === paper.fail ? 'failed' : 'ready')).join())
      for (const [how, order] of Object.entries(orders(P.paper.pages))) {
        const { layer, run } = await open(build(paper))
        for (const p of order) expect(await answer(layer, run, p), `${how} (${order}) page ${p}`).toEqual(wanted.get(p))
        // (once all are asked: a page asked again is the same page, a new element)
        for (const p of pagesOf(P)) expect(await answer(layer, run, p), `${how} page ${p} again`).toEqual(wanted.get(p))
        expect(pagesOf(P).map(p => layer.pageState(p)).join(), how).toBe(states)
        layer.dispose()
      }
      for (const p of pagesOf(P)) {
        const { layer, run } = await open(build(paper))
        expect(await answer(layer, run, p), `page ${p} alone`).toEqual(wanted.get(p))
        layer.dispose()
      }
    })

    it(`${paper.name}: bursts of concurrent asks, some aborted by signal, some made again`, async () => {
      const P = build(paper)
      const { snaps: wanted } = await inOrder(P)
      let abortsSeen = 0
      for (const seed of [5, 17, 41]) {
        const { layer, run } = await open(build(paper))
        const rnd = lcg(seed)
        const queue = shuffled(pagesOf(P), seed), tried = new Set<number>(), got = new Map<number, Snap>()
        let aborted = 0
        while (queue.length) {
          const burst = queue.splice(0, 1 + (rnd() % 3))
          const asks = burst.map(p => {
            const ctl = new AbortController(), first = !tried.has(p)
            tried.add(p)
            const done = answer(layer, run, p, { signal: ctl.signal }).then(s => ({ p, s }), e => ({ p, e }))
            // (the first ask of a page now and then aborted at once; a page asked again while it is asked, with no signal)
            if (first && rnd() % 3 === 0) ctl.abort()
            return done
          })
          if (rnd() % 4 === 0) asks.push(answer(layer, run, burst[0]!).then(s => ({ p: burst[0]!, s }), e => ({ p: burst[0]!, e })))
          for (const r of await Promise.all(asks)) {
            if ('e' in r) { expect((r.e as Error).name).toBe('AbortError'); aborted++; queue.push(r.p) } else if (!got.has(r.p)) got.set(r.p, r.s)
            else expect(r.s, `seed ${seed} page ${r.p} asked twice`).toEqual(got.get(r.p))
          }
        }
        for (const p of pagesOf(P)) expect(got.get(p), `seed ${seed} page ${p}`).toEqual(wanted.get(p))
        abortsSeen += aborted
        layer.dispose()
      }
      // (the test is about aborts: a burst whose asks all resolved would prove nothing of them)
      expect(abortsSeen, `${paper.name} aborts observed`).toBeGreaterThan(0)
    })
  }
})
