// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type Closure, closureOf, type NeedEntry, needBound, needsOf, rowLeadOf, SHARED_SEP } from '@/pdf-reader/engine/layer-proto/need.mjs'

// needsOf (what laying a paper's pages reads of its units' rows, in order) and closureOf (Need(p), what laying page p alone
// reads: the 1b-D design §1.2) live in a leaf the door and the cutter both import. These tests hold them to restatements written
// from their documentation, on random K, and hold run.mjs to using them

function rng(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32 } }

type Entry = NeedEntry & { rects: unknown; reach: Set<number> }
function randomK(seed: number): { K: Entry[]; N: number } {
  const r = rng(seed), N = 1 + Math.floor(r() * 12), K: Entry[] = []
  for (let i = 0, n = Math.floor(r() * 30); i < n; i++) {
    const fileOnly = r() < 0.25
    const lists: number[][] = []
    for (let l = 0, m = r() < 0.1 ? 0 : 1 + (r() < 0.2 ? 1 : 0); l < m; l++) {
      const first = 1 + Math.floor(r() * N), span = r() < 0.7 ? 0 : Math.floor(r() * 3)
      lists.push(Array.from({ length: Math.min(span, N - first) + 1 }, (_, k) => first + k))
    }
    const reach = new Set(lists.flat())
    if (r() < 0.3) reach.add(1 + Math.floor(r() * N))
    const reads = r() < 0.15 ? [1 + Math.floor(r() * N)] : []
    const group = r() < 0.2 ? `g${Math.floor(r() * 3)}` : null
    // (an entry whose first row continues an earlier one's last on a shared line: its id, ids 100 apart from the indices)
    const follows = i > 0 && r() < 0.2 ? 100 + Math.floor(r() * i) : null
    K.push({ lists, reach, rects: fileOnly ? null : [], reads, group, id: 100 + i, follows })
  }
  return { K, N }
}

/** lay[g], from the documentation: the units that may be on a page up to g (and so every one before them in the stream), and the units only the file holds on the pages the lines of those read */
function layOf(K: Entry[], N: number, fileOnly: (c: Entry) => boolean): number[] {
  const fileOn = new Map<number, number>()
  K.forEach((c, i) => { if (fileOnly(c) && c.lists.length) for (const x of c.reach) fileOn.set(x, i) })
  const lay: number[] = []
  for (let g = 0; g <= N; g++) {
    let v = -1
    K.forEach((c, i) => {
      if (!c.lists.length) return
      if (Math.min(...c.lists.flat()) <= g) v = Math.max(v, i)
      if (Math.min(...c.lists.map(l => Math.max(...l))) <= g) for (const x of c.reach) v = Math.max(v, fileOn.get(x) ?? -1)
    })
    lay.push(v)
  }
  return lay
}

