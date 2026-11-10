// @vitest-environment node
// The parity's fresh rows (lab/typeset/parity/fresh.mjs, lane parity-fresh): where no stored row of the pair's serves v2's unit,
// or the stored row answered another unit than v2's, v2 is laid with the row a reader gets, the translate package's chain over
// Microsoft's keyless adapter, through a cache keyed by the chain's own key; a served member keeps its stored row; with no
// fresh rows the rows are the entry's own. The cache answers offline: a wire it lacks is named, never fetched, outside the
// fill. Synthetic units and replies; a temporary folder for the cache.
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { type FetchInit, microsoft } from '@readarxiv/translate'
import { scriptedFetch } from '@readarxiv/translate/testing'
// @ts-expect-error — a plain node module of the lab
import { cachedTranslator, freshNeeds, freshRowsOf, withFresh } from '../../lab/typeset/parity/fresh.mjs'
// @ts-expect-error — a plain node module of the lab
import { FRESH_SAYS, freshOf, measurePage, NAME_CODE_RULING, tagFresh } from '../../lab/typeset/parity/verdict.mjs'

type Row = { id: string; ok: boolean; by?: string; content?: unknown[] }
const unit = (id: string, s: string, kind = 'para') => ({ id, kind, content: [{ t: 'text', s }] })
const member = (ord: number, text: string | null, o: object = {}) => ({ ord, kind: 'para', text, lines: [], ...o })
const stored = (id: string): Row => ({ id, ok: true, by: 'today', content: [{ t: 'text', s: `stored ${id}` }] })
/** the entry's rows as gate-l1.ts makes them: the door's rows by unit id, the kept units, the ids said from another unit */
const entry = (rows: Row[], o: { kept?: string[]; said?: string[] } = {}) => ({
  get: (k: string) => rows.find((r) => r.id === k),
  done: true,
  kept: (k: string) => (o.kept ?? []).includes(k),
  said: (k: string) => (o.said ?? []).includes(k),
})

describe('which members are laid with a fresh row', () => {
  const units = new Map(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => [id, unit(id, `text ${id}`)]))
  const members = [
    member(1, 'a'),
    member(2, 'b'),
    member(3, 'c'),
    member(4, 'd', { why: 'pitch' }),
    member(5, 'e'),
    member(6, 'f'),
    member(7, null, { kind: 'name' }),
  ]
  const rows = entry([stored('a'), stored('c')], { kept: ['e'], said: ['c'] })
  const needs = freshNeeds(members, rows, units, { decided: (m: { ord: number }) => m.ord === 6 })
  it('a member no stored row serves gets one', () => {
    expect(needs.get(2)).toEqual({ id: 'b', cause: 'no-row' })
  })
  it("a member whose stored row answered another unit than v2's gets one", () => {
    expect(needs.get(3)).toEqual({ id: 'c', cause: 'unit' })
  })
  it("a cell today's group decision kept, whose reply the stored rows do not hold, gets one: v2's own decision runs on it", () => {
    expect(needs.get(6)).toEqual({ id: 'f', cause: 'group' })
  })
  it("a text today never sent (its name/code rule) gets one, named so", () => {
    const n = freshNeeds([member(2, 'b')], rows, units, { todayKept: () => true })
    expect(n.get(2)).toEqual({ id: 'b', cause: 'today-kept' })
  })
  it('a served member, one the prepare gives a reason for, one the paper keeps, a name: none', () => {
    expect([...needs.keys()].sort()).toEqual([2, 3, 6])
  })
})

describe('the rows the lay is given', () => {
  const rows = entry([stored('a'), stored('c')])
  it('with no fresh rows, the entry\'s rows themselves (the sheet as before)', () => {
    expect(withFresh(rows, null)).toBe(rows)
  })
  it('a fresh translation answers its id; a fresh row that is none, and every other id, as the entry\'s', () => {
    const fresh = new Map<string, Row>([
      ['b', { id: 'b', ok: true, by: 'microsoft:x', content: [{ t: 'text', s: 'fresh b' }] }],
      ['c', { id: 'c', ok: true, by: 'microsoft:x', content: [{ t: 'text', s: 'fresh c' }] }],
      ['d', { id: 'd', ok: false }],
    ])
    const r = withFresh(rows, fresh)
    expect(r.get('b').content).toEqual([{ t: 'text', s: 'fresh b' }])
    expect(r.get('c').content).toEqual([{ t: 'text', s: 'fresh c' }])
    expect(r.get('a')).toBe(rows.get('a'))
    expect(r.get('d')).toBeUndefined()
    expect(r.kept('a')).toBe(false)
  })
})

