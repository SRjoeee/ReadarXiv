// @vitest-environment node
// `pnpm release-check` (lab/release-check/): the rules that turn the gates' results into the report. A tier runs its own
// gates and every lower tier's, in design §4.9's order; an invariant is GO only where gates of the tier hold it, each passed
// and none counted a breach, and nothing of it is left without a gate; the verdict is GO only when every gate of the tier
// passed (a skipped gate and a private gate with no recorded result stop it), and at the release tier every invariant too.
// And each gate's output is read as the gate itself states it.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cachesOf, canvasOf, checksOf, corpusLogOf, type Ctx, diffOf, drawnOf, GATES, type Gate, harnessLabJudge, INVARIANTS, PARAS_HELD, productionRowsOf, RETIRED, readerPartsJudge, readerPartsRecord, rowsOf, sentenceCoverJudge, type Stage, type StepRun, STAGES, TARGETS, TIERS, type Tier, typesetOf, vitestOf } from '../../lab/release-check/gates.mjs'
import { papersOf } from '../../lab/release-check/papers.mjs'
import { ADDED, ADDED_HEADING } from '../../lab/typeset/added.mjs'
import { isProduction, type Row, rowsAgainst } from '../../lab/typeset/parity/production-rows.mjs'
import { cutoverOf, gatesOf, invariantLine, markdownOf, privateResultOf, targetLines, verdictOf } from '../../lab/release-check/verdict.mjs'

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

  it("makes no gate's command from a file its inputs do not name: a missing one is a skip, never a throw", () => {
    for (const g of GATES.filter(x => x.steps)) {
      const refactor = mkdtempSync(join(tmpdir(), 'release-check-lab-'))
      dirs.push(refactor)
      const ctx: Ctx = { root: '/repo', labData: refactor, refactor, work: join(refactor, 'work'), online: true, minFree: 0 }
      // (every input the gate names under the lab data made, a file where its name has an extension, else a directory)
      for (const n of g.needs?.(ctx) ?? []) {
        if (!n.path.startsWith(`${refactor}/`)) continue
        if (/\.[a-z]+$/.test(n.path)) {
          mkdirSync(join(n.path, '..'), { recursive: true })
          writeFileSync(n.path, '{"id":"p"}\n')
        } else mkdirSync(n.path, { recursive: true })
      }
      expect([g.id, (() => { try { g.steps!(ctx); return null } catch (e) { return String(e) } })()]).toEqual([g.id, null])
    }
  })

  it('runs the fast tier offline: no live gate, no lab data, no private gate', () => {
    for (const g of gatesOf(GATES, 'fast')) {
      expect([g.id, g.network, g.private, g.needs]).toEqual([g.id, undefined, undefined, undefined])
    }
  })

  it('holds every invariant of design §4.9 and the differential, and every target of §7 says where its number comes from', () => {
    expect(INVARIANTS.map(i => i.id)).toEqual(['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I10', 'D'])
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
    // (a gate that counts the invariant is read by its count, though its own verdict failed on something else)
    expect(invariantLine(I1, table, 'full', { r: { status: 'pass' }, b: { status: 'fail', reason: 'diff.mjs exit 1', findings: { I1: { held: true, count: 0 } } } }).status).toBe('GO')
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
      'I10, the sentence cover (cover.ts): 64062 member-pages lit, 4783401 pieces; 491 faults:',
    ].join('\n')
    expect(typesetOf(text)).toMatchObject({ pairs: 123, msPerPage: 8.99, layP50: 7.77, layP90: 20.6, layP99: 32.8, layPages: 3213, I3: 78, I4: 0, I5: 0, I10: 491, I10pieces: 4783401 })
    // (the parity's v2 lay states it so too)
    expect(typesetOf('I10, the sentence cover (cover.ts): 100 pieces; 0 faults').I10).toBe(0)
    // (an entry that laid nothing counted nothing: "0 faults" over 0 pieces is no count)
    expect(typesetOf('I10, the sentence cover (cover.ts): 0 member-pages lit, 0 pieces; 0 faults').I10).toBeUndefined()
    // (I6 across the pages' lays: the head pass's known cause apart from any other)
    expect(
      typesetOf(
        "I6 across the pages' lays (cross-lay.ts): 2272 units begun on a pass page, 272 laid by two pages' lays or more; 3 laid otherwise: 2 by the head pass (known: headOf reads the paragraph over the unit as one lay filled it and the other did not), 1 by another cause",
      ),
    ).toEqual({ I6twice: 272, I6head: 2, I6other: 1 })
  })

  it("reads the corpus runner's log: a refused paper, a missing compile, a failure and the proofs' counts apart", () => {
    const d = mkdtempSync(join(tmpdir(), 'release-check-'))
    dirs.push(d)
    const ok = (id: string, proofs: object) => `${id}\t0\t${JSON.stringify({ id, proofs })}`
    writeFileSync(join(d, 'log.tsv'), [ok('a', { a: 0, c: 0 }), ok('b', { a: 2, c: 0, on: 0, offOutside: { t: 1, f: 0 } }), 'c\t3\tNEEDS_COMPILE', 'd\trefused\t11 GiB free', 'e\t1\tError: x', 'f\t0\tf {"pages":{}}', 'g\t0\tdone'].join('\n'))
    expect(corpusLogOf(join(d, 'log.tsv'))).toEqual({ papers: 7, made: 4, failed: ['e: exit 1: Error: x', 'g: no summary'], refused: ['d (11 GiB free)'], missingCompile: ['c'], proofs: { a: 2, c: 0, on: 0, offOutside: 1 } })
  })

  it("reads a paper's summary whole from its own log where the runner's table cuts it, and its proofs from there", () => {
    const d = mkdtempSync(join(tmpdir(), 'release-check-'))
    dirs.push(d)
    mkdirSync(join(d, 'logs'))
    // (corpus.sh keeps 400 characters of a summary in log.tsv; run.mjs's summary is longer since it states what locate made)
    const whole = JSON.stringify({ id: 'p', refused: null, made: { glyphs: 262, ledger: 'x'.repeat(400) }, proofs: { a: 2, c: 0 } })
    writeFileSync(join(d, 'logs', 'p.log'), `a warning\n${whole}\n`)
    writeFileSync(join(d, 'log.tsv'), [`p\t0\t${whole.slice(0, 400)}`, `q\t0\t${JSON.stringify({ id: 'q', proofs: { a: 0, c: 1 } })}`].join('\n'))
    expect(corpusLogOf(join(d, 'log.tsv'))).toMatchObject({ papers: 2, made: 2, failed: [], proofs: { a: 2, c: 1 } })
  })

  it('reads a proof the prover refused as a failure of that paper, named, never as a count', () => {
    const d = mkdtempSync(join(tmpdir(), 'release-check-'))
    dirs.push(d)
    const refused = JSON.stringify({ id: 'h', proofs: { a: 0, c: 0, offOutside: 'the catalog written is not of the fresh /OCProperties form' } })
    writeFileSync(join(d, 'log.tsv'), [`h\t0\t${refused}`, `i\t0\t${JSON.stringify({ id: 'i', proofs: { a: 0, c: 0, on: 0, offOutside: { t: 0 } } })}`].join('\n'))
    const log = corpusLogOf(join(d, 'log.tsv'))
    expect(log.failed).toEqual(['h: a proof refused: offOutside: the catalog written is not of the fresh /OCProperties form'])
    expect(log.proofs).toEqual({ a: 0, c: 0, on: 0, offOutside: 0 })
  })

  it("holds the canvas's papers to the bound its header names, a paper refused or missing failed by name", () => {
    const line = (o: object) => JSON.stringify({ id: 'p', canvas: 'gpu', pages: 4, splitShows: 1, outsidePages: [], shareMax: 0, maxDelta: 0, ...o })
    const c = canvasOf([line({}), JSON.stringify({ id: 'q', refused: 'no add-on' })].join('\n'), ['p', 'q', 'r'])
    expect(c.over).toEqual(['q: no add-on', 'r: no line (the canvas did not report it)'])
  })

  it("holds the canvas's papers to the bound its header names", () => {
    const line = (o: object) => JSON.stringify({ id: 'p', canvas: 'gpu', pages: 4, splitShows: 1, outsidePages: [], shareMax: 0, maxDelta: 0, ...o })
    expect(canvasOf([line({}), line({ id: 'q', shareMax: 0.0037, maxDelta: 81 }), line({ id: 'r', outsidePages: [[97, 53]] })].join('\n')).over).toEqual(['q: outside [], share 0.0037, Δ 81', 'r: outside [[97,53]], share 0, Δ 0'])
  })
})

