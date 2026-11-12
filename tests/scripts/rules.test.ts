// @vitest-environment node
// The rule ledger's instrument (lab/rules/: design-reduction-2026-11-13.md §3c, R4) on a tree written here: a package
// module of rules (a constant compared through a product, a table entry, a literal comparison, a Math.min, a set, a list,
// a regular expression of alternatives, a constant read only as a factor, a parameter that shadows a constant), a module
// that imports two of them (by name and through a namespace) and makes a set of one, and a runner. The site map counts
// what the census counts; the instrumented runner prints what the plain one prints; the record holds each outcome, the
// nearest cases and each entry's hits.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { factsOf } from '../../lab/release-check/census-lib.mjs'
import { areaOf } from '../../lab/rules/areas.mjs'
import { mergeRecords } from '../../lab/rules/merge.mjs'
import { agreementOf, countsOf, siteMapOfCheckout } from '../../lab/rules/record.mjs'
import { recorderOf } from '../../lab/rules/recorder.mjs'
import { applyEdits, instrument } from '../../lab/rules/transform.mjs'
import { rulesPlugin } from '../../lab/rules/vitest.mjs'

const ROOT = resolve(__dirname, '../..')
let dir = ''
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), text)
}

const RULES = `// the rules of a small engine
// the gap past which two words stand apart, in em
export const GAP = 0.3
// the bounds of a box
export const LIMITS = { wide: 3.5, tall: 2.5 }
// a kind's number
export const KIND = 7
// heads of sections
export const HEADS = new Set(['section', 'subsection', 'paragraph'])
const MARKS = ['dagger', 'ddagger', 'star']
const NAMED = /^(?:alpha|beta|gamma)\\b/
// a pad added to a width
const PAD = 2.5
export function apart(d: number, em: number): boolean {
  return d > GAP * em
}
export function wide(w: number): boolean {
  return w >= LIMITS.wide
}
export function clamp(x: number): number {
  return Math.min(x, 10)
}
export function short(s: string): boolean {
  return s.length < 4
}
export function isHead(k: string): boolean {
  return HEADS.has(k)
}
export function marked(s: string): boolean {
  return MARKS.includes(s)
}
export function named(s: string): boolean {
  return NAMED.test(s)
}
export function padded(w: number): number {
  return w + PAD
}
export function kindOf(k: number): boolean {
  return k === KIND
}
export function own(GAP: number): boolean {
  return GAP < 2.75
}
`
const USE = `import { GAP, HEADS } from './rules.ts'
import * as R from './rules.ts'
export function near(d) {
  return d <= GAP
}
export function nearR(d) {
  return d < R.GAP
}
export function heads(list) {
  const s = new Set([...HEADS])
  return list.filter(k => s.has(k))
}
export const opts = () => ({ GAP, at: 1 })
`
const RUN = `import { apart, wide, clamp, short, isHead, marked, named, padded, kindOf, own } from './packages/engine/src/rules.ts'
import { near, nearR, heads, opts } from './packages/engine/src/use.mjs'
const out = []
for (const [d, em] of [[2, 10], [4, 10], [3.5, 10], [1, 1]]) out.push(apart(d, em))
for (const w of [3, 3.5, 4]) out.push(wide(w))
for (const x of [5, 12, 9.5]) out.push(clamp(x))
for (const s of ['ab', 'abcd', 'abcdefg']) out.push(short(s))
for (const k of ['section', 'figure', 'section', 'paragraph']) out.push(isHead(k))
for (const s of ['star', 'plus']) out.push(marked(s))
for (const s of ['alpha one', 'delta', 'gamma ray']) out.push(named(s))
out.push(padded(1), kindOf(7), kindOf(3), own(1), own(3))
for (const d of [0.1, 0.3, 0.5]) out.push(near(d), nearR(d))
out.push(heads(['subsection', 'caption']).join(','), opts().GAP)
console.log(JSON.stringify(out))
`