describe("the fresh rows: the chain over Microsoft's adapter, cached by the chain's key", () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  const upper = (_url: string, init: FetchInit) => ({
    status: 200,
    body: JSON.stringify((JSON.parse(init.body) as string[]).map((text) => ({ translations: [{ text: text.toUpperCase() }] }))),
  })
  it('the fill asks each wire once and records it; a later run reads it offline and asks nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'parity-fresh-'))
    dirs.push(dir)
    const units = [unit('u1', 'one'), unit('u2', 'two')]
    const f = scriptedFetch(upper)
    const filled = await freshRowsOf(units, 'zh', { dir, translator: cachedTranslator(microsoft({ fetch: f.fetch }), { dir, fill: true }) })
    expect(f.requests.length).toBe(1)
    expect(filled.asked).toBe(2)
    expect(filled.rows.get('u1')).toMatchObject({ ok: true, content: [{ t: 'text', s: 'ONE' }] })
    expect(readdirSync(dir).length).toBeGreaterThan(0)
    const g = scriptedFetch(upper)
    const again = await freshRowsOf(units, 'zh', { dir, translator: cachedTranslator(microsoft({ fetch: g.fetch }), { dir }) })
    expect(g.requests.length).toBe(0)
    expect(again.rows.get('u2')).toEqual(filled.rows.get('u2'))
    expect(again.missing).toEqual([])
  })
  it('a run not told to fill names the units whose wire the cache lacks, and asks the network nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'parity-fresh-'))
    dirs.push(dir)
    const g = scriptedFetch(upper)
    const got = await freshRowsOf([unit('u3', 'three')], 'zh', { dir, translator: cachedTranslator(microsoft({ fetch: g.fetch }), { dir }) })
    expect(g.requests.length).toBe(0)
    expect(got.missing).toEqual(['u3'])
    expect(got.rows.get('u3')).toMatchObject({ ok: false, why: { kind: 'unavailable' } })
  })
  it('a reply the chain refuses is recorded and refused again offline, never asked twice', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'parity-fresh-'))
    dirs.push(dir)
    // (an element's marker lost in the reply: the chain's acceptance refuses it, then its runs floor asks the text's stretches)
    const u = { id: 'u4', kind: 'para', content: [{ t: 'text', s: 'see ' }, { t: 'el', id: '1', kind: 'math' }, { t: 'text', s: ' here' }] }
    const lost = (_url: string, init: FetchInit) => ({
      status: 200,
      body: JSON.stringify((JSON.parse(init.body) as string[]).map(() => ({ translations: [{ text: 'nothing' }] }))),
    })
    const f = scriptedFetch(lost)
    const first = await freshRowsOf([u], 'zh', { dir, translator: cachedTranslator(microsoft({ fetch: f.fetch }), { dir, fill: true }) })
    const g = scriptedFetch(lost)
    const second = await freshRowsOf([u], 'zh', { dir, translator: cachedTranslator(microsoft({ fetch: g.fetch }), { dir }) })
    expect(g.requests.length).toBe(0)
    expect(second.rows.get('u4')).toEqual(first.rows.get('u4'))
    expect(second.missing).toEqual([])
  })
})