describe("the prepare's corpus, as the round's stage 1a runs it", () => {
  const corpus = (ids: string[]) => GATES.filter(g => ids.includes(g.id))

  it('reads a compile cache chain from a corpus run\'s flags.txt or from a list, one line or one a line', () => {
    expect(cachesOf('--caches=/a/compiles:/b/cache\n--prove\n--baseline=/lab/baseline/prepare\n')).toBe('/a/compiles:/b/cache')
    expect(cachesOf('/a/compiles:/b/cache\n')).toBe('/a/compiles:/b/cache')
    expect(cachesOf('# the round chain\n/a/compiles\n\n/b/cache # the second\n')).toBe('/a/compiles:/b/cache')
  })

  it("runs the 88 papers and the added pairs' on the caches RELEASE_CHECK_CACHES names, a run and its twin with the same flags, the baseline's dumps read", () => {
    const refactor = mkdtempSync(join(tmpdir(), 'release-check-lab-'))
    dirs.push(refactor)
    writeFileSync(join(refactor, 'flags.txt'), '--caches=/round/r21/compiles:/round/r20/compiles\n--prove\n')
    const ctx: Ctx = { root: '/repo', labData: refactor, refactor, work: '/work', online: false, minFree: 0 }
    process.env.RELEASE_CHECK_CACHES = join(refactor, 'flags.txt')
    try {
      // (each corpus gate first writes the run's list: the set's papers, then the added pairs' papers, lab/typeset/added.mjs)
      for (const g of corpus(['prepare', 'prepare-same', 'pixels'])) expect(g.steps!(ctx)[0]?.cmd).toEqual(['node', 'lab/release-check/papers.mjs', '/work/papers.tsv', join(refactor, 'lanes/L1-papers88.tsv'), join(refactor, 'baseline/added/papers.tsv')])
      const [prepare, same] = corpus(['prepare', 'prepare-same']).map(g => g.steps!(ctx)[1]!.cmd)
      expect(prepare).toEqual(['bash', 'lab/pdf/prepare-back/corpus.sh', '/work/papers.tsv', '/work/prepare', '/round/r21/compiles:/round/r20/compiles', '2', '--prove', `--baseline=${join(refactor, 'baseline/prepare')}`])
      expect(same?.slice(4)).toEqual(prepare?.slice(4))
      for (const g of corpus(['prepare', 'prepare-same', 'pixels'])) expect(g.needs!(ctx).map(n => n.path)).toEqual(expect.arrayContaining([join(refactor, 'flags.txt'), join(refactor, 'baseline/added/papers.tsv')]))
      // (the baseline's dumps where the run reads them, the round's flags; the pixel proofs' run takes its own)
      expect(corpus(['prepare', 'prepare-same', 'pixels']).map(g => g.needs!(ctx).some(n => n.path === join(refactor, 'baseline/prepare')))).toEqual([true, true, false])
    } finally {
      delete process.env.RELEASE_CHECK_CACHES
    }
    // (without it, the lab's list for these papers)
    expect(corpus(['prepare'])[0]!.needs!(ctx).map(n => n.path)).toContain(join(refactor, 'lanes/L1-caches88.txt'))
  })

  it('writes the lists as one, each paper once in the order first named, and refuses a paper named with two directories', () => {
    expect(papersOf(['a\t/x/a\nb\t/x/b\n', 'c\t/y/c\n\nb\t/x/b\n'])).toBe('a\t/x/a\nb\t/x/b\nc\t/y/c\n')
    expect(() => papersOf(['a\t/x/a\n', 'a\t/y/a\n'])).toThrow(/a is named with two directories/)
  })

  it("reads the twin's comparison by its name, a run cut short no pass", () => {
    const d = mkdtempSync(join(tmpdir(), 'release-check-'))
    dirs.push(d)
    mkdirSync(join(d, 'prepare-2'))
    writeFileSync(join(d, 'prepare-2', 'log.tsv'), `p\t0\t${JSON.stringify({ id: 'p', proofs: { a: 0, c: 0 } })}`)
    const ctx: Ctx = { root: '/repo', labData: d, refactor: d, work: d, online: false, minFree: 0 }
    const same = corpus(['prepare-same'])[0]!
    const step = (as: string | undefined, exit: number, text = ''): StepRun => ({ cmd: ['x'], ...(as ? { as } : {}), exit, ms: 0, log: '', text })
    expect(same.judge!(ctx, [step(undefined, 0), step(undefined, 0), step('same', 0, '{"objects":20,"same":20}')])).toEqual({ pass: true, numbers: { papers: 1, same: '{"objects":20,"same":20}' } })
    expect(same.judge!(ctx, [step(undefined, 0), step(undefined, 0)]).pass).toBe(false)
  })

  it('counts the units drawn only on the papers the baseline holds, beside its own count', () => {
    const d = mkdtempSync(join(tmpdir(), 'release-check-'))
    dirs.push(d)
    for (const sub of ['run', 'baseline']) mkdirSync(join(d, sub))
    const dump = (n: number) => JSON.stringify({ units: Array.from({ length: n }, () => ({ kind: 'para', state: 'drawn' })) })
    writeFileSync(join(d, 'run', 'a.prepare.json'), dump(2))
    writeFileSync(join(d, 'run', 'gained.prepare.json'), dump(5))
    writeFileSync(join(d, 'baseline', 'a.prepare.json'), dump(1))
    expect(drawnOf(join(d, 'run'))).toMatchObject({ papers: 2, source: 7 })
    expect(drawnOf(join(d, 'run'), join(d, 'baseline'))).toMatchObject({ papers: 1, source: 2 })
  })
})