let map: ReturnType<typeof siteMapOfCheckout>
const must = <T>(x: T | null | undefined, what: string): T => {
  if (x == null) throw new Error(`missing: ${what}`)
  return x
}
const rule = (suffix: string) => {
  const k = Object.keys(map.rules).find(x => x.endsWith(suffix))
  return must(k ? map.rules[k] : null, `rule ${suffix} among ${Object.keys(map.rules).join(' ')}`)
}
const sitesOfRule = (suffix: string) => rule(suffix).sites.map(id => must(map.sites[id], `site ${id}`))

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'axt-rules-'))
  write('packages/engine/src/rules.ts', RULES)
  write('packages/engine/src/use.mjs', USE)
  write('packages/engine/package.json', JSON.stringify({ name: '@x/engine', type: 'module', exports: { '.': './src/rules.ts' } }))
  write('package.json', JSON.stringify({ name: 'fixture', type: 'module' }))
  write('run.mjs', RUN)
  map = siteMapOfCheckout(dir)
  writeFileSync(join(dir, 'sites.json'), JSON.stringify(map))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('the site map', () => {
  it("holds every tuned threshold and name list the census counts, keyed by file, function and signature", () => {
    const f = factsOf('packages/engine/src/rules.ts', RULES)
    const tuned = (f.thresholds ?? []).filter(t => t.class === 'tuned')
    const c = countsOf(map)
    // (GAP, LIMITS.wide, LIMITS.tall, KIND, PAD, the 10 of Math.min, the 4 of short, the 2.75 of own)
    expect(tuned.length).toBe(8)
    expect(c.thresholdsTuned).toBe(tuned.length)
    expect(c.lists).toBe(f.lists?.length)
    expect(Object.keys(map.rules).sort()).toEqual(
      [
        'packages/engine/src/rules::(top)::GAP',
        'packages/engine/src/rules::(top)::LIMITS.wide',
        'packages/engine/src/rules::(top)::LIMITS.tall',
        'packages/engine/src/rules::(top)::KIND',
        'packages/engine/src/rules::(top)::PAD',
        'packages/engine/src/rules::clamp::min10#1',
        'packages/engine/src/rules::short::<4#1',
        'packages/engine/src/rules::own::<2.75#1',
        'packages/engine/src/rules::(top)::HEADS#1',
        'packages/engine/src/rules::(top)::MARKS#1',
        'packages/engine/src/rules::(top)::NAMED#1',
      ].sort(),
    )
  })
  it("finds a constant's comparisons in its module and in the modules that import it, and its shape", () => {
    const gap = sitesOfRule('::GAP')
    // (and a shorthand property's read, once)
    expect(gap.map(s => `${s.file} ${s.kind} ${s.fn}`).sort()).toEqual(['packages/engine/src/rules.ts cmp apart', 'packages/engine/src/use.mjs cmp near', 'packages/engine/src/use.mjs cmp nearR', 'packages/engine/src/use.mjs val opts'])
    const shapes = gap.map(s => s.bounds[0]?.shape).sort()
    expect(shapes).toEqual(['direct', 'direct', 'read', 'scale'])
    // (a parameter of the same name is not the constant)
    expect(sitesOfRule('::own::<2.75#1')).toHaveLength(1)
    expect(sitesOfRule('::GAP').some(s => s.fn === 'own')).toBe(false)
  })
  it('reads a table entry, an equality, a factor and the lists where they decide or are made', () => {
    expect(sitesOfRule('::LIMITS.wide').map(s => s.kind)).toEqual(['cmp'])
    expect(sitesOfRule('::LIMITS.tall')).toEqual([])
    expect(sitesOfRule('::KIND').map(s => s.kind)).toEqual(['eq'])
    expect(sitesOfRule('::PAD').map(s => s.kind)).toEqual(['val'])
    expect(sitesOfRule('::HEADS#1').map(s => s.kind)).toEqual(['set'])
    expect(sitesOfRule('::MARKS#1').map(s => s.kind)).toEqual(['list'])
    expect(sitesOfRule('::NAMED#1').map(s => s.kind)).toEqual(['re'])
    expect(countsOf(map).noSite).toEqual(['packages/engine/src/rules::(top)::LIMITS.tall'])
  })
  it("agrees with the census's items one by one, and says which it lacks", () => {
    const f = factsOf('packages/engine/src/rules.ts', RULES)
    const place = (x: object) => ({ ...x, file: 'packages/engine/src/rules.ts', headline: true })
    const census = { trees: { AFTER: { debt: { thresholds: { list: (f.thresholds ?? []).map(place) }, lists: { list: (f.lists ?? []).map(place) } } } } }
    const a = agreementOf(census, map)
    expect([a.onlyCensus, a.onlyMap]).toEqual([[], []])
    expect(a.noSite.map(r => `${r.key}: ${r.why}`)).toEqual(['packages/engine/src/rules::(top)::LIMITS.tall: read nowhere'])
    census.trees.AFTER.debt.lists.list.pop()
    expect(agreementOf(census, map).onlyMap).toEqual(['packages/engine/src/rules.ts:11:regex:3'])
  })
  it("tells the reduction's areas by path, before and after the front half moves", () => {
    expect(['packages/engine/src/locate/locate.ts', 'src/pdf-reader/engine/layout/marks.mjs', 'packages/engine/src/source/latex-front.mjs', 'packages/engine/src/marks/colour.mjs', 'packages/typeset/src/fit/walk.ts', 'packages/engine/src/ink.mjs', 'packages/engine/src/wrap/x.ts', 'packages/translate/src/chain.ts', 'packages/engine/src/marks/channels.ts', 'packages/engine/src/inkling.ts'].map(areaOf)).toEqual(['a', 'b', 'b', 'b', 'c', 'd', 'd', 'd', 'd', 'd'])
    expect(areaOf('src/core/x.ts')).toBe('other')
  })
  it('refuses a text the map was not made from, and nests wraps inside out', () => {
    expect(() => instrument(map, 'packages/engine/src/rules.ts', `${RULES}\n`)).toThrow(/not the text the site map was made from/)
    expect(applyEdits('a < b', [{ at: 0, end: 5, pre: 'F(', post: ')' }, { at: 0, end: 1, pre: 'G(', post: ')' }, { replace: [2, 3], text: ',' }])).toBe('F(G(a) , b)')
  })
})