describe("a unit laid with a fresh row on the sheet: what follows from its text's length reads `fresh`, the rest judged", () => {
  // (a paragraph t7 of two lines on A (part ord 11), set in a regular face: today draws it in two lines at the original's place;
  // v2, with another translation, in four lines, its first line 5 pt low, a word space stretched past 1 em, in bold)
  const N = 3
  const factLine = (y: number) => [N, 0, 72, 300, y, y + 8, y - 2, 48, 300, 0, 10]
  const drawn = (y: number, word = 0.3, bold = 0) => ({ y, x0: 72, x1: 300, size: 10, n: 30, bold, italic: 0, word, letter: 0, text: 'x'.repeat(30) })
  const page = (fresh?: number[]) =>
    measurePage(
      'p-zh',
      {
        pages: { [N]: { members: [{ ord: 11, state: 'laid', lines: [] }], links: [] } },
        facts: { [N]: { members: [{ ord: 11, kind: 'para', align: 'j', style: { size: 10 }, lines: [factLine(400), factLine(388)] }], links: 0 } },
        today: { 11: { today: 7 } },
        ...(fresh ? { fresh } : {}),
      },
      {
        page: N,
        original: { links: 0 },
        today: { units: [{ id: 7, lines: [drawn(400), drawn(388)] }], figures: [], names: [], crops: [], links: 0, linksDrawn: 0, lit: [], litBoxes: {} },
        v2: { committed: true, units: [{ id: 11, lines: [drawn(395, 1.4, 30), drawn(383, 0.3, 30), drawn(371), drawn(359)] }], crops: [], links: 0, linksDrawn: 0, lit: [] },
        px: {},
      },
      { prepByOrd: new Map(), todayOf: new Map([[11, 7]]), turned: new Set(), led: new Map(), top: new Set() },
    )
  const of = (p: { diffs: { flag: string; worse: boolean; nearer: string }[] }) =>
    Object.fromEntries(p.diffs.map((d) => [d.flag, [d.worse, d.nearer]]))
  it('served by its stored row: the line count, the spacing, the first line and the style are judged', () => {
    const p = page()
    expect(of(p)).toMatchObject({ 'line-count': [true, 'today'], stretch: [true, 'today'], anchor: [true, 'today'], style: [true, 'today'] })
    tagFresh(p, { fresh: [] }, new Map([[11, 7]]))
    expect(p.diffs.some((d: { fresh?: boolean }) => d.fresh)).toBe(false)
  })
  it("laid with a fresh row: the line count and the spacing read `fresh` (never worse); the first line's place and the style judged, each tagged", () => {
    const p = page([11])
    expect(of(p)).toMatchObject({ 'line-count': [false, 'fresh'], stretch: [false, 'fresh'], anchor: [true, 'today'], style: [true, 'today'] })
    tagFresh(p, { fresh: [11] }, new Map([[11, 7]]))
    for (const d of p.diffs) {
      expect(d.fresh).toBe(true)
      expect(d.what).toContain(FRESH_SAYS)
    }
  })
  it("a table's group holding a cell laid with a fresh row is tagged by its cells; one holding none is not", () => {
    const g = (cells: string[]) => ({ flag: 'groups', unit: 'group g1', what: 'w', cells, worse: true, nearer: 'today' })
    const p = { diffs: [g(['t7', 't9']), g(['t3', 't4'])] }
    tagFresh(p, { fresh: [11] }, new Map([[11, 7]]))
    expect(p.diffs.map((d: { fresh?: boolean }) => !!d.fresh)).toEqual([true, false])
  })
  it("a text today kept by its name/code test and v2 sends: a difference of its words is the owner's ruling, its geometry judged", () => {
    const d = (flag: string, unit: string) => ({ flag, unit, what: 'w', worse: true, nearer: 'today' })
    const p = { diffs: [d('style', 'p40 figure'), d('cross', 'p40 figure'), d('style', 'p41 figure')], worse: 3 }
    tagFresh(p, { fresh: [40, 41], freshCause: { 40: 'today-kept', 41: 'no-row' } }, new Map())
    const said = (flag: string, unit: string) =>
      p.diffs.filter((x: { flag: string; unit: string }) => x.flag === flag && x.unit === unit).map((x: { worse: boolean; nearer: string; ruling?: string }) => [x.worse, x.nearer, x.ruling ?? null])
    expect(said('style', 'p40 figure')).toEqual([[false, 'ruling', NAME_CODE_RULING]])
    expect(said('cross', 'p40 figure')).toEqual([[true, 'today', null]])
    expect(said('style', 'p41 figure')).toEqual([[true, 'today', null]])
    expect(p.worse).toBe(2)
  })
  it('the run lists every page with its fresh units by cause, and the units v2 sends that today never had, drawn or not', () => {
    const v2 = { fresh: [11, 12, 30], freshCause: { 11: 'no-row', 12: 'unit', 30: 'no-row' }, freshNew: [30, 31], today: { 11: { today: 7 }, 12: { today: 8 } }, pages: { 3: { members: [{ ord: 11 }, { ord: 12 }] }, 4: { members: [{ ord: 30 }, { ord: 31 }] } }, facts: { 3: { members: [{ ord: 11, kind: 'para' }, { ord: 12, kind: 'figure' }] }, 4: { members: [{ ord: 30, kind: 'figure' }] } } }
    expect(freshOf('p-zh', v2)).toEqual({
      units: 3,
      kinds: { para: 1, figure: 2 },
      causes: { 'no-row': 2, unit: 1 },
      pages: [
        { pair: 'p-zh', page: 3, units: ['t7', 't8'], ords: [11, 12], causes: { 'no-row': 1, unit: 1 } },
        { pair: 'p-zh', page: 4, units: ['p30'], ords: [30], causes: { 'no-row': 1 } },
      ],
      never: [
        { pair: 'p-zh', page: 4, unit: 'p30', drawn: true },
        { pair: 'p-zh', page: 4, unit: 'p31', drawn: false },
      ],
    })
  })
})