describe('the gates retired', () => {
  it('names each with its date, its reason and the gates that hold its question now, none of them still run', () => {
    expect(RETIRED.map(r => r.id)).toEqual(['typeset-parts', 'typeset-replays'])
    const ids = GATES.map(g => g.id)
    for (const r of RETIRED) {
      expect(ids).not.toContain(r.id)
      expect(r.retired).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(r.why.length).toBeGreaterThan(80)
      for (const by of r.by) expect(ids).toContain(by)
    }
    // (typeset-parts' runner laid only today's ids: reader-parts lays as the entry does; the replays' wider comparison with
    // today's lay is the display gate over every pair)
    expect(RETIRED.find(r => r.id === 'typeset-parts')?.by).toEqual(['reader-parts'])
    expect(RETIRED.find(r => r.id === 'typeset-replays')?.by).toEqual(['display-wide'])
  })

  it('lists them in the report', () => {
    const md = markdownOf({ tier: 'full', verdict: 'GO', why: [], commit: 'abc', dirty: false, started: 's', ended: 'e', machine: 'm', labData: null, work: '/w', gates: [], retired: RETIRED, invariants: [], targets: [] })
    expect(md).toContain('## Gates retired')
    expect(md).toContain('| `typeset-parts` | 2026-11-13 | `reader-parts` |')
  })
})

describe("the typesetter's data", () => {
  it("checks the generated data and today's readings, never the breaker's moved files against today's code, which the rulings edit", () => {
    const ctx: Ctx = { root: '/repo', labData: null, refactor: '/lab', work: '/work', online: false, minFree: 12 }
    const scripts = GATES.find(g => g.id === 'typeset-data')!.steps!(ctx).map(s => s.cmd.findLast(a => /\.(?:m?js|ts)$/.test(a)) ?? s.cmd.join(' '))
    expect(scripts).toEqual(['lab/typeset/faces-data.mjs', 'lab/typeset/rules-data.mjs', 'lab/typeset/derive.mjs', 'lab/typeset/vitest.config.ts'])
  })
})

describe('the speed check', () => {
  const speed = GATES.find(g => g.id === 'speed')!
  const ctx: Ctx = { root: '/repo', labData: null, refactor: '/lab', work: '/work', online: false, minFree: 12 }
  const run = (exit: number, text = ''): StepRun => ({ cmd: ['x'], exit, ms: 0, log: '', text })

  it("runs its zsh driver with zsh, then the analysis over the driver's logs", () => {
    process.env.RELEASE_CHECK_BASE = '/base'
    try {
      const steps = speed.steps!(ctx)
      expect(steps.map(s => s.cmd.slice(0, 2))).toEqual([['zsh', 'lab/pdf/spikes/layer-gate/run-speed.sh'], ['node', 'lab/pdf/spikes/layer-gate/speed.mjs']])
      expect(steps[0]?.env?.SPEED_LOGS).toBe(steps[1]?.cmd[2])
      expect(steps[0]?.cmd.slice(2, 4)).toEqual(['/repo', '/base'])
    } finally {
      delete process.env.RELEASE_CHECK_BASE
    }
  })

  it('measures against the released tree, today\'s engine at 065c1d973, where no base is given', () => {
    const today = process.env.AXT_TODAY
    delete process.env.AXT_TODAY
    try {
      expect(speed.steps!(ctx)[0]?.cmd.slice(2, 4)).toEqual(['/repo', '/refactor-read'])
      expect(speed.needs!(ctx)[0]?.path).toBe('/refactor-read/src/pdf-reader/engine')
    } finally {
      if (today !== undefined) process.env.AXT_TODAY = today
    }
  })

  it("passes on the analysis's verdict alone: FAIL and INCOMPARABLE fail, a measurement with no analysis is no pass", () => {
    expect(speed.judge!(ctx, [run(0), run(0, 'PASS')]).pass).toBe(true)
    expect(speed.judge!(ctx, [run(0), run(1, 'FAIL')])).toMatchObject({ pass: false, note: 'the analysis: FAIL' })
    expect(speed.judge!(ctx, [run(0), run(2, 'INCOMPARABLE')])).toMatchObject({ pass: false, note: 'the analysis: INCOMPARABLE' })
    expect(speed.judge!(ctx, [run(0)]).pass).toBe(false)
  })
})

