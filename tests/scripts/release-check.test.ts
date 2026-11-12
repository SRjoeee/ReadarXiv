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
import { cachesOf, canvasOf, checksOf, corpusLogOf, type Ctx, diffOf, drawnOf, GATES, type Gate, INVARIANTS, type Stage, type StepRun, STAGES, TARGETS, TIERS, type Tier, typesetOf, vitestOf } from '../../lab/release-check/gates.mjs'
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

  it('runs the 88 papers on the caches RELEASE_CHECK_CACHES names, a run and its twin with the same flags, the baseline\'s dumps read', () => {
    const refactor = mkdtempSync(join(tmpdir(), 'release-check-lab-'))
    dirs.push(refactor)
    writeFileSync(join(refactor, 'flags.txt'), '--caches=/round/r21/compiles:/round/r20/compiles\n--prove\n')
    const ctx: Ctx = { root: '/repo', labData: refactor, refactor, work: '/work', online: false, minFree: 0 }
    process.env.RELEASE_CHECK_CACHES = join(refactor, 'flags.txt')
    try {
      const [prepare, same] = corpus(['prepare', 'prepare-same']).map(g => g.steps!(ctx)[0]!.cmd)
      expect(prepare).toEqual(['bash', 'lab/pdf/prepare-back/corpus.sh', join(refactor, 'lanes/L1-papers88.tsv'), '/work/prepare', '/round/r21/compiles:/round/r20/compiles', '2', '--prove', `--baseline=${join(refactor, 'baseline/prepare')}`])
      expect(same?.slice(4)).toEqual(prepare?.slice(4))
      for (const g of corpus(['prepare', 'prepare-same', 'pixels'])) expect(g.needs!(ctx).map(n => n.path)).toContain(join(refactor, 'flags.txt'))
      // (the baseline's dumps where the run reads them, the round's flags; the pixel proofs' run takes its own)
      expect(corpus(['prepare', 'prepare-same', 'pixels']).map(g => g.needs!(ctx).some(n => n.path === join(refactor, 'baseline/prepare')))).toEqual([true, true, false])
    } finally {
      delete process.env.RELEASE_CHECK_CACHES
    }
    // (without it, the lab's list for these papers)
    expect(corpus(['prepare'])[0]!.needs!(ctx).map(n => n.path)).toContain(join(refactor, 'lanes/L1-caches88.txt'))
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

describe("the typesetter's replays", () => {
  it("replays the figures under today's mark rule, which PDF-READER §19.12 reads the port's figures by, every other replay as it is", () => {
    const ctx: Ctx = { root: '/repo', labData: null, refactor: '/lab', work: '/work', online: false, minFree: 12 }
    expect(GATES.find(g => g.id === 'typeset-replays')!.steps!(ctx).map(s => s.cmd.slice(1))).toEqual([
      ['lab/typeset/replay-fit.mjs'],
      ['lab/typeset/replay-fill.mjs'],
      ['lab/typeset/replay-emit.mjs'],
      ['lab/typeset/replay-names.mjs'],
      ['lab/typeset/replay-figures.mjs', '--marks=today'],
      ['lab/typeset/replay-display.mjs'],
    ])
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
    // (typeset-parts, today's reading, lays no entry: it holds no I10 and asks for none)
    expect(gate('typeset-parts').holds).not.toContain('I10')
    expect(gate('typeset-parts').steps!(ctx)[0]?.cmd).not.toContain('--entry')
    const said = (pieces: number, faults: number, other = 0) =>
      `{"pairs":123,"laid":1,"pages":2}\nI10, the sentence cover (cover.ts): 9 member-pages lit, ${pieces} pieces; ${faults} faults\nI6 across the pages' lays (cross-lay.ts): 90 units begun on a pass page, 9 laid by two pages' lays or more; ${2 + other} laid otherwise: 2 by the head pass (known: headOf reads the paragraph over the unit as one lay filled it and the other did not), ${other} by another cause`
    expect(cover.judge!(ctx, [run(0, said(4767634, 0))])).toMatchObject({ pass: true, numbers: { I10: 0, pieces: 4767634, I6head: 2, I6other: 0 }, findings: { I10: { held: true, count: 0 }, I6: { held: true, count: 0 } } })
    // (a unit laid otherwise by two pages' lays, another cause than the head pass's: the run exits 1 and ends whole, I10 still
    // counted, I6 counted against)
    expect(cover.judge!(ctx, [run(1, said(4767634, 0, 1))])).toMatchObject({ pass: false, findings: { I10: { held: true, count: 0 }, I6: { held: false, count: 1 } } })
    expect(cover.judge!(ctx, [run(0, said(4767634, 5))])).toMatchObject({ pass: false, findings: { I10: { held: false, count: 5 } } })
    // (a paragraph point the row anchors not opened on TeX's line (paras-gate.ts): the run exits 1 and ends whole, I10 and I6
    // still counted, the points' count reported)
    const points = `${said(4767634, 0)}\nthe paragraph points (paras-gate.ts): 8 stated (8 group); 6 with an anchor in their row (6 sentence; 2 no row); of those, their member laid: 4 opened on TeX's line, 2 NOT; not laid: none`
    expect(cover.judge!(ctx, [run(1, points)])).toMatchObject({ pass: true, numbers: { I10: 0, I6other: 0, parasAnchored: 6, parasOff: 2 }, findings: { I10: { held: true, count: 0 } } })
    // (nothing laid: no finding, no pass; a run that did not end whole: its count is not read)
    const none = cover.judge!(ctx, [run(1, said(0, 0))])
    expect(none.pass).toBe(false)
    expect(none.findings).toBeUndefined()
    expect(cover.judge!(ctx, [run(1, said(100, 0))]).findings).toBeUndefined()
    // (the display gate reads the parity's lay of its pairs the same way)
    expect(gate('display').judge!(ctx, [run(0, 'I10, the sentence cover (cover.ts): 599484 pieces; 2 faults: x'), run(0), run(0, 'parity: 9 pages of 1 pairs; 0 worse than today; missing none')]).findings).toEqual({ I10: { held: false, count: 2 } })
  })
  it("reads the display gate's verdict as measure.mjs states it: its pages, the pages worse than today's and each measure's, passing on its exit", () => {
    const text = [
      'parity: 365 pages of 22 pairs; 2 worse than today; missing 2303.11366v4-zh',
      '  weight         0 pages worse (0 differences), 4 nearer; faults: v2 0 pages, today 0',
      '  cross          2 pages worse (5 differences), 1 nearer; faults: v2 3 pages, today 1',
    ].join('\n')
    const ctx = ctxAt('/repo', '/work')
    const judged = gate('display').judge!(ctx, [run(0), run(0), run(1, text)])
    expect(judged).toMatchObject({ pass: false, numbers: { pages: 365, pairs: 22, worse: 2, weight: '0 pages worse, 4 nearer', cross: '2 pages worse, 1 nearer' } })
    expect(gate('display').judge!(ctx, [run(0), run(0), run(0, 'parity: 9 pages of 1 pairs; 0 worse than today; missing none')]).pass).toBe(true)
    // (a run not judged whole fails by measure.mjs's exit; its count is reported)
    const whole = gate('display').judge!(ctx, [run(0), run(0), run(1, 'parity: 8 pages of 1 pairs; 0 worse than today; missing none\nincomplete: 1 (a-zh p3: not drawn)')])
    expect(whole).toMatchObject({ pass: false, numbers: { pages: 8, worse: 0, incomplete: 1 } })
    // (a step that did not run is no pass)
    expect(gate('display').judge!(ctx, [run(0), run(2)]).pass).toBe(false)
  })

  it('keeps the cut-over NO-GO until every cut-over blocker passed in the run, a blocker the run left out named', () => {
    const blocker = gate('display')
    expect(blocker.cutover).toBe(true)
    const other = gate('typecheck')
    expect(cutoverOf(GATES, [other], { typecheck: { status: 'pass' } })).toMatchObject({ verdict: 'NO-GO', why: ['display: not in this run (tier full)', 'perf-release: not in this run (tier release)'] })
    expect(cutoverOf(GATES, [other, blocker], { typecheck: { status: 'pass' }, display: { status: 'fail' } }).verdict).toBe('NO-GO')
    // (performance ≥ today is a blocker too, the release tier's: GO only with both passed)
    const perf = gate('perf-release')
    expect(perf.cutover).toBe(true)
    expect(cutoverOf(GATES, [other, blocker], { typecheck: { status: 'fail' }, display: { status: 'pass' } })).toMatchObject({ verdict: 'NO-GO', why: ['perf-release: not in this run (tier release)'] })
    expect(cutoverOf(GATES, [other, blocker, perf], { typecheck: { status: 'fail' }, display: { status: 'pass' }, 'perf-release': { status: 'pass' } })).toMatchObject({ verdict: 'GO', why: [] })
    expect(markdownOf({ tier: 'full', verdict: 'NO-GO', why: [], cutover: { verdict: 'NO-GO', why: ['display: fail'], blockers: ['display'] }, invariants: [], gates: [], targets: [] })).toContain('**Cut-over: NO-GO.**')
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
    expect(lines.find(t => t.id === 'layout')).toMatchObject({ status: 'not measured', why: 'typeset-parts not in this tier' })
    // (the runner prints p50, p90 and p99: a p95 under 30 ms is told only where the p99 is under it, missed where the p90 is over)
    const lay = (p50: number, p90: number, p99: number) => targetLines({ 'typeset-parts': { status: 'fail', numbers: { layP50: p50, layP90: p90, layP99: p99, layPages: 9 } } }).find(t => t.id === 'layout')?.status
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
