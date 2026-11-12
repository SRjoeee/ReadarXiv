// @vitest-environment node
// The rule ledger's classifier, report and remap (lab/rules/ledger.mjs, report.mjs, record.mjs remapOf: design-reduction
// §3c, amendment 8.9), and the census's reading of the ledger (census.mjs, DEFINITIONS.rules). The classifier on a site
// map and a recording written here, one rule a case: a site that decides, one that folds beside it, a test of our own
// taking the other side, a test that reads the lab's data (the corpus), never run, a magnitude, a value with a source, a
// citation of each kind, the list rules. Then the census on a tree written here, with and without a ledger.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scanTree } from '../../lab/release-check/census-lib.mjs'
import { ENGINE_PROFILE } from '../../lab/release-check/census-profile.mjs'
import { census } from '../../lab/release-check/census.mjs'
import { citationsOf, type Ledger, ledgerOf, recordedOf } from '../../lab/rules/ledger.mjs'
import type { Recording, SiteSums } from '../../lab/rules/merge.mjs'
import { remapOf } from '../../lab/rules/record.mjs'
import { reportOf } from '../../lab/rules/report.mjs'
import type { Rule, Site, SiteMap } from '../../lab/rules/sites.mjs'

// ---- a site map and a recording by hand: rule name -> its sites, each site's sums per input
type Spec = { kind?: 'threshold' | 'list'; comment?: string; cls?: string; entries?: string[]; sites: { kind: Site['kind']; per: Record<string, Partial<SiteSums>> }[]; wholeReads?: number }
const FILE = 'packages/engine/src/locate/rules.ts'
function made(specs: Record<string, Spec>, inputs: Recording['inputs'] = {}) {
  const rules: Record<string, Rule> = {}
  const sites: Site[] = []
  const per: Record<string, Record<string, SiteSums>> = {}
  let line = 1
  for (const [name, spec] of Object.entries(specs)) {
    const key = `packages/engine/src/locate/rules::(top)::${name}`
    const kind = spec.kind ?? 'threshold'
    rules[key] = { key, kind, file: FILE, line: line++, fn: '', name, area: 'pkg:engine', after: true, class: spec.cls ?? (kind === 'list' ? 'listed' : 'tuned'), sites: [], value: 0.5, raw: '0.5', context: 'constant', comment: spec.comment ?? '', ...(spec.entries ? { entries: spec.entries, form: 'list', size: spec.entries.length } : {}), ...(spec.wholeReads ? { wholeReads: spec.wholeReads } : {}) }
    for (const s of spec.sites) {
      const id = sites.length
      sites.push({ id, kind: s.kind, file: FILE, line: line++, fn: 'f', rules: [key], bounds: [{ rule: key, shape: s.kind === 'val' ? 'read' : 'direct', at: 'right', value: 0.5 }], ...(spec.entries ? { entries: spec.entries } : {}) })
      rules[key]?.sites.push(id)
      for (const [input, r] of Object.entries(s.per)) {
        const into = per[input] ?? {}
        into[id] = { n: 0, t: 0, f: 0, nan: 0, near: [null, null], tests: [null, null], hits: null, reads: null, papers: 1, ...r }
        per[input] = into
      }
    }
  }
  const map: SiteMap = { format: 'readarxiv/rule-sites 1', commit: null, digest: 'd', rules, sites, files: {} }
  const recording: Recording = { format: 'readarxiv/rules-recording 1', map: 'd', commit: 'c0ffee', records: 1, inputs: { corpus: { records: 1, papers: ['2401.00001v1'], ms: 1 }, ...inputs }, agreement: { rules: 0, ran: 0, sites: 0, sitesRun: 0, line: '' }, sites: per, rules: {} }
  return { map, recording }
}
const n = (t: number, f: number, more: Partial<SiteSums> = {}) => ({ n: t + f, t, f, ...more })