describe('the equivalence gates, in either shape of their tools', () => {
  const gate = (id: string) => GATES.find(g => g.id === id)!
  const run = (exit: number, text = ''): StepRun => ({ cmd: ['x'], exit, ms: 0, log: '', text })
  const ctxAt = (root: string, work: string): Ctx => ({ root, labData: '/lab', refactor: '/lab/refactor-2026-11', work, online: false, minFree: 12 })

  it("counts the translation equivalence's accepted class as compared, and passes on its exit with no other disagreement", () => {
    const work = mkdtempSync(join(tmpdir(), 'release-check-eq-'))
    dirs.push(work)
    mkdirSync(join(work, 'equivalence'))
    const rows = (outcomes: string[]) => writeFileSync(join(work, 'equivalence', 'equivalence.json'), JSON.stringify(outcomes.map(outcome => ({ outcome }))))
    rows(['agree', 'agree, white space apart', 'accepted', 'accepted', 'wire'])
    expect(gate('translate-equivalence').judge!(ctxAt('/repo', work), [run(0)])).toEqual({ pass: true, numbers: { compared: 4, agree: 2, accepted: 2, disagree: 0, wireDiffers: 1 } })
    // (the tool's own verdict: a class whose count moved fails it though no row disagrees)
    expect(gate('translate-equivalence').judge!(ctxAt('/repo', work), [run(1)]).pass).toBe(false)
    rows(['agree', 'disagree'])
    expect(gate('translate-equivalence').judge!(ctxAt('/repo', work), [run(0)])).toMatchObject({ pass: false, numbers: { compared: 2, disagree: 1 } })
  })

  it('holds I10 by a gate of its own, the runner with the reading from the part, counted only where the entry laid pieces', () => {
    const cover = gate('sentence-cover')
    const ctx = ctxAt('/repo', '/work')
    expect(cover.holds).toEqual(['I10', 'I6'])
    expect(cover.steps!(ctx)[0]?.cmd).toEqual(['node', 'lab/typeset/gate-l1.mjs', '--entry', '--reading=part', '--out=/work/sentence-cover'])
    const said = (pieces: number, faults: number, other = 0) =>
      `{"pairs":123,"laid":1,"pages":2}\nI10, the sentence cover (cover.ts): 9 member-pages lit, ${pieces} pieces; ${faults} faults\nI6 across the pages' lays (cross-lay.ts): 90 units begun on a pass page, 9 laid by two pages' lays or more; ${2 + other} laid otherwise: 2 by the head pass (known: headOf reads the paragraph over the unit as one lay filled it and the other did not), ${other} by another cause`
    expect(cover.judge!(ctx, [run(0, said(4767634, 0))])).toMatchObject({ pass: true, numbers: { I10: 0, pieces: 4767634, I6head: 2, I6other: 0 }, findings: { I10: { held: true, count: 0 }, I6: { held: true, count: 0 } } })
    // (a unit laid otherwise by two pages' lays, another cause than the head pass's: the run exits 1 and ends whole, I10 still
    // counted, I6 counted against)
    expect(cover.judge!(ctx, [run(1, said(4767634, 0, 1))])).toMatchObject({ pass: false, findings: { I10: { held: true, count: 0 }, I6: { held: false, count: 1 } } })
    expect(cover.judge!(ctx, [run(0, said(4767634, 5))])).toMatchObject({ pass: false, findings: { I10: { held: false, count: 5 } } })
    // (a paragraph point the row anchors and the page runs on (paras-gate.ts): the run exits 1 and ends whole, I10 and I6 still
    // counted, the points' counts reported; held, it fails the gate, from the round the engine half lands in: PARAS_HELD)
    const points = `${said(4767634, 0)}\nthe paragraph points (paras-gate.ts): 8 stated (8 group); 6 with an anchor in their row (6 sentence; 2 no row); of those, their member laid: 4 opened (their first word starts a line of the member), 3 of them on TeX's line, 2 NOT (run on); not laid: none`
    expect(PARAS_HELD).toBe(false)
    expect(cover.judge!(ctx, [run(1, points)])).toMatchObject({ pass: true, numbers: { I10: 0, I6other: 0, parasAnchored: 6, parasOpened: 4, parasOnTexLine: 3, parasOff: 2 }, findings: { I10: { held: true, count: 0 } } })
    expect(sentenceCoverJudge([run(1, points)], true).pass).toBe(false)
    expect(sentenceCoverJudge([run(0, points.replace('2 NOT', '0 NOT'))], true).pass).toBe(true)
    // (nothing laid: no finding, no pass; a run that did not end whole: its count is not read)
    const none = cover.judge!(ctx, [run(1, said(0, 0))])
    expect(none.pass).toBe(false)
    expect(none.findings).toBeUndefined()
    expect(cover.judge!(ctx, [run(1, said(100, 0))]).findings).toBeUndefined()
    // (the added pairs walked apart after the set, lab/typeset/added.mjs: the set's numbers read before the heading, theirs after
    // it as `added`; a fault of theirs fails the gate, the set's count unmoved)
    const apart = (faults: number) => `${said(4767634, 0)}\n${ADDED_HEADING} a-zh, b-zh\n${said(5000, faults).replace('"pairs":123', '"pairs":2')}`
    expect(cover.judge!(ctx, [run(0, apart(0))])).toMatchObject({ pass: true, numbers: { I10: 0, pieces: 4767634, pairs: 123, added: { pairs: 2, I10: 0, pieces: 5000, I6other: 0 } } })
    expect(cover.judge!(ctx, [run(0, apart(3))])).toMatchObject({ pass: false, numbers: { I10: 0, added: { I10: 3 } } })
    expect(typesetOf(apart(3))).toMatchObject({ pairs: 123, I10: 0, added: { pairs: 2, I10: 3 } })
    // (a row id read outside a page's wait set: the runner exits 1 for it, as for a paragraph point run on; read whole, it fails
    // the gate, never hidden by the points' exit beside it)
    const reads = (outside: number) => `the reads gate, default (author): 9 pages laid, 90 row ids read; ${outside} read outside the page's wait set, on ${outside} pages\nthe reads gate, every option on (none left): 9 pages laid, 99 row ids read; 0 read outside the page's wait set, on 0 pages`
    expect(typesetOf(reads(3))).toMatchObject({ readsPages: 9, readsOutside: 3 })
    expect(cover.judge!(ctx, [run(1, `${points}\n${reads(0)}`)])).toMatchObject({ pass: true, numbers: { readsOutside: 0, parasOff: 2 } })
    expect(cover.judge!(ctx, [run(1, `${points}\n${reads(3)}`)])).toMatchObject({ pass: false, numbers: { readsOutside: 3, parasOff: 2 }, findings: { I10: { held: true, count: 0 } } })
    expect(cover.judge!(ctx, [run(1, `${apart(0)}\n${reads(2)}`)])).toMatchObject({ pass: false, numbers: { added: { readsOutside: 2 } } })
  })

  it("lays the stored rows' pairs over each rows store as the round's reader gate does, I3, I4 and I5 counted, the runner's own verdicts held", () => {
    const refactor = mkdtempSync(join(tmpdir(), 'release-check-lab-'))
    dirs.push(refactor)
    mkdirSync(join(refactor, 'lanes/cjk-punct/blast'), { recursive: true })
    writeFileSync(join(refactor, 'lanes/cjk-punct/blast/pairs.txt'), 'a-zh b-ja\nc-de\n')
    const ctx: Ctx = { root: '/repo', labData: refactor, refactor, work: '/work', online: false, minFree: 0 }
    const rp = gate('reader-parts')
    expect([rp.tier, rp.holds, rp.after]).toEqual(['full', ['I3', 'I4', 'I5'], ['prepare']])
    const steps = rp.steps!(ctx)
    const pairs = ['a-zh', 'b-ja', 'c-de', ...ADDED]
    expect(steps.map(x => x.as)).toEqual(['door', 'rows', 'google'])
    expect(steps[0]).toMatchObject({ cmd: ['node', 'lab/typeset/gate-l1.mjs', '--entry', '--reading=part', '--out=/work/reader-parts/door', ...pairs], slot: 'run', env: { AXT_L1_BUNDLES: '/work/prepare/bundles', AXT_GATE_ENTRY: '1' }, all: true })
    expect(steps[1]?.cmd).toEqual(['node', '--experimental-strip-types', join(refactor, 'lanes/converge-7/tools-b15/google-rows.mts'), '/repo', '/work/reader-parts/google-rows', join(refactor, 'google-rows/ef6989debed1'), ...pairs])
    expect(steps[2]).toMatchObject({ cmd: ['node', '--import', join(refactor, 'lanes/converge-7/tools-b15/rows-register.mjs'), 'lab/typeset/gate-l1.mjs', '--entry', '--reading=part', '--out=/work/reader-parts/google', ...pairs], env: { AXT_B14_ROWS: '/work/reader-parts/google-rows' } })
    // (the judge: both stores read whole, their counts as findings, the rows made with none unavailable)
    const said = (I3: number, I5: number) =>
      [
        `invariants over the laid members (page by page): {"laid":23966,"lines":60866,"I3":${I3},"I4":0,"I5":${I5}}; I3: x; I4: ; I5: y`,
        "the entry (layPage over each part and its rows): 24056 of the runner's members laid alike, 244 not: x | y; a page, ms: p50 4.1, p90 9.9, p99 21.5, max 80 over 2568 pages",
        'I10, the sentence cover (cover.ts): 47028 member-pages lit, 3145597 pieces; 0 faults',
        "I6 across the pages' lays (cross-lay.ts): 26254 units begun on a pass page, 9770 laid by two pages' lays or more; 11 laid otherwise: 11 by the head pass (known: headOf reads the paragraph over the unit as one lay filled it and the other did not), 0 by another cause",
        "the reads gate, default (author): 2568 pages laid, 45463 row ids read; 0 read outside the page's wait set, on 0 pages",
      ].join('\n')
    const named = (as: string, exit: number, text: string): StepRun => ({ cmd: ['x'], as, exit, ms: 0, log: '', text })
    const total = 'total over 92 pairs: units 32833, google 32247, microsoft 569, ok self 17'
    expect(rowsOf(total)).toEqual({ pairs: 92, units: 32833, google: 32247, microsoft: 569, okSelf: 17 })
    const ok = readerPartsJudge([named('door', 0, said(3, 2)), named('rows', 0, total), named('google', 0, said(3, 2))])
    expect(ok).toMatchObject({ pass: true, numbers: { door: { alike: 24056, not: 244, I3: 3, I4: 0, I5: 2, I10: 0 }, google: { I3: 3 }, rows: { units: 32833 }, layP50: 4.1, layP90: 9.9, layP99: 21.5, layPages: 2568 }, findings: { I3: { held: false, count: '3 (door), 3 (google)' }, I4: { held: true, count: 0 }, I5: { held: false } } })
    // (a seeded fault: no reply stored for units the chain asks, so the rows are not the round's; a run that did not end whole)
    expect(readerPartsJudge([named('door', 0, said(0, 0)), named('rows', 0, `${total}, refused unavailable 4`), named('google', 0, said(0, 0))])).toMatchObject({ pass: false, note: expect.stringMatching(/no reply to 4 units/) })
    expect(readerPartsJudge([named('door', 0, said(0, 0)), named('rows', 0, total), named('google', 1, 'the entry laid nothing: I10 not counted')]).pass).toBe(false)
    expect(readerPartsJudge([named('door', 0, said(0, 0)), named('rows', 2, '')]).pass).toBe(false)
    // (held to the last integrated round's counts: a count above them fails the gate (a seeded overlap: 3 -> 13), one below is said)
    const record = { commit: 'abc', counts: { door: { I3: 3, I4: 0, I5: 2 }, google: { I3: 3, I4: 0, I5: 2 } } }
    const stores = (I3: number, I5: number) => [named('door', 0, said(I3, I5)), named('rows', 0, total), named('google', 0, said(3, 2))]
    expect(readerPartsJudge(stores(3, 2), false, record)).toMatchObject({ pass: true })
    expect(readerPartsJudge(stores(13, 2), false, record)).toMatchObject({ pass: false, note: 'above the last round\'s (abc): I3 3 -> 13 (door)' })
    expect(readerPartsJudge(stores(1, 2), false, record)).toMatchObject({ pass: true, note: 'below the last round\'s (abc), the record to lower: I3 3 -> 1 (door)' })
    // (the committed record names every part the gate counts)
    expect(Object.keys(readerPartsRecord(join(import.meta.dirname, '../..')).counts)).toEqual(['door', 'door, added', 'google', 'google, added'])
    // (the page's layout, design §7, is the entry's on the door's rows)
    expect(TARGETS.find(t => t.id === 'layout')?.from).toBe('reader-parts')
  })
  it("holds the added pairs' paragraph points as the set's, the two lanes' changes to the judge joined", () => {
    const said = (pieces: number, faults: number, other = 0) =>
      `{"pairs":123,"laid":1,"pages":2}\nI10, the sentence cover (cover.ts): 9 member-pages lit, ${pieces} pieces; ${faults} faults\nI6 across the pages' lays (cross-lay.ts): 90 units begun on a pass page, 9 laid by two pages' lays or more; ${2 + other} laid otherwise: 2 by the head pass (known: headOf reads the paragraph over the unit as one lay filled it and the other did not), ${other} by another cause`
    const points = (off: number) =>
      `the paragraph points (paras-gate.ts): 5 stated (5 group); 5 with an anchor in their row (5 sentence; 0 no row); of those, their member laid: 5 opened (their first word starts a line of the member), ${5 - off} of them on TeX's line, ${off} NOT (run on); not laid: none`
    // (the set clean; the added pairs walked apart after the heading, their points `off` run on, their I6 `other`)
    const added = (off: number, other = 0) => `${said(4767634, 0)}\n${points(0)}\n${ADDED_HEADING} a-zh, b-zh\n${said(5000, 0, other).replace('"pairs":123', '"pairs":2')}\n${points(off)}`
    // (1) the added pairs' points run on, not held: the run exits 1 and is whole, it passes, the numbers carry their points
    expect(PARAS_HELD).toBe(false)
    expect(sentenceCoverJudge([run(1, added(5))])).toMatchObject({ pass: true, numbers: { I10: 0, I6other: 0, parasOff: 0, added: { pairs: 2, I10: 0, I6other: 0, parasAnchored: 5, parasOpened: 5, parasOnTexLine: 0, parasOff: 5 } } })
    // (2) the same, held: it fails; with none of theirs run on it passes
    expect(sentenceCoverJudge([run(1, added(5))], true).pass).toBe(false)
    expect(sentenceCoverJudge([run(0, added(0))], true).pass).toBe(true)
    // (3) the set clean and the added pairs with a unit laid otherwise by another cause than the head pass's: it fails, the
    // added pairs held as the set's inside the one function
    expect(sentenceCoverJudge([run(1, added(0, 1))])).toMatchObject({ pass: false, numbers: { I6other: 0, added: { I6other: 1 } } })
  })
  it("reads the display gate's verdict as measure.mjs states it: its pages, the pages worse than today's and each measure's, in both modes, today's rows production's", () => {
    const ctx = ctxAt('/repo', '/work')
    const display = gate('display')
    // (today's rows checked production's, then the 22 and the added pairs, under the default options and with every switch on;
    // each verdict's step runs whatever it found, so that the added pairs are judged though the set's pages are worse)
    const planned = display.steps!(ctx)
    expect(planned.map(x => x.as)).toEqual(['rows', 'rows-added', 'v2', 'render', 'measure', 'v2-added', 'render-added', 'measure-added', 'v2-on', 'render-on', 'measure-on', 'v2-added-on', 'render-added-on', 'measure-added-on'])
    expect(planned.filter(x => x.all).map(x => x.as)).toEqual(['rows', 'rows-added', 'measure', 'measure-added', 'measure-on', 'measure-added-on'])
    const set = planned.find(x => x.as === 'v2')!.cmd.slice(3)
    expect(set).toHaveLength(22)
    expect(planned[0]?.cmd).toEqual(['node', 'lab/typeset/parity/production-rows.mjs', ...set])
    expect(planned[1]?.cmd).toEqual(['node', 'lab/typeset/added.mjs', '--', 'node', 'lab/typeset/parity/production-rows.mjs', ...ADDED])
    expect(planned.find(x => x.as === 'v2-on')?.cmd).toEqual(['node', 'lab/typeset/parity/v2.mjs', '--out=/work/display-on/v2', '--toggles=on', ...set])
    expect(planned.find(x => x.as === 'render-on')?.cmd).toContain('--toggles=on')
    const step = (as: string, exit = 0, text = ''): StepRun => ({ cmd: ['x'], as, exit, ms: 0, log: '', text })
    const rowsOk = (n: number) => `production's rows: ${n} of ${n} pairs; 900 of 900 stored rows given back by production's own path`
    const parity = (pages: number, pairs: number, worse: number) => `parity: ${pages} pages of ${pairs} pairs; ${worse} worse than today; missing none`
    const run = ({ worse = 0, addedWorse = 0, onWorse = 0, rows = rowsOk(2) } = {}) => [
      step('rows', 0, rowsOk(22)),
      step('rows-added', rows === rowsOk(2) ? 0 : 1, rows),
      step('v2', 0, 'I10, the sentence cover (cover.ts): 599484 pieces; 0 faults'),
      step('render'),
      step('measure', worse ? 1 : 0, parity(344, 22, worse)),
      step('v2-added'),
      step('render-added'),
      step('measure-added', addedWorse ? 1 : 0, parity(27, 2, addedWorse)),
      step('v2-on', 0, 'I10, the sentence cover (cover.ts): 653653 pieces; 2 faults: x'),
      step('render-on'),
      step('measure-on', onWorse ? 1 : 0, parity(344, 22, onWorse)),
      step('v2-added-on'),
      step('render-added-on'),
      step('measure-added-on', 0, parity(27, 2, 0)),
    ]
    expect(display.judge!(ctx, run())).toMatchObject({ pass: true, numbers: { pages: 344, worse: 0, added: { pages: 27, worse: 0 }, on: { pages: 344, worse: 0, I10: 2, added: { pages: 27 } }, today: { rows: { pairs: 22, of: 22 }, 'rows-added': { pairs: 2 } } }, findings: { I10: { held: false, count: 2 } } })
    expect(display.judge!(ctx, run({ worse: 2 }))).toMatchObject({ pass: false, numbers: { worse: 2, added: { worse: 0 } } })
    expect(display.judge!(ctx, run({ addedWorse: 1 }))).toMatchObject({ pass: false, numbers: { worse: 0, added: { worse: 1 } } })
    expect(display.judge!(ctx, run({ onWorse: 5 }))).toMatchObject({ pass: false, numbers: { worse: 0, on: { worse: 5 } } })
    // (a seeded fault: today's rows of an added pair made without production's own row path; the parity is still measured beside)
    const replica = "2111.09276v1-zh: NOT production's: 470 stored rows, 463 given back; moved whole -> kept 7 (92, 122); differ 0; missing 0; extra 0; held 0\nproduction's rows: 0 of 1 pairs; 463 of 470 stored rows given back by production's own path"
    expect(productionRowsOf(replica)).toEqual({ pairs: 0, of: 1, rows: 463, stored: 470, not: ['2111.09276v1-zh: 470 stored rows, 463 given back; moved whole -> kept 7 (92, 122); differ 0; missing 0; extra 0; held 0'] })
    expect(display.judge!(ctx, run({ rows: replica }))).toMatchObject({ pass: false, numbers: { pages: 344, worse: 0 }, note: expect.stringMatching(/^today's side is not production's: 2111\.09276v1-zh/) })
    // (a step that did not run, a run cut short: no pass)
    expect(display.judge!(ctx, run().slice(0, 8)).pass).toBe(false)
    const whole = run()
    whole[4] = step('measure', 1, `${parity(343, 22, 0)}\nincomplete: 1 (a-zh p3: not drawn)`)
    expect(display.judge!(ctx, whole)).toMatchObject({ pass: false, numbers: { pages: 343, worse: 0, incomplete: 1 } })
  })

  it('asks the display question of every pair of the stored rows at the release tier, a cut-over blocker', () => {
    const refactor = mkdtempSync(join(tmpdir(), 'release-check-lab-'))
    dirs.push(refactor)
    mkdirSync(join(refactor, 'lanes/cjk-punct/blast'), { recursive: true })
    writeFileSync(join(refactor, 'lanes/cjk-punct/blast/pairs.txt'), 'a-zh b-ja\n')
    const ctx: Ctx = { root: '/repo', labData: refactor, refactor, work: '/work', online: false, minFree: 0 }
    const wide = gate('display-wide')
    expect([wide.tier, wide.cutover, wide.holds]).toEqual(['release', true, ['I3', 'I10']])
    const planned = wide.steps!(ctx)
    expect(planned.map(x => [x.as, x.cmd.slice(1).join(' ')])).toEqual([
      ['rows', 'lab/typeset/parity/production-rows.mjs a-zh b-ja'],
      ['v2', 'lab/typeset/parity/v2.mjs --out=/work/display-wide/v2 a-zh b-ja'],
      ['render', 'lab/typeset/parity/render.mjs --work=/work/display-wide --out=/work/display-wide/sheet a-zh b-ja'],
      ['measure', 'lab/typeset/parity/measure.mjs --work=/work/display-wide --out=/work/display-wide/sheet a-zh b-ja'],
    ])
    const step = (as: string, exit = 0, text = ''): StepRun => ({ cmd: ['x'], as, exit, ms: 0, log: '', text })
    expect(wide.judge!(ctx, [step('rows', 0, "production's rows: 2 of 2 pairs; 9 of 9 stored rows"), step('v2'), step('render'), step('measure', 1, 'parity: 2300 pages of 90 pairs; 7 worse than today; missing none')])).toMatchObject({ pass: false, numbers: { pages: 2300, pairs: 90, worse: 7 } })
    expect(wide.judge!(ctx, [step('rows', 0, "production's rows: 2 of 2 pairs; 9 of 9 stored rows"), step('v2'), step('render'), step('measure', 0, 'parity: 2300 pages of 90 pairs; 0 worse than today; missing none')]).pass).toBe(true)
  })

  it('keeps the cut-over NO-GO until every cut-over blocker passed in the run, a blocker the run left out named', () => {
    const blocker = gate('display')
    expect(blocker.cutover).toBe(true)
    const other = gate('typecheck')
    expect(cutoverOf(GATES, [other], { typecheck: { status: 'pass' } })).toMatchObject({ verdict: 'NO-GO', why: ['display: not in this run (tier full)', 'display-wide: not in this run (tier release)', 'perf-release: not in this run (tier release)'] })
    expect(cutoverOf(GATES, [other, blocker], { typecheck: { status: 'pass' }, display: { status: 'fail' } }).verdict).toBe('NO-GO')
    // (performance ≥ today and the display question over every pair are blockers too, the release tier's: GO only with all passed)
    const perf = gate('perf-release')
    const wide = gate('display-wide')
    expect([perf.cutover, wide.cutover]).toEqual([true, true])
    expect(cutoverOf(GATES, [other, blocker], { typecheck: { status: 'fail' }, display: { status: 'pass' } })).toMatchObject({ verdict: 'NO-GO', why: ['display-wide: not in this run (tier release)', 'perf-release: not in this run (tier release)'] })
    expect(cutoverOf(GATES, [other, blocker, wide, perf], { typecheck: { status: 'fail' }, display: { status: 'pass' }, 'display-wide': { status: 'pass' }, 'perf-release': { status: 'pass' } })).toMatchObject({ verdict: 'GO', why: [] })
    expect(markdownOf({ tier: 'full', verdict: 'NO-GO', why: [], cutover: { verdict: 'NO-GO', why: ['display: fail'], blockers: ['display'] }, invariants: [], gates: [], targets: [] })).toContain('**Cut-over: NO-GO.**')
  })
})