/** Need(p) restated from the design's §1.2, by brute force over K (no index): what closureOf must give */
function needOf(K: Entry[], N: number, p: number): Closure {
  const idx = K.map((_, i) => i)
  const lists = (i: number) => K[i]!.lists
  const U = (q: number) => idx.filter(i => lists(i).some(l => l.includes(q)))
  const Ur = (g: number) => idx.filter(i => K[i]!.reach.has(g))
  const passOf = (q: number) => new Set([q, ...U(q).flatMap(i => lists(i).map(l => l[0]!))])
  const pass = passOf(p)
  const lay = new Set([...pass].flatMap(U))
  // (and the entry each one follows on a shared line, to a fixpoint)
  for (let grew = true; grew;) {
    grew = false
    for (const i of [...lay]) { const j = K.findIndex(c => c.id !== undefined && c.id === K[i]!.follows); if (j >= 0 && !lay.has(j)) { lay.add(j); grew = true } }
  }
  const draw = new Set([1, p])
  for (const i of lay) for (const q of [...K[i]!.reach, ...(K[i]!.reads ?? [])]) if (q >= 1 && q <= N) draw.add(q)
  const G = new Set([...lay].flatMap(i => [...K[i]!.reach]))
  const peers = new Set([...lay, ...[...G].flatMap(Ur)])
  const R = new Set([...peers].flatMap(i => [...K[i]!.reach]))
  const rows = new Set(peers)
  for (const i of idx) if (!K[i]!.rects && [...K[i]!.reach].some(q => R.has(q))) rows.add(i)
  for (const i of [...rows]) { const g = K[i]!.group; if (g != null) for (const j of idx) if (K[j]!.group === g) rows.add(j) }
  // (the batch race: a unit of the closure's pages that runs on from page 1 to x, every unit first framed by x before it)
  for (const i of peers) for (const l of lists(i)) if (l[0] === 1 && l.length > 1) {
    const x = l[1]!
    let last = -1
    idx.forEach(j => { if (lists(j).length && Math.min(...lists(j).flat()) <= x) last = j })
    for (let j = 0; j <= last; j++) rows.add(j)
  }
  let bound = Math.max(...draw)
  for (const q of R) if (q <= N) bound = Math.max(bound, q)
  const ready = [...draw].filter(q => [...passOf(q)].every(f => pass.has(f)))
  const up = (s: Iterable<number>) => [...s].sort((a, b) => a - b)
  return { pass: up(pass), lay: up(lay), draw: up(draw), rows: up(rows), ready: up(ready), bound }
}

const sub = (a: readonly number[], b: readonly number[]) => a.every(x => b.includes(x))

describe('needsOf', () => {
  it('gives lay as the documentation reads, on 300 random papers', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { K, N } = randomK(seed)
      for (const passes of [false, true]) {
        const got = needsOf(K, N, passes, c => !c.rects)
        expect(got.lay, `seed ${seed}`).toEqual(layOf(K, N, c => !c.rects))
        expect(got.lay.length).toBe(N + 1)
        for (let g = 1; g <= N; g++) expect(got.lay[g]).toBeGreaterThanOrEqual(got.lay[g - 1] as number)
        for (let p = 0; p <= N; p++) {
          expect(got.complete[p]).toBeGreaterThanOrEqual(got.done[p] as number)
          expect(got.complete[p]).toBeGreaterThanOrEqual(got.lay[p] as number)
          // (the latest page p may be done after: p itself at least, a page of the paper at most)
          expect(got.bound[p]).toBeGreaterThanOrEqual(p)
          expect(got.bound[p]).toBeLessThanOrEqual(Math.max(N, p))
        }
      }
    }
  })

  it('needs nothing of a paper with no unit', () => {
    expect(needsOf([], 3, true, () => false)).toEqual({ lay: [-1, -1, -1, -1], done: [-1, -1, -1, -1], complete: [-1, -1, -1, -1], bound: [0, 1, 2, 3] })
  })

  it('is the one run.mjs uses: imported from need.mjs, defined nowhere else', () => {
    const run = readFileSync('src/pdf-reader/engine/layer-proto/run.mjs', 'utf8')
    expect(run).toMatch(/import \{ [^}]*\bclosureOf\b[^}]*\} from '\.\/need\.mjs'/)
    expect(run).not.toMatch(/function (needsOf|closureOf)/)
    // (laid in order, over K, or under parts K and the entry standing for the parts not told yet: the door design §0.3)
    expect(run).toMatch(/partsEnded \|\| through >= N \? K : \[\.\.\.K, \{ lists: \[\[through \+ 1\]\], reach: \[through \+ 1\], rects: true \}\]/)
    expect(run).toMatch(/closureOf\(KS, N, p, \{ orderFree: false, passes: PASSES \}\)/)
  })
})