const SPECS: Record<string, Spec> = {
  DECIDES: { sites: [{ kind: 'cmp', per: { corpus: n(3, 2) } }, { kind: 'cmp', per: { corpus: n(4, 0) } }] },
  BY_TEST: { sites: [{ kind: 'cmp', per: { corpus: n(5, 0), tests: n(0, 1, { tests: [{ kept: ['a.test.ts > the other side'], more: 0 }, null] }) } }] },
  LAB_TEST: { sites: [{ kind: 'cmp', per: { corpus: n(5, 0), 'tests-lab': n(0, 2) } }] },
  NEVER: { sites: [{ kind: 'cmp', per: {} }] },
  ONE: { comment: 'two lines at most', sites: [{ kind: 'cmp', per: { corpus: n(0, 7) } }] },
  MAGNITUDE: { comment: 'a pad', sites: [{ kind: 'val', per: { corpus: { n: 3 } } }] },
  SOURCED: { comment: 'measured on the corpus: the largest gap seen', sites: [{ kind: 'val', per: { corpus: { n: 3 } } }] },
  UNREAD: { sites: [{ kind: 'val', per: {} }] },
  HANDED: { sites: [], wholeReads: 1 },
  NOWHERE: { sites: [] },
  PAPER: { comment: 'the column gap of 2401.00001v1', sites: [{ kind: 'cmp', per: { corpus: n(2, 0) } }] },
  PAPER_AWAY: { comment: 'as 2509.12345v2 sets it (2509.12345, p3)', sites: [{ kind: 'cmp', per: { corpus: n(2, 0) } }] },
  DEFINITION: { comment: "the TeXbook's \\parskip, 0pt plus 1pt", sites: [{ kind: 'cmp', per: { corpus: n(2, 0) } }] },
  SECTION: { comment: 'PDF-READER §18.61 states it', sites: [{ kind: 'cmp', per: {} }] },
  MEASURED: { comment: 'on the 88 papers no line is shorter', sites: [{ kind: 'cmp', per: { corpus: n(0, 2) } }] },
  TUNED: { comment: 'tuned by eye', sites: [{ kind: 'cmp', per: { corpus: n(0, 2) } }] },
  FOLDED_READ: { sites: [{ kind: 'cmp', per: { corpus: n(2, 0) } }, { kind: 'val', per: { corpus: { n: 1 } } }] },
  LIST: { kind: 'list', entries: ['a', 'b', 'c'], sites: [{ kind: 'set', per: { corpus: n(3, 2, { hits: { a: 3 } }) } }] },
  ITERATED: { kind: 'list', entries: ['a', 'b', 'c'], sites: [{ kind: 'list', per: { corpus: { n: 0, reads: { iterate: 4 } } } }] },
  NO_HIT: { kind: 'list', entries: ['a', 'b', 'c'], sites: [{ kind: 'set', per: { corpus: n(0, 4) } }] },
  DEFINED: { kind: 'list', cls: 'defined', comment: "Unicode's dashes", entries: ['a', 'b', 'c'], sites: [{ kind: 're', per: { corpus: n(1, 1, { hits: { a: 1 } }) } }] },
}
const rowOf = (l: Ledger, name: string) => {
  const r = l.rules[`packages/engine/src/locate/rules::(top)::${name}`]
  if (!r) throw new Error(`no row ${name}`)
  return r
}