describe("today's rows, the way back and the head's own builds", () => {
  const gate = (id: string) => GATES.find(g => g.id === id)!
  const ctx: Ctx = { root: '/repo', labData: '/lab', refactor: '/lab/refactor-2026-11', work: '/work', online: false, minFree: 12 }
  const run = (exit: number, text = '', as?: string): StepRun => ({ cmd: ['x'], ...(as ? { as } : {}), exit, ms: 0, log: '', text })

  it("holds a pair's stored rows production's where production's own row path gives every one back, a kept row by its state", () => {
    const whole = (id: number, t: string): Row => [id, [t], 'whole', 'microsoft']
    const kept = (id: number, by: string | null, was: string): Row => [id, [], 'kept', by, null, was]
    // (production's: its kept rows read back with no translation, so their translator and state are not compared)
    const ok = rowsAgainst([whole(1, 'a'), kept(2, 'microsoft', 'whole')], [whole(1, 'a'), kept(2, null, 'none')])
    expect([ok.same, isProduction(ok)]).toEqual([2, true])
    // (a replica's: each unit's own row, no table decision; production's path keeps a column of names)
    const replica = rowsAgainst([whole(1, 'a'), whole(2, 'Oracle')], [whole(1, 'a'), kept(2, 'microsoft', 'whole')])
    expect(replica).toMatchObject({ same: 1, moved: [{ id: 2, from: 'whole', to: 'kept' }] })
    expect(isProduction(replica)).toBe(false)
    // (a row it would not make, one it makes that is not stored, one it holds back, one it writes otherwise)
    expect(rowsAgainst([whole(1, 'a'), whole(3, 'c')], [whole(1, 'b'), whole(4, 'd')], [3])).toMatchObject({ same: 0, differ: [1], held: [3], extra: [4] })
    expect(rowsAgainst([whole(5, 'e')], [])).toMatchObject({ missing: [5] })
  })

  it("builds today's reader apart and runs today's own checks on it, never the rebuilt reader's in their place", () => {
    expect(gate('build-today').steps!(ctx)[0]).toMatchObject({ cmd: ['bash', 'lab/release-check/today-build.sh', '/repo', '/work/today-reader'], slot: 'test' })
    for (const script of ['e2e:reader', 'e2e:registration']) {
      const g = gate(`${script}-today`)
      expect([g.tier, g.after]).toEqual(['full', ['build-today']])
      expect(g.steps!(ctx)[0]).toMatchObject({ cmd: ['pnpm', script], slot: 'e2e', env: { AXT_EXT_DIR: '/work/today-reader/.output/chrome-mv3' } })
    }
    const work = mkdtempSync(join(tmpdir(), 'release-check-today-'))
    dirs.push(work)
    const today = gate('e2e:reader-today')
    const at = { ...ctx, work }
    mkdirSync(join(work, 'today-reader/.output/chrome-mv3'), { recursive: true })
    expect(today.judge!(at, [run(0, '159/159 passed (30 controls), 5 note(s)')])).toEqual({ pass: true, numbers: { passed: 159, checks: 159 } })
    // (a seeded fault: the build the gate reads is the rebuilt reader's, whose 81 checks would pass in today's place)
    mkdirSync(join(work, 'today-reader/.output/chrome-mv3/pdfjs'))
    expect(today.judge!(at, [run(0, '81/81 passed')])).toMatchObject({ pass: false, note: expect.stringMatching(/carries the rebuilt reader/) })
    // (the fast tier's two scripts run the rebuilt reader's checks on the default build, and say so)
    expect(gate('e2e:reader').title).toMatch(/rebuilt reader/)
    expect(gate('e2e:registration').title).toMatch(/rebuilt reader/)
  })

  it('builds the reader the performance gates measure from this commit, in the website tree PERF_WEB names, and never measures without it', () => {
    const prior = process.env.PERF_WEB
    process.env.PERF_WEB = '/web'
    try {
      for (const id of ['perf-batch', 'perf-release']) {
        const steps = gate(id).steps!(ctx)
        const build = `/work/${id}-build`
        expect(steps[0]).toMatchObject({ cmd: ['bash', '/lab/refactor-2026-11/perf/tools/build-new.sh', 'HEAD', 'HEAD'], env: { PERF_BUILD: build, PERF_WEB_REPO: '/web', PERF_ENGINE_REPO: '/repo' }, fresh: build, as: 'build' })
        expect(steps.at(-1)?.env?.PERF_BUILD).toBe(build)
      }
    } finally {
      if (prior === undefined) delete process.env.PERF_WEB
      else process.env.PERF_WEB = prior
    }
    delete process.env.PERF_WEB
    expect(gate('perf-batch').needs!(ctx).find(n => /PERF_WEB/.test(n.what))?.path).toBe('')
    // (a build that failed is no measurement: the gate fails and says so)
    expect(gate('perf-batch').judge!(ctx, [run(1, 'ERR_PNPM_OUTDATED_LOCKFILE', 'build')])).toMatchObject({ pass: false, note: expect.stringMatching(/could not be built/) })
  })

  it("opens the harness's corpus papers from this run's bundles and this run's rows of them, never one without the other", () => {
    const h = gate('harness-lab')
    expect(h.after).toEqual(['prepare', 'reader-parts'])
    expect(h.steps!(ctx)[0]?.env).toMatchObject({ AXT_L1_BUNDLES: '/work/prepare/bundles', AXT_LAB_ROWS: '/work/reader-parts/google-rows', AXT_LAB_FIXTURES: '1512.03385v1,1706.03762v7,2609.26457v1,2307.16209v1,2610.20030v1' })
    // (the rows harness-lab lays are the ones reader-parts' rows step writes, /work/reader-parts/google-rows: the reader gate's
    // case above; without them it does not run)
    expect(h.needs!(ctx).some(n => n.path === '/work/reader-parts/google-rows')).toBe(true)
  })

  it("judges harness-lab by its checks, fails a paper laid from lane L1's and one the run's rows do not hold, and rows that do not belong, each with its own words", () => {
    const run = (exit: number, text: string) => ({ exit, text, cmd: [], ms: 0, waited: 0, log: '' })
    const ours = "fixture 1512.03385v1: this run's bundle and its rows (/b, /r/1512.03385v1-zh.json: chain x, 10 units asked, 10 rows)\n"
    const l1 = "fixture 2609.26457v1: lane L1's bundle and today's dump (no run given)\n"
    expect(harnessLabJudge(run(0, `${ours}121 of 121 checks passed\n`))).toEqual({ pass: true, numbers: { passed: 121, checks: 121, run: ['1512.03385v1'], l1: [] } })
    // (the gate gives the harness this run's rows: a paper on another run's data in their place fails it, named; it passed with a
    // note before, the coordinator's ruling withdrawn on 2026-11-14)
    expect(harnessLabJudge(run(0, `${ours}${l1}121 of 121 checks passed\n`))).toMatchObject({ pass: false, numbers: { l1: ['2609.26457v1'] }, note: expect.stringMatching(/lane L1's bundle .*not from this run's rows: 2609\.26457v1/) })
    // (one paper missing from the rows: the harness refuses before any check, naming the paper and the file it expected)
    const missing = 'FAIL fixtures: no rows of this run for 2609.26457v1: expected /r/2609.26457v1-zh.json\n'
    expect(harnessLabJudge(run(1, `${ours}${missing}`))).toMatchObject({ pass: false, note: 'no rows of this run for 2609.26457v1: expected /r/2609.26457v1-zh.json' })
    const refused = 'FAIL fixtures: 2609.26457v1: rows do not belong to these bundles: 25 of 321 units without a row (rows /r, bundles /b)\n'
    expect(harnessLabJudge(run(1, refused))).toMatchObject({ pass: false, note: expect.stringMatching(/^2609\.26457v1: rows do not belong to these bundles: 25 of 321 units without a row/) })
  })
})