describe('closureOf: Need(p), the 1b-D design §1.2', () => {
  /** the format test's paper as run.mjs's K holds it (helpers/format-paper.ts): its units in the stream's order, each with the
   *  pages its two sources draw it on (the left's rectangles, the layout file's lines), its placeholders' pages, its table group */
  const FORMAT: Entry[] = [
    { lists: [[1], [1]], reach: new Set([1]), rects: [], reads: [], group: null },
    // (unit 2: a paragraph from page 1 on to page 2, its formula on page 1)
    { lists: [[1, 2], [1, 2]], reach: new Set([1, 2]), rects: [], reads: [1], group: null },
    { lists: [[2], [2]], reach: new Set([2]), rects: [], reads: [], group: '0:h' },
    { lists: [[3]], reach: new Set([3]), rects: [], reads: [], group: '0:c0+2' },
    // (unit 5: a cell only the layout file holds)
    { lists: [[3]], reach: new Set([3]), rects: null, reads: [], group: '0:c0' },
    { lists: [[4]], reach: new Set([4]), rects: [], reads: [], group: null },
    { lists: [[4]], reach: new Set([4]), rects: [], reads: [], group: null },
  ]

  it("gives the format test's paper its closures: page 2 laid with page 1, pages 3 and 4 each alone after page 1", () => {
    const of = (p: number) => closureOf(FORMAT, 4, p)
    expect([1, 2, 3, 4].map(p => of(p).draw)).toEqual([[1, 2], [1, 2], [1, 3], [1, 4]])
    expect([1, 2, 3, 4].map(p => of(p).ready)).toEqual([[1], [1, 2], [3], [4]])
    expect([1, 2, 3, 4].map(p => of(p).pass)).toEqual([[1], [1, 2], [3], [4]])
    expect([1, 2, 3, 4].map(p => of(p).bound)).toEqual([2, 2, 3, 4])
    // (page 1's units laid, page 2's cell only decided: it ranks against the paragraph that runs on to page 2; and every unit
    // framed by page 2, the paragraph's batch race)
    expect(of(1).lay).toEqual([0, 1])
    expect(of(1).rows).toEqual([0, 1, 2])
    expect(of(3)).toEqual({ pass: [3], lay: [3, 4], draw: [1, 3], rows: [3, 4], ready: [3], bound: 3 })
    expect([...needBound(FORMAT, 4)]).toEqual([0, 2, 2, 3, 4])
  })

  it('is Need(p) as the design defines it, on 300 random papers', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { K, N } = randomK(seed)
      for (let p = 1; p <= N; p++) expect(closureOf(K, N, p), `seed ${seed}, page ${p}`).toEqual(needOf(K, N, p))
    }
  })

  it('holds its own properties: 1 drawn first, pass in draw, lay in rows, a ready page\'s closure inside, needBound alike', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { K, N } = randomK(seed)
      const B = needBound(K, N)
      expect(B.length).toBe(N + 1)
      expect(B[0]).toBe(0)
      for (let p = 1; p <= N; p++) {
        const C = closureOf(K, N, p), as = `seed ${seed}, page ${p}`
        expect(C.draw[0], as).toBe(1)
        expect(C.draw, as).toEqual([...C.draw].sort((a, b) => a - b))
        expect(sub(C.pass, C.draw), as).toBe(true)
        expect(sub(C.lay, C.rows), as).toBe(true)
        expect(C.ready, as).toContain(p)
        expect(C.bound, as).toBeGreaterThanOrEqual(Math.max(...C.draw))
        expect(C.bound, as).toBeLessThanOrEqual(N)
        expect(B[p], as).toBe(C.bound)
        for (const q of C.ready) {
          const D = closureOf(K, N, q)
          expect(sub(D.pass, C.pass) && sub(D.lay, C.lay) && sub(D.draw, C.draw) && sub(D.rows, C.rows), `${as}: ready ${q}`).toBe(true)
        }
      }
    }
  })

  it('is final over any part of K a cut tells once its bound is covered: K so far gives the whole paper\'s closure', () => {
    // (a cut tells K as a prefix, closed over the table groups, and an entry it has not told touches no page up to `through`:
    // the bundle 4 contract C3b and M18)
    for (let seed = 1; seed <= 300; seed++) {
      const { K, N } = randomK(seed)
      for (let through = 1; through <= N; through++) {
        let F = -1
        K.forEach((c, i) => { if ([...c.reach, ...c.lists.flat()].some(q => q <= through)) F = i })
        for (let again = true; again;) {
          again = false
          for (const g of new Set(K.slice(0, F + 1).map(c => c.group).filter(x => x != null))) K.forEach((c, i) => { if (c.group === g && i > F) { F = i; again = true } })
        }
        const sofar = K.slice(0, F + 1)
        for (let p = 1; p <= through; p++) {
          const C = closureOf(sofar, N, p)
          if (C.bound <= through) expect(C, `seed ${seed}, through ${through}, page ${p}`).toEqual(closureOf(K, N, p))
        }
      }
    }
  })

  it('is the prefix needsOf lays where the rules lay in order (orderFree false), with every page its entries read', () => {
    // (a page-1 unit whose placeholder lies on page 3: its closure draws page 3 and is bound by it, as the order-free one)
    const K1: Entry[] = [{ lists: [[1]], reach: new Set([1]), rects: [], reads: [3], group: null }, { lists: [[2]], reach: new Set([2]), rects: [], reads: [], group: null }]
    expect(closureOf(K1, 3, 1, { orderFree: false })).toMatchObject({ draw: [1, 3], bound: 3, lay: [0] })
    for (let seed = 1; seed <= 200; seed++) {
      const { K, N } = randomK(seed)
      for (const passes of [false, true]) {
        const need = needsOf(K, N, passes, c => !c.rects)
        for (let p = 1; p <= N; p++) {
          const B = need.bound[p]!, upTo = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)
          // (its pages, and every page its entries read: their lines' and their placeholders')
          const rows = upTo(0, need.complete[p]!)
          const draw = [...new Set([...upTo(1, B), ...rows.flatMap(i => [...K[i]!.reach, ...(K[i]!.reads ?? [])]).filter(q => q >= 1 && q <= N)])].sort((a, b) => a - b)
          expect(closureOf(K, N, p, { orderFree: false, passes }), `seed ${seed}, page ${p}`).toEqual({
            pass: upTo(1, B), lay: rows, draw, rows,
            ready: upTo(1, B).filter(q => need.bound[q]! <= B), bound: Math.max(B, ...draw),
          })
        }
      }
    }
  })

  it('reads the layout-only entries by `fileOnly`', () => {
    // (a paragraph of page 2; a unit drawn on page 1 whose other source's lines reach pages 2 and 3, so that it grows on page 2
    // and ranks against the paragraph there; and one only the layout file holds on page 3, which that unit's growth reads as
    // placed: the keepAll hop)
    const K: Entry[] = [
      { lists: [[2]], reach: new Set([2]), rects: [], reads: [], group: null },
      { lists: [[1]], reach: new Set([1, 2, 3]), rects: [], reads: [], group: null },
      { lists: [[3]], reach: new Set([3]), rects: null, reads: [], group: null },
    ]
    expect(closureOf(K, 3, 2)).toEqual({ pass: [2], lay: [0], draw: [1, 2], rows: [0, 1, 2], ready: [2], bound: 3 })
    expect(closureOf(K, 3, 2, { fileOnly: () => false }).rows).toEqual([0, 1])
  })

  it('lays the unit a laid unit follows on a shared line, and the one that one follows, whatever pages they are on', () => {
    // (a run-in head on page 2 (id 10) and its text from page 2 on to page 3 (11), which a page-3 paragraph running on to page 4
    // (12) puts in page 4's pass: page 4 asked alone lays the text, so the head too, its pages drawn and its peers decided; a
    // head before the head on its line (9) as well)
    const K: Entry[] = [
      { id: 9, lists: [[2]], reach: new Set([2]), rects: [], reads: [], group: null },
      { id: 10, lists: [[2]], reach: new Set([2]), rects: [], reads: [], group: null, follows: 9 },
      { id: 11, lists: [[2, 3]], reach: new Set([2, 3]), rects: [], reads: [], group: null, follows: 10 },
      { id: 12, lists: [[3, 4]], reach: new Set([3, 4]), rects: [], reads: [], group: null },
    ]
    expect(closureOf(K, 4, 4)).toMatchObject({ pass: [3, 4], lay: [0, 1, 2, 3], draw: [1, 2, 3, 4] })
    // (without the shared line, page 4 lays the text alone)
    expect(closureOf(K.map(c => ({ ...c, follows: null })), 4, 4)).toMatchObject({ pass: [3, 4], lay: [2, 3], draw: [1, 2, 3, 4] })
  })
})