describe('the classifier', () => {
  const { map, recording } = made(SPECS)
  const l = ledgerOf(map, recording)
  it('judges each site and folds a site of one outcome even where the rule decides', () => {
    const r = rowOf(l, 'DECIDES')
    expect([r.verdict, r.sites.map(s => s.state), r.folds]).toEqual(['decides', ['decides', 'one'], [1]])
    expect(rowOf(l, 'BY_TEST')).toMatchObject({ verdict: 'test', folds: [] })
    expect(rowOf(l, 'BY_TEST').sites[0]?.tests?.false).toEqual(['a.test.ts > the other side'])
    // (a test that reads the lab's data is the corpus: its outcome makes the site decide, not a test of our own)
    expect(rowOf(l, 'LAB_TEST').verdict).toBe('decides')
    expect(rowOf(l, 'NEVER')).toMatchObject({ verdict: 'remove', folds: [rowOf(l, 'NEVER').sites[0]?.id] })
    expect(rowOf(l, 'ONE').verdict).toBe('remove')
  })
  it('keeps a value: a magnitude with no stated source, a value with one; never read, removed', () => {
    expect([rowOf(l, 'MAGNITUDE').verdict, rowOf(l, 'SOURCED').verdict, rowOf(l, 'UNREAD').verdict]).toEqual(['magnitude', 'value', 'remove'])
    expect([rowOf(l, 'HANDED').verdict, rowOf(l, 'NOWHERE').verdict]).toEqual(['magnitude', 'remove'])
    // (its comparison folded, still read: it stays as a value)
    expect(rowOf(l, 'FOLDED_READ')).toMatchObject({ verdict: 'magnitude', foldedToValue: true, folds: [rowOf(l, 'FOLDED_READ').sites[0]?.id] })
  })
  it('flags each citation from the whole comment; tuned exempts nothing', () => {
    // (the recording's corpus ran 2401.00001v1: its silence there is already the judgement; 2509.12345 never ran)
    expect(rowOf(l, 'PAPER')).toMatchObject({ verdict: 'cited paper silent', folds: [rowOf(l, 'PAPER').sites[0]?.id] })
    expect(rowOf(l, 'PAPER_AWAY')).toMatchObject({ verdict: 'cited paper', folds: [] })
    expect(rowOf(l, 'DEFINITION')).toMatchObject({ verdict: 'definition', folds: [] })
    expect(rowOf(l, 'SECTION').verdict).toBe('definition')
    expect(rowOf(l, 'MEASURED').verdict).toBe('measurement')
    expect(rowOf(l, 'TUNED')).toMatchObject({ verdict: 'remove', citation: { flag: 'tuned' } })
    expect(l.holdoutAdds).toEqual(['2509.12345v2'])
    // (recorded in the holdout, by its number (2509.12345v3-zh is the cited 2509.12345v2's pair) and still silent: a
    // removal candidate)
    const again = ledgerOf(map, recording, { holdout: ['2509.12345v3-zh'] })
    expect(rowOf(again, 'PAPER_AWAY')).toMatchObject({ verdict: 'cited paper silent', folds: [rowOf(again, 'PAPER_AWAY').sites[0]?.id] })
    expect(citationsOf('a gap of 3 pt (measured on 2610.19860v1 p4)')).toMatchObject({ flag: 'paper', papers: ['2610.19860v1'], measurement: false })
  })
  it('judges a list by its entries where it is used by membership alone', () => {
    expect(rowOf(l, 'LIST')).toMatchObject({ verdict: 'decides', removeEntries: ['b', 'c'] })
    expect(rowOf(l, 'ITERATED')).toMatchObject({ verdict: 'not judged', listReads: { iterate: 4 } })
    expect(rowOf(l, 'NO_HIT').verdict).toBe('remove')
    expect(rowOf(l, 'DEFINED')).toMatchObject({ verdict: 'decides', entriesExempt: true })
    expect(rowOf(l, 'DEFINED').removeEntries).toBeUndefined()
  })
  it('says what was recorded, in words', () => {
    expect(recordedOf(rowOf(l, 'FOLDED_READ'))).toBe('corpus: 2 runs, 2 true, 0 false, read 1')
    expect(recordedOf(rowOf(l, 'NEVER'))).toBe('never ran on any input')
  })
})