describe("the private repository's results", () => {
  it('counts a recorded result only for the release candidate: one of another commit is stale, naming both', () => {
    const entry = (commit?: string) => ({ command: 'pnpm ci:local', result: { status: 'pass', commit, date: '2026-11-07' } })
    expect(privateResultOf(entry('2ef51f96c'), '2ef51f96c24bd013832814767b8cfdd4dc27c0fe')).toMatchObject({ status: 'pass' })
    expect(privateResultOf(entry('13216ac44'), '2ef51f96c24bd013832814767b8cfdd4dc27c0fe')).toMatchObject({ status: 'stale', reason: 'recorded at 13216ac44; the release candidate is 2ef51f96c24bd013832814767b8cfdd4dc27c0fe' })
    expect(privateResultOf(entry(undefined), '2ef51f96c')).toMatchObject({ status: 'stale', reason: 'recorded at no commit; the release candidate is 2ef51f96c' })
    expect(privateResultOf({ command: 'x' }, '2ef51f96c')).toMatchObject({ status: 'private' })
    expect(verdictOf('release', [{ id: 'p', tier: 'release', stage: 'box', holds: [] }], { p: privateResultOf(entry('13216ac44'), 'abc1234') }, []).verdict).toBe('NO-GO')
  })
})

describe('the report', () => {
  it('gives each target of §7 its value where a gate of the run measured it, met or missed, else why not', () => {
    const lines = targetLines({ 'prepare-diff': { status: 'pass', numbers: { source: 27271, ink: 2700, figures: 8000, lost: 0, accepted: 3, gained: 356 } }, 'perf-batch': { status: 'pass', numbers: { m: { commitP50: [25, 24, 'equal'] } } } })
    expect(lines.find(t => t.id === 'units')).toMatchObject({ status: 'met' })
    expect(lines.find(t => t.id === 'commit')).toMatchObject({ status: 'missed' })
    expect(lines.find(t => t.id === 'reuse')).toMatchObject({ status: 'not measured', why: expect.stringMatching(/no gate/) })
    expect(lines.find(t => t.id === 'layout')).toMatchObject({ status: 'not measured', why: 'reader-parts not in this tier' })
    // (the runner prints p50, p90 and p99: a p95 under 30 ms is told only where the p99 is under it, missed where the p90 is over)
    const lay = (p50: number, p90: number, p99: number) => targetLines({ 'reader-parts': { status: 'fail', numbers: { layP50: p50, layP90: p90, layP99: p99, layPages: 9 } } }).find(t => t.id === 'layout')?.status
    expect([lay(7.6, 20.7, 33.5), lay(7.6, 20.7, 29), lay(7.6, 31, 40), lay(11, 20, 25)]).toEqual(['reported', 'met', 'missed', 'missed'])
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

  it('says, at the release tier, that an invariant no gate holds keeps the verdict NO-GO on purpose', () => {
    const invariants = [{ id: 'I7', says: 'the same boxes', status: 'NO-GO', gates: [], why: ['no gate holds it: none'] }]
    const v = verdictOf('release', [], {}, invariants)
    expect(v).toEqual({ verdict: 'NO-GO', why: ['I7: NO-GO (no gate holds it yet: an invariant without a gate is NO-GO until one exists)'] })
    const md = markdownOf({ tier: 'release', verdict: v.verdict, why: v.why, commit: 'abc', dirty: false, started: 's', ended: 'e', machine: 'm', labData: null, work: '/w', gates: [], invariants, targets: [] })
    expect(md).toContain('An invariant no gate holds (I7) keeps the release verdict NO-GO on purpose')
  })
})
