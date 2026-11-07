// @vitest-environment node
// `pnpm release-check` (lab/release-check/): the rules that turn the gates' results into the report. A tier runs its own
// gates and every lower tier's, in design §4.9's order; an invariant is GO only where gates of the tier hold it, each passed
// and none counted a breach, and nothing of it is left without a gate; the verdict is GO only when every gate of the tier
// passed (a skipped gate and a private gate with no recorded result stop it), and at the release tier every invariant too.
// And each gate's output is read as the gate itself states it.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { canvasOf, checksOf, corpusLogOf, diffOf, GATES, type Gate, INVARIANTS, type Stage, sameSum, STAGES, TARGETS, TIERS, type Tier, typesetOf, vitestOf } from '../../lab/release-check/gates.mjs'
import { gatesOf, invariantLine, markdownOf, targetLines, verdictOf } from '../../lab/release-check/verdict.mjs'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('the gate table', () => {
  it('names each gate once, in a tier and a stage of design §4.9, holding only invariants it names', () => {
    const ids = GATES.map(g => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    const invariants = INVARIANTS.map(i => i.id)
    for (const g of GATES) {
      expect(TIERS).toContain(g.tier)
      expect(STAGES).toContain(g.stage)
      for (const h of g.holds) expect(invariants).toContain(h)
      // a gate of the private repository is named, never run: it has no steps; every other gate has them
      expect([g.id, Boolean(g.private)]).toEqual([g.id, !g.steps])
      for (const a of g.after ?? []) expect(ids.indexOf(a)).toBeLessThan(ids.indexOf(g.id))
    }
  })

  it('runs the fast tier offline: no live gate, no lab data, no private gate', () => {
    for (const g of gatesOf(GATES, 'fast')) {
      expect([g.id, g.network, g.private, g.needs]).toEqual([g.id, undefined, undefined, undefined])
    }
  })

  it('holds every invariant of design §4.9 and the differential, and every target of §7 says where its number comes from', () => {
    expect(INVARIANTS.map(i => i.id)).toEqual(['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'D'])
    for (const t of TARGETS) expect([t.id, Boolean(t.from || t.why)]).toEqual([t.id, true])
    for (const t of TARGETS) if (t.from) expect(GATES.map(g => g.id)).toContain(t.from)
  })
})

describe('a tier', () => {
  const gate = (id: string, tier: Tier, stage: Stage, holds: string[] = []): Gate => ({ id, title: id, tier, stage, holds, steps: () => [] })
  const table = [gate('c', 'release', 'corpus', ['I2']), gate('b', 'full', 'pipeline', ['I1']), gate('a', 'fast', 'unit'), gate('r', 'fast', 'reader', ['I1'])]

  it("runs its own gates and every lower tier's, in design §4.9's order", () => {
    expect(gatesOf(table, 'fast').map(g => g.id)).toEqual(['a', 'r'])
    expect(gatesOf(table, 'full').map(g => g.id)).toEqual(['a', 'b', 'r'])
    expect(gatesOf(table, 'release').map(g => g.id)).toEqual(['a', 'b', 'r', 'c'])
    expect(() => gatesOf(table, 'nightly')).toThrow(/no tier nightly/)
  })

  it('reads an invariant as GO only where every gate of the tier holding it passed, counted no breach and leaves no gap', () => {
    const I1 = { id: 'I1', says: '', gap: null }
    expect(invariantLine(I1, table, 'full', { r: { status: 'pass' }, b: { status: 'pass' } }).status).toBe('GO')
    // (held here and by a higher tier's gate too: GO is said only of the whole)
    expect(invariantLine(I1, table.slice(1), 'fast', { r: { status: 'pass' } })).toMatchObject({ status: 'GO in part', why: ['the rest in tier full (b)'] })
    expect(invariantLine(I1, table, 'full', { r: { status: 'pass' }, b: { status: 'skipped', reason: 'needs the tap' } })).toMatchObject({ status: 'NO-GO', why: ['b: skipped (needs the tap)'] })
    expect(invariantLine(I1, table, 'fast', { r: { status: 'pass', findings: { I1: { held: false, count: 3 } } } })).toMatchObject({ status: 'NO-GO', why: ['r counts 3 against it'] })
    expect(invariantLine({ ...I1, gap: 'the corpus' }, table, 'fast', { r: { status: 'pass' } })).toMatchObject({ status: 'NO-GO', why: ['no gate for the rest: the corpus'] })
  })

  it('says an invariant only a higher tier holds is beyond the tier, and one no gate holds is NO-GO', () => {
    expect(invariantLine({ id: 'I2', says: '', gap: null }, table, 'fast', {})).toMatchObject({ status: 'beyond this tier', why: ['held in tier release (c)'] })
    expect(invariantLine({ id: 'I7', says: '', gap: 'no gate' }, table, 'release', {})).toMatchObject({ status: 'NO-GO', why: ['no gate holds it: no gate'] })
  })

  it('gives GO only when every gate of the tier passed, and at the release tier every invariant too', () => {
    const gates = gatesOf(table, 'full')
    expect(verdictOf('full', gates, { a: { status: 'pass' }, b: { status: 'pass' }, r: { status: 'pass' } }, [])).toEqual({ verdict: 'GO', why: [] })
    expect(verdictOf('full', gates, { a: { status: 'pass' }, b: { status: 'skipped', reason: 'needs the tap' }, r: { status: 'pass' } }, []).why).toEqual(['b: skipped (needs the tap)'])
    expect(verdictOf('full', gates, { a: { status: 'pass' }, b: { status: 'private' }, r: { status: 'pass' } }, []).verdict).toBe('NO-GO')
    expect(verdictOf('full', gates, { a: { status: 'pass' }, r: { status: 'pass' } }, []).why).toEqual(['b: not run'])
    const all = Object.fromEntries(table.map(g => [g.id, { status: 'pass' }]))
    expect(verdictOf('release', table, all, [{ id: 'I7', status: 'NO-GO' }])).toEqual({ verdict: 'NO-GO', why: ['I7: NO-GO'] })
  })
})

describe("a gate's output, read as the gate states it", () => {
  it('reads the checks of the harness and of the e2e scripts, and vitest\'s summary', () => {
    expect(checksOf('ok   a\n49 of 49 checks passed')).toEqual({ passed: 49, checks: 49 })
    expect(checksOf('\n157/158 passed (30 controls), 5 note(s)')).toEqual({ passed: 157, checks: 158 })
    expect(vitestOf(' Test Files  566 passed | 7 skipped (573)\n      Tests  9074 passed | 56 skipped (9130)')).toEqual({ tests: 9074, failed: 0, skipped: 56, files: 566 })
    expect(vitestOf('\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[31m2 failed\x1b[39m\x1b[22m\x1b[2m | \x1b[22m\x1b[1m\x1b[32m10 passed\x1b[39m')).toMatchObject({ tests: 10, failed: 2 })
  })

  it("reads the differential's summary and the typeset runners' invariant counts and page times", () => {
    expect(diffOf('prepare: 87 of 87 files; units 44180; shown 37793 -> 38146; lost 0 (+3 accepted), gained 356, changed 9398')).toEqual({ files: 87, of: 87, units: 44180, shownBefore: 37793, shown: 38146, lost: 0, accepted: 3, gained: 356, changed: 9398 })
    const text = [
      '{"pairs":123,"prepared":32589,"laid":32035,"pages":3014,"twoPages":1336,"twoPagesDiffer":0,"ms":27100,"msPerPage":8.99}',
      "a page's lay (layPagePrepared, L8-E1), ms: p50 7.77, p90 20.6, p99 32.8, max 90 over 3213 pages; the adapter (L6) 10 ms in all",
      'invariants over the laid members (page by page): {"laid":33371,"lines":9,"I3":78,"I4":0,"I5":0}; I3: x',
    ].join('\n')
    expect(typesetOf(text)).toMatchObject({ pairs: 123, msPerPage: 8.99, layP50: 7.77, layP90: 20.6, layP99: 32.8, layPages: 3213, I3: 78, I4: 0, I5: 0 })
  })

  it("reads the corpus runner's log: a refused paper, a missing compile, a failure and the proofs' counts apart", () => {
    const d = mkdtempSync(join(tmpdir(), 'release-check-'))
    dirs.push(d)
    const ok = (id: string, proofs: object) => `${id}\t0\t${JSON.stringify({ id, proofs })}`
    writeFileSync(join(d, 'log.tsv'), [ok('a', { a: 0, c: 0 }), ok('b', { a: 2, c: 0, on: 0, offOutside: { t: 1, f: 0 } }), 'c\t3\tNEEDS_COMPILE', 'd\trefused\t11 GiB free', 'e\t1\tError: x', 'f\t0\tf {"pages":{}}', 'g\t0\tdone'].join('\n'))
    expect(corpusLogOf(join(d, 'log.tsv'))).toEqual({ papers: 7, made: 4, failed: ['e: exit 1: Error: x', 'g: no summary'], refused: ['d (11 GiB free)'], missingCompile: ['c'], proofs: { a: 2, c: 0, on: 0, offOutside: 1 } })
  })

  it("holds the canvas's papers to the bound its header names, and the marks' sum to the owner's record but for its compiles", () => {
    const line = (o: object) => JSON.stringify({ id: 'p', canvas: 'gpu', pages: 4, splitShows: 1, outsidePages: [], shareMax: 0, maxDelta: 0, ...o })
    expect(canvasOf([line({}), line({ id: 'q', shareMax: 0.0037, maxDelta: 81 }), line({ id: 'r', outsidePages: [[97, 53]] })].join('\n')).over).toEqual(['q: outside [], share 0.0037, Δ 81', 'r: outside [[97,53]], share 0, Δ 0'])
    const sum = (ms: number, same: number) => `${JSON.stringify({ papers: 87, glyphs: { compared: 9, same }, compiles: { made: 8, read: 80, ms } })}\n   12  1 p  glyph: a class`
    expect(sameSum(sum(1, 7), sum(177262, 7))).toBe(true)
    expect(sameSum(sum(1, 6), sum(177262, 7))).toBe(false)
  })
})

describe('the report', () => {
  it('gives each target of §7 its value where a gate of the run measured it, met or missed, else why not', () => {
    const lines = targetLines({ 'prepare-diff': { status: 'pass', numbers: { source: 27271, ink: 2700, figures: 8000, lost: 0, accepted: 3, gained: 356 } }, harness: { status: 'pass', numbers: { commitP50: 25, commitPages: 8 } } })
    expect(lines.find(t => t.id === 'units')).toMatchObject({ status: 'met' })
    expect(lines.find(t => t.id === 'commit')).toMatchObject({ status: 'missed' })
    expect(lines.find(t => t.id === 'reuse')).toMatchObject({ status: 'not measured', why: expect.stringMatching(/no gate/) })
    expect(lines.find(t => t.id === 'layout')).toMatchObject({ status: 'not measured', why: 'typeset-parts not in this tier' })
  })

  it('writes the verdict, every gate with its result and every invariant with its reasons', () => {
    const md = markdownOf({
      tier: 'fast', verdict: 'NO-GO', why: ['build: fail (pnpm build … exit 1)'], commit: 'abc', dirty: false, started: 's', ended: 'e', machine: 'm', labData: null, work: '/w',
      gates: [{ id: 'build', title: 'the build', stage: 'unit', holds: [], status: 'fail', reason: 'exit 1', ms: 61000, numbers: {} }, { id: 'private-box', title: 'the box', stage: 'box', holds: ['I9'], status: 'private', command: 'pnpm test:box-security' }],
      invariants: [{ id: 'I9', says: 'the box refuses', status: 'NO-GO', gates: [], why: ['private-box: private'] }],
      targets: [],
    })
    expect(md).toContain('# release-check: tier fast, NO-GO')
    expect(md).toContain('- build: fail (pnpm build … exit 1)')
    expect(md).toContain("the private repository's: `pnpm test:box-security`; not run here")
    expect(md).toContain('| **I9** the box refuses | NO-GO |  | private-box: private |')
  })
})