describe('rowLeadOf: the unit a unit\'s first row continues on one of TeX\'s lines', () => {
  /** a layout file's index over units given as [id, kind, rows ([page, x0, x1, baseline], 10 pt type, a frame each in `column`), held rows] */
  function indexOf(units: [number, string, [number, number, number, number][], number?, number[]?][]) {
    const kinds = ['para', 'heading', 'caption', 'footnote', 'cell', 'abstract', 'theorem', 'figure', 'author']
    const file = {
      units: units.map(([id, kind]) => [id, kinds.indexOf(kind), 9, 0, 1]),
      lines: units.map(([id, , rows]) => [id, rows.flatMap(([pg, x0, x1, b]) => [pg, x0, x1, b, b + 7, b - 2, 10, 0])]),
      frames: units.map(([id, , rows, col = 0]) => [id, rows.flatMap(([pg], j) => [pg, col, j, 1, -1, 0])]),
      held: units.filter(u => u[4]?.length).map(([id, , , , held]) => [id, held]),
    }
    const unit = (id: number) => {
      const u = units.find(x => x[0] === id)
      if (!u) return null
      return { kind: u[1], lines: file.lines.find(l => l[0] === id)![1] as number[], frames: file.frames.find(f => f[0] === id)![1] as number[], held: u[4] ?? [] }
    }
    return { unit, onPage: (page: number) => units.filter(u => u[2].some(r => r[0] === page)).map(u => u[0]) }
  }
  it('finds a run-in head before its text, 10.9 pt apart on one row, and the nearest of two before it', () => {
    const I = indexOf([[27, 'heading', [[3, 307.28, 402.2, 456.27]]], [28, 'para', [[3, 413.1, 525.54, 456.27], [3, 307.28, 525.55, 442.72]]]])
    expect(rowLeadOf(I, 28)).toEqual({ id: 27, page: 3, baseline: 456.27, x0: 307.28, x1: 402.2, size: 10 })
    expect(rowLeadOf(I, 27)).toBe(null)
    // (a paragraph's last row, then a head and its text on it: the head is the text's lead, the paragraph the head's)
    const J = indexOf([[1, 'para', [[1, 20, 280, 250], [1, 20, 100, 238]]], [2, 'heading', [[1, 110, 150, 238]]], [3, 'para', [[1, 160, 280, 238]]]])
    expect([rowLeadOf(J, 2)?.id, rowLeadOf(J, 3)?.id]).toEqual([1, 2])
  })
  it('finds none across columns, past SHARED_SEP em, between table cells or a figure\'s labels, over a held row, or after it in the paper', () => {
    // (two columns whose rows align: a left column's last row and the right column's first)
    expect(rowLeadOf(indexOf([[1, 'para', [[1, 72, 290.27, 400]], 0], [2, 'para', [[1, 307.28, 525.55, 400]], 1]]), 2)).toBe(null)
    expect(rowLeadOf(indexOf([[1, 'heading', [[1, 20, 80, 250]]], [2, 'para', [[1, 80 + SHARED_SEP * 10 + 1, 280, 250]]]]), 2)).toBe(null)
    expect(rowLeadOf(indexOf([[1, 'heading', [[1, 20, 80, 250]]], [2, 'para', [[1, 80 + SHARED_SEP * 10, 280, 250]]]]), 2)?.id).toBe(1)
    expect(rowLeadOf(indexOf([[1, 'cell', [[1, 20, 80, 250]]], [2, 'cell', [[1, 90, 140, 250]]]]), 2)).toBe(null)
    expect(rowLeadOf(indexOf([[1, 'figure', [[1, 20, 80, 250]]], [2, 'para', [[1, 90, 140, 250]]]]), 2)).toBe(null)
    expect(rowLeadOf(indexOf([[1, 'heading', [[1, 20, 80, 250]], 0, [0]], [2, 'para', [[1, 90, 280, 250]]]]), 2)).toBe(null)
    expect(rowLeadOf(indexOf([[1, 'heading', [[1, 20, 80, 250]]], [2, 'para', [[1, 90, 280, 250]], 0, [0]]]), 2)).toBe(null)
    expect(rowLeadOf(indexOf([[2, 'heading', [[1, 20, 80, 250]]], [1, 'para', [[1, 90, 280, 250]]]]), 1)).toBe(null)
    // (another baseline, or a row that ends past the start)
    expect(rowLeadOf(indexOf([[1, 'heading', [[1, 20, 80, 250.02]]], [2, 'para', [[1, 90, 280, 250]]]]), 2)).toBe(null)
    expect(rowLeadOf(indexOf([[1, 'heading', [[1, 20, 95, 250]]], [2, 'para', [[1, 90, 280, 250]]]]), 2)).toBe(null)
  })
  it('chosen among the units before it in the lay order (`before`): the door\'s facade answers as the whole layout, however the parts come', () => {
    // (a head (2) and, nearer the text's (3) start on its row, a unit of a smaller id (1) that comes after the text in K, which a
    // later part tells: the door's facade over the parts told so far holds the head and the text alone)
    const whole = indexOf([[1, 'heading', [[1, 130, 140, 250]]], [2, 'heading', [[1, 20, 125, 250]]], [3, 'para', [[1, 150, 280, 250]]]])
    const told = indexOf([[2, 'heading', [[1, 20, 125, 250]]], [3, 'para', [[1, 150, 280, 250]]]])
    const beforeIt = (id: number) => id === 2
    // (by the ids alone the nearer, 1, which the facade does not hold yet)
    expect([rowLeadOf(whole, 3)?.id, rowLeadOf(told, 3)?.id]).toEqual([1, 2])
    expect(rowLeadOf(whole, 3, beforeIt)).toEqual({ id: 2, page: 1, baseline: 250, x0: 20, x1: 125, size: 10 })
    expect(rowLeadOf(told, 3, beforeIt)).toEqual(rowLeadOf(whole, 3, beforeIt))
    // (and none where nothing before it in K is on the row)
    expect(rowLeadOf(whole, 3, () => false)).toBe(null)
  })
  it('with `before`, the lay order alone: an ink unit, numbered after every source unit, that heads a theorem on its row (2610.40645v1 p15)', () => {
    // (u380, "Theorem 3.3 ([Ang, Theorem 1.1]).", a theorem's head whose note is a citation, left by the wrap to an ink unit; u110
    // the theorem's text on the row from 252.75. Before u110 in K (the stream), after it by id: its text was laid where the
    // English head ended, a blank after the translated head)
    const I = indexOf([[110, 'theorem', [[15, 252.75, 539.58, 317.11], [15, 72, 539.94, 303.56]]], [380, 'para', [[15, 71.56, 247.77, 317.11]]]])
    expect(rowLeadOf(I, 110, id => id === 380)).toEqual({ id: 380, page: 15, baseline: 317.11, x0: 71.56, x1: 247.77, size: 10 })
    // (by the ids alone, with no lay order given, none)
    expect(rowLeadOf(I, 110)).toBe(null)
    // (and never one after it in K, whatever its id)
    expect(rowLeadOf(I, 110, () => false)).toBe(null)
  })
})