describe('a recording', () => {
  const plain = () => execFileSync(process.execPath, ['run.mjs'], { cwd: dir, encoding: 'utf8' })
  const recorded = (out: string) =>
    execFileSync(process.execPath, ['--import', join(ROOT, 'lab/rules/register.mjs'), 'run.mjs'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, AXT_RULES_SITES: join(dir, 'sites.json'), AXT_RULES_OUT: out, AXT_RULES_ROOT: dir, AXT_RULES_PAPER: '2401.00001v1', AXT_RULES_INPUT: 'corpus' },
    })
  it('changes no output, and records each outcome, the nearest cases and the hits', () => {
    const out = join(dir, 'records')
    expect(recorded(out)).toBe(plain())
    expect(readdirSync(out)).toHaveLength(1)
    const rec = mergeRecords(map, [out])
    const site = (suffix: string, file = 'rules.ts') => must(rec.sites.corpus?.[String(sitesOfRule(suffix).find(s => s.file.endsWith(file) && s.kind !== 'val')?.id)], `${suffix} in ${file}`)
    // apart: d > GAP * em over (2, 10), (4, 10), (3.5, 10), (1, 1): GAP decides at d / em (0.2, 0.4, 0.35, 1), the
    // nearest each side 0.35 and 0.2
    const apart = site('::GAP')
    expect([apart.n, apart.t, apart.f]).toEqual([4, 3, 1])
    expect(apart.near[1]?.eff).toBeCloseTo(0.35)
    expect(apart.near[0]?.eff).toBeCloseTo(0.2)
    expect(apart.near[1]?.paper).toBe('2401.00001v1')
    // near (imported, direct): d <= GAP over 0.1, 0.3, 0.5
    const near = site('::GAP', 'use.mjs')
    expect([near.t, near.f]).toEqual([2, 1])
    // clamp: Math.min(x, 10) decided where x is past 10
    const clamp = site('::clamp::min10#1')
    expect([clamp.n, clamp.t, clamp.f]).toEqual([3, 1, 2])
    expect(clamp.near[1]?.eff).toBe(12)
    expect(clamp.near[0]?.eff).toBe(9.5)
    expect(site('::short::<4#1').t).toBe(1)
    // the lists: each entry's hits
    expect(site('::HEADS#1').hits).toEqual({ section: 2, paragraph: 1, subsection: 1 })
    expect(site('::MARKS#1').hits).toEqual({ star: 1 })
    expect(site('::NAMED#1').hits).toEqual({ alpha: 1, gamma: 1 })
    expect([site('::NAMED#1').t, site('::NAMED#1').f]).toEqual([2, 1])
    expect(must(rec.sites.corpus?.[String(sitesOfRule('::PAD')[0]?.id)], 'PAD').n).toBe(1)
    expect(must(rec.sites.corpus?.[String(sitesOfRule('::GAP').find(s => s.kind === 'val')?.id)], 'GAP read').n).toBe(1)
    expect([site('::KIND').t, site('::KIND').f]).toEqual([1, 1])
    // per rule: its sites summed (GAP's three comparisons)
    // (apart 3 / 1, near 2 / 1, nearR 1 / 2)
    expect(rec.rules['packages/engine/src/rules::(top)::GAP']?.corpus).toMatchObject({ n: 10, t: 6, f: 4, reads: 1 })
    expect(rec.agreement.ran).toBe(10)
  })
  it('names the test that takes each outcome, and keeps a recorder per site map', () => {
    const r = recorderOf(map, { paper: null })
    const id = must(sitesOfRule('::short::<4#1')[0], 'short').id
    r.context({ test: 'a > short' })
    r.lt(id, 2, 4)
    r.context({ test: 'b > long' })
    r.lt(id, 9, 4)
    r.lt(id, 8, 4)
    const s = must(r.snapshot().sites[id], 'the record')
    expect(s.tests).toEqual([{ kept: ['b > long'], more: 0 }, { kept: ['a > short'], more: 0 }])
    expect(r.snapshot().input).toBe('corpus')
    // (the page a lab runner sets is the nearest case's)
    r.context({ test: null, paper: '2401.00002v1-zh', page: 3 })
    r.lt(id, 3.9, 4)
    expect(must(r.snapshot().sites[id], 'the record').near?.[1]).toMatchObject({ eff: 3.9, paper: '2401.00002v1-zh', page: 3 })
  })
  it("reads a test file that read the lab's data as the corpus", () => {
    const out = join(dir, 'records-tests')
    const r = recorderOf(map, { out, input: 'tests' })
    const id = must(sitesOfRule('::short::<4#1')[0], 'short').id
    r.context({ file: 'tests/own.test.ts', test: 'own > one' })
    r.lt(id, 2, 4)
    r.flush('own', { labRead: false })
    r.context({ file: 'tests/lab.test.ts', test: 'lab > one' })
    r.lt(id, 9, 4)
    r.flush('lab', { labRead: true })
    const rec = mergeRecords(map, [out])
    expect(Object.keys(rec.sites).sort()).toEqual(['tests', 'tests-lab'])
    expect([rec.sites.tests?.[id]?.t, rec.sites['tests-lab']?.[id]?.f]).toEqual([1, 1])
  })
  it("wraps a module's text under vitest as the hook does", () => {
    const plugin = rulesPlugin({ sites: join(dir, 'sites.json'), root: dir })
    const code = plugin.transform(RULES, join(dir, 'packages/engine/src/rules.ts'))
    expect(code?.code).toBe(instrument(map, 'packages/engine/src/rules.ts', RULES))
    expect(code?.code).toContain('__axtRules.gt(')
    expect(plugin.transform('x', join(dir, 'run.mjs'))).toBeNull()
    expect(readFileSync(join(dir, 'packages/engine/src/rules.ts'), 'utf8')).toBe(RULES)
  })
})