describe('the report', () => {
  const { map, recording } = made(SPECS)
  const l = ledgerOf(map, recording)
  const r = reportOf(l, { profile: 'five papers', deferred: ['a'], budgets: [{ class: 'budget', source: null, file: FILE, line: 99, name: 'WAIT_MS', value: 500, unit: 'time' }] })
  it("states the yield by area and prints, by name, the rules an area's ledger marks as deciding nothing", () => {
    expect(r.byArea).toContain('**A PROFILE, NOT THE YIELD.** five papers')
    // (DECIDES's one-outcome site, FOLDED_READ's comparison; an iterated list's literal is read, not folded)
    expect(r.counts.a).toMatchObject({ rules: 21, folds: 2, entries: 2 })
    expect(r.counts.a?.verdicts.remove).toBe(6)
    // (six removed and PAPER, its cited paper silent on the corpus: a candidate the coordinator confirms)
    expect(r.byArea).toContain('## Area a, removal scheduled: the rules that decide nothing, by name (7)')
    expect(r.byArea).toContain('`PAPER` (packages/engine/src/locate/rules::(top)::PAPER) [cited paper silent: confirm]')
    expect(r.byArea).toContain(`- ${FILE}:10 \`ONE\` (packages/engine/src/locate/rules::(top)::ONE): corpus: 7 runs, 0 true, 7 false`)
  })
  it('prints each flagged citation whole, the magnitudes beside the unmeasured budgets, the lists not judged', () => {
    expect(r.byArea).toContain('Comment: on the 88 papers no line is shorter')
    expect(r.byArea).toContain('flag **tuned**')
    expect(r.byArea).toContain('budget packages/engine/src/locate/rules.ts:99 `WAIT_MS` = 500 (time), unmeasured')
    expect(r.byArea).toMatch(/`ITERATED` .*: iterate 4/)
    expect(r.byFile).toContain(`## ${FILE} (area a)`)
  })
})

describe('remap', () => {
  it('follows a rule into another function by signature and ordinal, and names what it cannot follow', () => {
    const rule = (value: number) => ({ kind: 'threshold', value })
    const from = { rules: { 'a::f::<0.5#1': rule(0.5), 'a::f::<0.5#2': rule(0.5), 'a::f::>3#1': rule(3), 'a::(top)::GAP': rule(0.3), 'a::f::<2#1': rule(2) } }
    const to = { rules: { 'b::g::<0.5#1': rule(0.5), 'b::g::<0.5#2': rule(0.5), 'b::h::>3#1': rule(3), 'a::(top)::GAP': rule(0.3), 'a::f::<2.5#1': rule(2.5) } }
    const m = remapOf(from, to)
    expect(m.kept).toBe(1)
    expect(m.moved).toEqual({ 'a::f::<0.5#1': 'b::g::<0.5#1', 'a::f::<0.5#2': 'b::g::<0.5#2', 'a::f::>3#1': 'b::h::>3#1' })
    expect(m.unmatched).toEqual({ old: ['a::f::<2#1'], new: ['a::f::<2.5#1'] })
  })
})

describe("the census's reading of the ledger", () => {
  let dir = ''
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'axt-rules-census-'))
    const write = (p: string, t: string) => {
      mkdirSync(dirname(join(dir, p)), { recursive: true })
      writeFileSync(join(dir, p), t)
    }
    write('packages/engine/package.json', JSON.stringify({ name: '@x/engine', type: 'module', exports: { '.': './src/index.ts' } }))
    write('packages/engine/src/index.ts', "// a gap\nexport const GAP = 0.3\n// the kinds\nexport const KINDS = new Set(['a', 'b', 'c'])\nexport const far = (d: number) => d > 4\n")
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  it('counts a rule the ledger gives no reason, and reports the magnitudes apart', async () => {
    const scan = () => [scanTree('engine', dir, ENGINE_PROFILE, { nodes: p => p.startsWith('packages/engine/src/') })]
    const bare = await census({ today: null, now: scan() })
    expect(bare.trees.NOW.debt.rules).toMatchObject({ ledger: false, unexplained: 3, magnitudes: 0 })
    expect(bare.trees.NOW.debt.rules.list.map(x => x.key).sort()).toEqual(['packages/engine/src/index::(top)::GAP', 'packages/engine/src/index::(top)::KINDS#1', 'packages/engine/src/index::far::>4#1'])
    const rulesLedger = { recorded: { commit: 'c0ffee' }, rules: { 'packages/engine/src/index::(top)::GAP': { verdict: 'magnitude' }, 'packages/engine/src/index::(top)::KINDS#1': { verdict: 'decides' }, 'packages/engine/src/index::far::>4#1': { verdict: 'remove' } } }
    const read = await census({ today: null, now: scan(), rulesLedger })
    expect(read.trees.NOW.debt.rules).toMatchObject({ ledger: true, recorded: 'c0ffee', unexplained: 1, magnitudes: 1, notJudged: 0 })
  })
})
