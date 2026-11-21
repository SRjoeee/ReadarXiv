// @vitest-environment node
// The complexity and debt census (lab/release-check/census.mjs): each number of its DEFINITIONS on a tree written here, small
// enough to count by hand. Two repositories: `engine` (an extension with an old arm its build switch cuts, an engine of
// .mjs behind a declaration, two translator clients, a ported file, a dead one, a copy in the lab) and `web`, which pins the
// first under vendor/ and imports one of its entries and one of its internals.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { alternativesOf, factsOf, lineKinds, scanTree, thresholdOf } from '../../lab/release-check/census-lib.mjs'
import { type Census, census, DEFINITIONS, headlineOf, numbersOf, ratchetOf } from '../../lab/release-check/census.mjs'
import { newLinesOf, record } from '../../lab/release-check/census-ratchet.mjs'
import { censusOf, GATES } from '../../lab/release-check/gates.mjs'
import { targetLines } from '../../lab/release-check/verdict.mjs'

let dir = ''
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), text)
}

// a function long enough to be a rule (60 tokens and more), written twice
const RULE = `export function widthOf(words, gap) {
  let total = 0
  for (const w of words) {
    if (w.kind === 'space') total += gap * w.count
    else total += w.width + (w.kern ?? 0) - (w.shrink ?? 0)
  }
  return Math.round(total * 100) / 100 + words.length * 0
}
`

const ENGINE = {
  name: 'engine',
  areas: [
    { prefix: 'src/engine/', area: 'eng', role: 'product' },
    { prefix: 'src/', area: 'ext', role: 'product' },
    { prefix: 'lab/', area: 'lab', role: 'lab' },
    { prefix: 'tests/', area: 'tests', role: 'test' },
    { prefix: '', area: 'root', role: 'config' },
  ],
  aliases: [{ from: '@/', to: 'src/' }],
  publicEntries: { files: ['src/new.ts'] },
  engineAreas: ['eng'],
  debtAreas: ['eng'],
  builds: [{ name: 'app', entries: ['src/entrypoints/main.ts'], cut: { switch: 'src/entrypoints/main.ts', seeds: ['src/old.ts'], why: 'the old arm' } }],
}
const WEB = {
  name: 'web',
  areas: [
    { prefix: 'app/', area: 'app', role: 'product' },
    { prefix: '', area: 'root', role: 'config' },
  ],
  exclude: ['vendor/'],
  pin: { prefix: 'vendor/e/', repo: 'engine' },
  aliases: [{ from: '@vendor/', to: 'vendor/e/src/' }],
  builds: [{ name: 'site', entries: ['app/main.ts'] }],
}

let c: Census
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'census-'))
  write('engine/package.json', JSON.stringify({ name: 'e', scripts: { typecheck: 'tsc --noEmit' } }))
  write('engine/tsconfig.json', '{ // the program\n "compilerOptions": { "strict": true }, "include": ["src"], }\n')
  write(
    'engine/src/entrypoints/main.ts',
    "import { oldPage } from '../old'\nimport { newPage } from '@/new'\nimport type { Kind } from '../engine/legacy.mjs'\nexport const pages: Kind[] = [oldPage(), newPage()]\n",
  )
  write('engine/src/old.ts', "import { legacy } from './engine/legacy.mjs'\nexport const oldPage = () => legacy(1)\n")
  write(
    'engine/src/new.ts',
    "import { shared } from './engine/shared.mjs'\nimport { microsoft } from './adapters/ms'\nimport { google } from './adapters/google'\nimport { ported } from './ported'\nimport { a } from './cycle-a'\nexport const newPage = () => [microsoft(), google()].map(t => t + shared() + ported() + a())\n",
  )
  write(
    'engine/src/engine/legacy.mjs',
    [
      '// the old engine',
      '',
      "export const PIPELINE_VERSION = '7'",
      '/** pt per inch, TeX\'s */',
      'export const PT_PER_IN = 72.27',
      "/** TeX's \\\\lineskiplimit */",
      'export const LIMIT = 0.5',
      '/** seen on 2401.01234 */',
      'export const GAP = 0.35',
      'export const FLAGS = { a: 1, b: 2, c: 4 }',
      "const NAMES = ['figure', 'table', 'algorithm']",
      'const REF = /\\b(?:Fig|Table|Eq)\\b/',
      'export function legacy(x, id, loads) {',
      '  if (x > 0.8 && x !== 0) return NAMES.length + REF.source.length',
      "  if (id === '2401.01234' || loads('subfigure.sty')) return Math.min(x, 3)",
      '  return x // done',
      '}',
      '',
    ].join('\n'),
  )
  write('engine/src/engine/legacy.d.mts', "export type Kind = 'old'\nexport declare function legacy(x: number, id?: string, loads?: (n: string) => boolean): number\n")
  write('engine/src/engine/shared.mjs', 'export function shared() {\n  return 2\n}\nexport function unused() {\n  return 3\n}\n')
  write('engine/src/engine/shared.d.mts', 'export declare function shared(): number\nexport declare function unused(): number\n')
  write('engine/src/adapters/ms.ts', "export const microsoft = () => fetch('https://edge.microsoft.com/translate/translatetext')\n")
  write('engine/src/adapters/google.ts', "export const google = () => fetch('https://translate-pa.googleapis.com/v1/translateHtml')\n")
  write('engine/src/ported.ts', '// Ported from reference/read-frog/src/x.ts@abc1234 (GPL-3.0), 2026-01-01, modified\nexport const ported = () => 1\n')
  write('engine/src/dead.ts', 'export const nobody = 1\n')
  write('engine/src/copy.ts', RULE)
  write('engine/lab/copy.mjs', `// COPIED as it is from src/copy.ts\n${RULE}`)
  write('engine/src/cycle-a.ts', "import { b } from './cycle-b'\nexport const a = (): number => b() + 1\n")
  write('engine/src/cycle-b.ts', "import { a } from './cycle-a'\nexport const b = (): number => (Math.random() > 2 ? a() : 0)\n")
  write('engine/src/gen.ts', '// Generated by lab/x.mjs. Do not edit.\nexport const TABLE = [1, 2, 3]\n')
  write('engine/tests/old.test.ts', "import { oldPage } from '../src/old'\nimport { widthOf } from '../src/copy'\noldPage()\nwidthOf([], 0)\n")
  write('web/package.json', JSON.stringify({ name: 'w' }))
  write('web/app/main.ts', "import { newPage } from '@vendor/new'\nimport { shared } from '../vendor/e/src/engine/shared.mjs'\nexport const page = () => newPage() + shared()\n")
  // (the engine's tree a checkout, so that the ratchet names the lines a change added)
  const git = (...a: string[]) => execFileSync('git', ['-C', join(dir, 'engine'), '-c', 'user.name=census', '-c', 'user.email=census@example.invalid', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' })
  git('init', '-q')
  git('add', '.')
  git('commit', '-q', '-m', 'fixture')
  commit = git('rev-parse', 'HEAD').trim()
  c = await take()
})
let commit = ''
const take = () => census({ today: null, now: [scanTree('engine', join(dir, 'engine'), ENGINE), scanTree('web', join(dir, 'web'), WEB)] })
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('lines', () => {
  it('tells code, comment and blank lines apart, a comment after code being code', () => {
    const text = '// one\n\nconst a = 1 // two\n/* three\n   four */\nconst b = `// not a comment`\n'
    const f = factsOf('x.ts', text)
    expect(f.lines).toEqual({ code: 2, comment: 3, blank: 1 })
    expect(lineKinds('a\n\n// c\n', [[3, 7]])).toEqual(['code', 'blank', 'comment'])
  })

  it('counts product code by area, generated files apart, and the engine whole', () => {
    const now = c.trees.NOW
    expect(now.size.generated.list).toEqual([{ file: 'src/gen.ts', code: 1 }])
    // legacy.mjs 12 code lines of its 17, shared.mjs 6; the two declaration files' lines join the engine's whole count
    expect(now.size.engine.code).toBe(18)
    expect(now.size.engine.all).toBe(17 + 6 + 2 + 2)
  })
})

describe('rule debt', () => {
  it('classes each threshold by where it is declared and what its comment cites', () => {
    const f = factsOf('src/engine/legacy.mjs', `${'\n'.repeat(0)}// x\nexport const PT_PER_IN = 72.27 // pt per inch\nexport const W = 72\nif (a > 0.8) b()\n`)
    const by = Object.fromEntries((f.thresholds ?? []).map(t => [t.raw, t.class]))
    expect(by).toEqual({ '72.27': 'conversion', '72': 'borderline', '0.8': 'tuned' })
    expect(thresholdOf({ value: 0.5, raw: '0.5', name: 'LIMIT', comment: "TeX's \\lineskiplimit", line: 1, context: 'constant' }).class).toBe('borderline')
    expect(thresholdOf({ value: 0.35, raw: '0.35', name: 'GAP', comment: 'seen on 2401.01234', line: 1, context: 'constant' })).toMatchObject({ class: 'tuned', evidence: true })
    expect(thresholdOf({ value: 0x3000, raw: '0x3000', name: null, comment: '', line: 1, context: 'comparison' }).class).toBe('code')
  })

  it("reads an exported declaration's comment off its export statement, where the parser hangs it", () => {
    // (a list and a comparison in an exported declaration, each under a comment that cites a definition; the same two
    // declared without `export` read alike)
    const text = "// a module of rules\n\n// Unicode's hyphens: U+002D, U+2010, U+2011\nexport const HYPHENS = ['-', '\u2010', '\u2011']\n// TeX's \\hbadness default\nexport const loose = (b: number) => b > 7\n"
    for (const t of [text, text.replace(/export /g, '')]) {
      const f = factsOf('src/engine/marks.ts', t)
      expect(f.lists?.[0]).toMatchObject({ name: 'HYPHENS', class: 'defined' })
      expect(f.thresholds?.find(x => x.raw === '7')).toMatchObject({ class: 'borderline', reason: true, cites: 'TeX' })
    }
  })

  it("reads a rule's comment as the block directly before its declaration: not the file's opening comment, not a block a blank line apart", () => {
    // (the file's opening comment cites TeX and a paper; the first list follows it after a blank line; a block that cites
    // Unicode stands a blank line above the constant; the comparison's own comment is directly before it)
    const text = "// src/engine/rules.ts: the module's rules, after TeX and 2401.00001v1\n\nexport const KINDS = ['a', 'b', 'c']\n// Unicode's dashes\n\nconst GAP = 0.3\n// the TeXbook's \\hbadness\nexport const loose = (b: number) => b > 7\n"
    const f = factsOf('src/engine/rules.ts', text)
    expect(f.lists?.[0]).toMatchObject({ name: 'KINDS', class: 'listed' })
    expect(f.thresholds?.find(x => x.name === 'GAP')).toMatchObject({ class: 'tuned', reason: false })
    expect(f.thresholds?.find(x => x.raw === '7')).toMatchObject({ class: 'borderline', reason: true })
    // (the module's first statement with its own block directly before it, the file's opening comment above it apart)
    const g = factsOf('src/engine/first.ts', "// the module\n\n// Unicode's hyphens\nconst HYPHENS = ['-', '\u2010', '\u2011']\n")
    expect(g.lists?.[0]).toMatchObject({ class: 'defined' })
  })

  it("cuts a rule's comment where its kind changes: a block comment directly before a declaration is its own, a run of line comments one block", () => {
    // (a header of line comments runs into the first declaration's own JSDoc with no blank line: the header is the file's,
    // the JSDoc the declaration's)
    const f = factsOf('src/engine/tail.mjs', "// the module: TeX's and the PDF's bounds\n// read from its bytes\n/** the bytes at the end looked at, after the PDF reference */\nconst WINDOW = 0.5\n")
    expect(f.thresholds?.find(x => x.name === 'WINDOW')).toMatchObject({ class: 'borderline', reason: true, cites: 'PDF reference' })
    // (a block comment above a run of line comments with no blank line: the run alone is the declaration's)
    const g = factsOf('src/engine/rules.ts', "const A = 1\n/* Unicode's section */\n// a pad\n// of our own\nconst PAD = 2.5\n")
    expect(g.thresholds?.find(x => x.name === 'PAD')).toMatchObject({ class: 'tuned', reason: true, cites: null })
  })

  it('reads a file of a TeX distribution named by its extension as a definition, never a package named alone', () => {
    const f = factsOf('src/engine/marks.ts', "const A = 1\n// the marks cite.sty and natmove.sty look for and set first\nconst FOLLOWERS = ['.', ',', ';']\n// the marks biblatex looks for\nconst SEEN = ['!', '?', ':']\n// latex.ltx's \\@empty, a definition still\nconst EMPTY = ['a', 'b', 'c']\n")
    expect(f.lists?.map(l => [l.name, l.class, l.cites])).toEqual([
      ['FOLLOWERS', 'defined', 'cite.sty'],
      ['SEEN', 'listed', null],
      ['EMPTY', 'defined', 'latex.ltx'],
    ])
  })

  it("counts no rules registry's citations as a name list, whatever their strings' lengths; a registry's other lists are lists", () => {
    // (a registry declared as rule entries: each entry's `ports` cites the code it carries; its `owns` and `reads` are lists as
    // any are; the same `ports` array outside a registry, or in an array of another type, is a list too)
    const entry = "{ id: 'S.a', owns: ['T1', 'T2', 'T3'], ports: ['RUN:1-2 a', 'L2:3-4 b', 'x.mjs:5 c'], reads: ['p.q', 'p.r', 'p.s'] }"
    for (const decl of ['const SPECS: readonly RuleSpec[] = ', 'const SPECS: RuleSpec[] = ', 'export const SPECS: ReadonlyArray<RuleSpec> = ']) {
      const f = factsOf('src/engine/rules.ts', `type RuleSpec = { id: string }\n${decl}[\n  ${entry},\n  ${entry.replace("'S.a'", "'S.b'")},\n]\n`)
      expect(f.lists?.map(l => l.sample), decl).toEqual([['T1', 'T2', 'T3'], ['p.q', 'p.r', 'p.s'], ['T1', 'T2', 'T3'], ['p.q', 'p.r', 'p.s']])
    }
    for (const decl of ['const SPECS = ', 'const SPECS: readonly Other[] = ']) {
      const f = factsOf('src/engine/rules.ts', `${decl}[\n  ${entry},\n]\n`)
      expect(f.lists?.length, decl).toBe(3)
    }
  })

  it('counts the engine\'s thresholds, lists, special cases and version constants', () => {
    const d = c.trees.NOW.debt
    // GAP 0.35 (evidence), 0.8 (no reason), 3 (Math.min): tuned; LIMIT borderline; PT_PER_IN a conversion; FLAGS an enumeration
    expect(d.thresholds.headline).toEqual({ conversion: 1, borderline: 1, tuned: 3, code: 3 })
    expect(d.thresholds.headlineTunedNoReason).toBe(2)
    expect(d.lists.list.map(l => [l.form, l.size])).toEqual([['list', 3], ['regex', 3]])
    expect(alternativesOf('\\b(?:Fig|Table|Eq)\\b')).toEqual(['Fig', 'Table', 'Eq'])
    expect(d.papers).toEqual([{ id: '2401.01234', at: 'src/engine/legacy.mjs:15' }])
    expect(d.texFiles).toEqual([{ name: 'subfigure.sty', at: 'src/engine/legacy.mjs:15' }])
    expect(d.versions.list).toEqual([expect.objectContaining({ name: 'PIPELINE_VERSION', value: '7', at: 'src/engine/legacy.mjs:3', mirror: false })])
  })
})

describe('the graph', () => {
  it('finds the cycle, the chain and the ported file a build reaches', () => {
    const now = c.trees.NOW
    expect(now.graph.cycles).toMatchObject({ count: 1, modules: 2 })
    expect(now.chains.chains.map(x => [x.file, x.kinds])).toEqual([['src/new.ts', ['google', 'microsoft']]])
    expect(now.gpl).toEqual([{ file: 'src/ported.ts', repo: 'engine', path: 'src/ported.ts', code: 1, role: 'product', reachedBy: [{ build: 'engine/app', path: ['src/entrypoints/main.ts', 'src/new.ts', 'src/ported.ts'] }, { build: 'web/site', path: ['web:app/main.ts', 'src/new.ts', 'src/ported.ts'] }] }])
  })

  it("counts the website's imports of the engine: an entry is not an internal", () => {
    expect(c.trees.NOW.webImports).toMatchObject({ product: { engine: 1, extension: 0, entries: 1 }, internals: 1 })
  })
})

describe('the cut-over', () => {
  it('deletes what only the old arm reaches, and the tests that import it; a type-only import keeps nothing', () => {
    expect(c.cutover.deleted.list).toEqual(['engine:src/engine/legacy.d.mts (2)', 'engine:src/engine/legacy.mjs (12)', 'engine:src/old.ts (2)'])
    expect(c.cutover.goWith.list).toEqual(['engine:tests/old.test.ts (4)'])
    expect(c.trees.AFTER.size.engine.code).toBe(6)
    expect(c.trees.AFTER.debt.versions.list).toEqual([])
  })
})

describe('types, duplicates, dead code', () => {
  it('reads a .mjs behind a declaration as unchecked, and an included TypeScript file as checked', () => {
    // (the website's tree has no typecheck script: its one file is unchecked too)
    expect(c.trees.NOW.types).toMatchObject({ engine: 18, mjs: 18, unchecked: 21 })
    expect(c.trees.AFTER.types.engine).toBe(6)
  })

  it("finds the lab's copy of a product rule and its copy note", () => {
    expect(c.trees.NOW.duplicates).toMatchObject({ groups: 1, lines: 8, copied: ['lab/copy.mjs (8)'] })
  })

  it('names the module and the export nothing reaches; an export only tests import is apart', () => {
    const dead = c.trees.NOW.dead
    expect(dead.moduleList).toEqual(expect.arrayContaining(['src/dead.ts (1)', 'src/copy.ts (8, tests or lab reach it)']))
    expect(dead.deadExportList).toEqual(expect.arrayContaining(['src/dead.ts:1 nobody', 'src/engine/shared.mjs:4 unused']))
    expect(dead.testOnlyExports).toBe(1)
  })

  it('defines every headline number and gives release-check its numbers', () => {
    for (const h of headlineOf(c)) expect([h.id, h.values.length]).toEqual([h.id, 3])
    expect(Object.keys(DEFINITIONS).length).toBeGreaterThanOrEqual(14)
    expect(numbersOf(c)).toMatchObject({ trees: 'NOW,AFTER', importsNow: 1, importsAfter: 1, chainsNow: 1, versionsNow: 1, versionsAfter: 0 })
  })
})

describe("release-check's census rows", () => {
  it('runs the census in the fast tier and reads its numbers off its own line', () => {
    expect(GATES.find(g => g.id === 'census')).toMatchObject({ tier: 'fast', stage: 'unit' })
    const numbers = censusOf(`census: x\ncensus-numbers: ${JSON.stringify(numbersOf(c))}\n`)
    expect(numbers).toMatchObject({ importsNow: 1, partial: false })
    const lines = Object.fromEntries(targetLines({ census: { status: 'pass', numbers } }).map(t => [t.id, t]))
    // after the cut-over: one version constant left of one, nothing unchecked of the engine but shared.mjs, the website's one
    // internal import still there, one chain, no ported file reached
    expect(lines.versions).toMatchObject({ status: 'met' })
    expect(lines.unchecked).toMatchObject({ status: 'missed', value: '? → 18 → 6 code lines (every line of those files ? → 6)' })
    expect(lines.imports).toMatchObject({ status: 'missed' })
    expect(lines.chains).toMatchObject({ status: 'met' })
    expect(lines.gpl).toMatchObject({ status: 'missed' })
    // (the thresholds were the old engine's, deleted with it: none left without its reason)
    expect(lines.thresholds).toMatchObject({ status: 'met' })
    expect(lines['engine-lines']).toMatchObject({ status: 'reported' })
  })

  it("says the website's numbers were not measured where its tree was not given", () => {
    const numbers = { trees: 'NOW,AFTER', partial: true, versionsNow: 3, versionsAfter: 1, mirrorsAfter: 0 }
    const lines = Object.fromEntries(targetLines({ census: { status: 'pass', numbers } }).map(t => [t.id, t]))
    expect(lines.imports).toMatchObject({ status: 'reported', value: expect.stringMatching(/not measured here/) })
    expect(lines.versions).toMatchObject({ status: 'reported' })
  })
})

describe('the ratchet', () => {
  const first = () => {
    const r = ratchetOf(c, { engine: null, web: null })
    const web = r.web!
    return { engine: record(null, r.engine.current, r.engine.lines, { commit, at: 't0', about: 'a fixture' }), web: record(null, web.current, web.lines, { commit, at: 't0', about: 'a fixture' }) }
  }

  it('records every measure of NOW and AFTER, per repository', () => {
    const l = first()
    expect(l.engine.trees.NOW?.values).toMatchObject({ thresholds: 3, thresholdsNoReason: 2, lists: 2, versions: 1, unchecked: 18, cycles: 1, chains: 1, gplReached: 1, productModules: 12 })
    expect(l.engine.trees.AFTER?.values).toMatchObject({ thresholds: 0, versions: 0, unchecked: 6 })
    expect(l.web.trees.NOW?.values).toMatchObject({ webImports: 1, webExtensionImports: 0 })
    expect(l.engine.trees.NOW?.files.thresholds).toEqual({ 'src/engine/legacy.mjs': 3 })
  })

  it('fails a rise, naming the measure, both values and the new entry by file and line', async () => {
    const l = first()
    write('engine/src/engine/shared.mjs', 'export function shared() {\n  return 2\n}\nexport function unused() {\n  return 3\n}\nexport const tight = x => x > 0.42\n')
    try {
      const after = await take()
      const r = ratchetOf(after, { engine: l.engine, web: l.web }, { engine: newLinesOf(join(dir, 'engine'), commit) })
      const rise = r.engine.lines.find(x => x.status === 'rise' && x.tree === 'NOW' && x.measure === 'thresholds')
      expect(rise).toMatchObject({ recorded: 3, value: 4, added: [{ file: 'src/engine/shared.mjs', from: 0, to: 1, entries: ['src/engine/shared.mjs:7'] }] })
      // (a raise without its reason is refused; with one, it is kept with the reason and the commit)
      expect(() => record(l.engine, r.engine.current, r.engine.lines, { raise: ['thresholds'], commit, at: 't1', about: '' })).toThrow(/without --reason/)
      expect(() => record(l.engine, r.engine.current, r.engine.lines, { commit, at: 't1', about: '' })).toThrow(/NOW thresholds rose 3 → 4/)
      // (the line added a rule with no comment and no row in the rule ledger, one code line no checker reads, an export
      // nothing imports)
      const raised = record(l.engine, r.engine.current, r.engine.lines, { raise: ['thresholds', 'thresholdsNoReason', 'rulesUnexplained', 'unchecked', 'deadExports', 'productCode'], reason: 'a fixture rule', commit, at: 't1', about: '' })
      expect(raised.raises).toEqual(expect.arrayContaining([{ tree: 'NOW', measure: 'thresholds', from: 3, to: 4, reason: 'a fixture rule', commit, at: 't1' }]))
      expect(raised.trees.NOW?.values.thresholds).toBe(4)
      // the tree as it was, against the raised ledger: a fall, which passes and can be lowered
      const back = ratchetOf(c, { engine: raised, web: l.web })
      expect(back.engine.lines.filter(x => x.status === 'rise')).toEqual([])
      expect(back.engine.lines.find(x => x.tree === 'NOW' && x.measure === 'thresholds')).toMatchObject({ status: 'fall', recorded: 4, value: 3 })
    } finally {
      write('engine/src/engine/shared.mjs', 'export function shared() {\n  return 2\n}\nexport function unused() {\n  return 3\n}\n')
    }
  })

  it("skips what needs the website's tree where it was not given, and judges the rest", async () => {
    const l = first()
    const alone = await census({ today: null, now: [scanTree('engine', join(dir, 'engine'), ENGINE)] })
    const r = ratchetOf(alone, { engine: l.engine })
    const by = Object.fromEntries(r.engine.lines.map(x => [`${x.tree} ${x.measure}`, x.status]))
    expect(by).toMatchObject({ 'NOW thresholds': 'hold', 'NOW deadModules': 'skipped', 'NOW gplReached': 'skipped', 'AFTER thresholds': 'skipped' })
  })
})

// The reduction round's measures (design-reduction §1, §3c, §3d) on a second pair of trees: an engine with a workspace package
// `@x/p` (two translator clients and the chain behind its entry, the store's version constants, budgets, vocabularies, casts,
// a function of 1,003 code lines, comments that tell history), an order of its own in the engine's source, and a website
// whose order takes the package's clients through its entry.
describe("the reduction round's measures", () => {
  const PKG = {
    name: 'engine',
    areas: [
      { prefix: 'packages/p/src/', area: 'pkg:p', role: 'product' },
      { prefix: 'packages/', area: 'packages', role: 'config' },
      { prefix: 'src/', area: 'ext', role: 'product' },
      { prefix: '', area: 'root', role: 'config' },
    ],
    workspaces: ['packages'],
    publicEntries: { packageExports: 'packages' },
    engineAreas: ['pkg:p'],
    debtAreas: ['pkg:p'],
    builds: [{ name: 'app', entries: ['src/main.ts', 'src/own.ts'] }, { name: 'packages', entries: { packageExports: 'packages' } }],
  }
  const SITE = { ...WEB, workspaces: ['vendor/e/packages'] }
  let root = ''
  let r: Census
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'census-r0-'))
    put('engine/package.json', JSON.stringify({ name: 'e2' }))
    put('engine/packages/p/package.json', JSON.stringify({ name: '@x/p', exports: { '.': './src/index.ts' } }))
    put('engine/packages/p/src/index.ts', "export { deepl, google } from './adapters.ts'\nexport { chainOf } from './chain.ts'\n")
    put('engine/packages/p/src/adapters.ts', "export const deepl = () => fetch('https://api.deepl.com/v2/translate')\nexport const google = () => fetch('https://translate.googleapis.com/t')\n")
    put(
      'engine/packages/p/src/chain.ts',
      [
        "// Today's chain, moved here (round B14).",
        '// The order fixed on 2026-11-01.',
        '// Measured on 2026-11-02: 40 ms a call.',
        "import { z } from 'zod'",
        '',
        "/** a call's time at most */",
        'export const CALL_MS = 1500',
        '/** the pages kept at most (measured on the corpus) */',
        'export const KEEP_PAGES = 4',
        "/** a stored value's bytes at most: the platform's quota allows that */",
        'export const VALUE_BYTES = 65536',
        "/** a gap's width at most, em */",
        'export const GAP_MAX = 3',
        "export const KINDS = ['para', 'heading', 'caption'] as const",
        'export type Kind = (typeof KINDS)[number]',
        "export const STATE = z.enum(['open', 'shut', 'gone'])",
        "const NAMES = ['Figure', 'Table', 'Algorithm']",
        '',
        "/** the first translator's answer that is not empty */",
        'export async function chainOf(translators: (() => Promise<Response>)[]): Promise<string> {',
        '  for (const t of translators) {',
        '    const text = await (await t()).text()',
        '    if (text && !NAMES.includes(text)) return text',
        '  }',
        "  return ''",
        '}',
        '',
      ].join('\n'),
    )
    put('engine/packages/p/src/p.css', "/* the bar's height (the owner's ruling of 2026-11-08) */\n.bar { height: 2rem }\n")
    put(
      'engine/packages/p/src/store.ts',
      [
        '// The store\'s records. A change of shape bumps STORE_VERSION and gets a migration.',
        'export const STORE_VERSION = 3',
        "/** the key's grammar: rises only if the grammar changes */",
        "export const KEY_VERSION = 'k1'",
        "/** raised with any change to what the maker writes under this schema */",
        "export const MAKER_VERSION = '9'",
        'export const PAGE_FORMAT = 2',
        "/** the model's, raised with its files */",
        "export const MODEL_VERSION = 'm-2'",
        '',
      ].join('\n'),
    )
    put(
      'engine/packages/p/src/casts.ts',
      [
        'export const n = (x: unknown) => x as number',
        'export const s = (x: unknown) => <string>x',
        'export const twice = (x: unknown) => x as unknown as string[]',
        'export const no = (x: unknown) => x as never',
        'export const anyway = (x: unknown) => x as any',
        'export const first = (xs: number[]) => xs[0]!',
        "export const KEYS = ['a', 'b', 'c'] as const",
        "// @ts-ignore: a test's",
        "export const bad: number = 'x'",
        '',
      ].join('\n'),
    )
    put('engine/packages/p/src/long.ts', `export function huge(x: number): number {\n${'  x += 1\n'.repeat(1001)}  return x\n}\n`)
    put('engine/src/clients.ts', "export const ms = () => fetch('https://edge.microsoft.com/translate/t')\nexport const gg = () => fetch('https://translate-pa.googleapis.com/t')\n")
    put('engine/src/own.ts', "import { gg, ms } from './clients'\nexport const order = () => [ms(), gg()]\n")
    put('engine/src/main.ts', "import { chainOf, deepl, google } from '@x/p'\nexport const run = () => chainOf([deepl(), google()].map(p => () => p))\n")
    put('web/package.json', JSON.stringify({ name: 'w2' }))
    put('web/app/main.ts', "import { deepl, google } from '@x/p'\nexport const order = () => [google(), deepl()]\n")
    r = await census({ today: null, now: [scanTree('engine', join(root, 'engine'), PKG), scanTree('web', join(root, 'web'), SITE)] })
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('measures functions by their code lines: the longest, those over 1,000, the ten longest', () => {
    const f = r.trees.NOW.functions
    // huge: its first line, 1,001 additions, its return and its brace; chainOf 7; every other function one line
    expect(f.longest).toMatchObject({ name: 'huge', code: 1004, file: 'packages/p/src/long.ts' })
    expect([f.over1000, f.over500]).toEqual([1, 1])
    expect(f.ten.slice(0, 2).map(x => [x.name, x.code])).toEqual([['huge', 1004], ['chainOf', 7]])
    expect(f.tenLongest).toBe(1004 + 7 + 8)
    expect(f.byRepo.web?.longest).toMatchObject({ code: 1 })
  })

  it("tells a store's schema numbers from content versions", () => {
    const v = r.trees.NOW.debt.versions
    const by = Object.fromEntries(v.list.map(x => [x.name, x.schema]))
    // STORE_VERSION by its file's opening comment (shape), KEY_VERSION by its own (grammar), PAGE_FORMAT by its name;
    // MAKER_VERSION says what is computed changed though it names a schema; MODEL_VERSION says nothing of a form
    expect(by).toEqual({ STORE_VERSION: true, KEY_VERSION: true, MAKER_VERSION: false, PAGE_FORMAT: true, MODEL_VERSION: false })
    expect([v.count, v.schema, v.content]).toEqual([5, 3, 2])
  })

  it('counts budgets apart from tuned thresholds, each with its unit and source', () => {
    const d = r.trees.NOW.debt
    const budgets = Object.fromEntries(d.thresholds.list.filter(t => t.class === 'budget').map(t => [t.name, [t.unit, t.source]]))
    expect(budgets).toEqual({ CALL_MS: ['time', null], KEEP_PAGES: ['count', 'measured'], VALUE_BYTES: ['bytes', 'platform'] })
    // (GAP_MAX is measured in em: a reading's rule; the two numeric version constants are thresholds by that definition too)
    expect(d.thresholds.list.filter(t => t.class === 'tuned').map(t => t.name)).toEqual(['GAP_MAX', 'STORE_VERSION', 'PAGE_FORMAT'])
    expect(d.budgets).toMatchObject({ count: 3, unmeasured: 1, headline: 3 })
  })

  it('counts vocabularies apart from name lists', () => {
    const d = r.trees.NOW.debt
    // (KINDS: a type read off it; STATE: a schema's enum; KEYS is `as const` and nothing types over it: a name list)
    expect(d.vocabularies.list.map(x => x.name)).toEqual(['KINDS', 'STATE'])
    expect(d.lists.list.map(x => x.name)).toEqual(['KEYS', 'NAMES'])
  })

  it('counts translate chains by implementation: hosts of a package take its chain', () => {
    const c = r.trees.NOW.chains
    expect(c.orders).toBe(3)
    expect(c.implementations.map(i => [i.file, i.hosts])).toEqual([
      ['packages/p/src/index.ts', ['src/main.ts', 'web:app/main.ts']],
      ['src/own.ts', []],
    ])
    expect(c.count).toBe(2)
  })

  it("counts the packages' comment lines that tell history, a measurement's date kept", () => {
    // chain.ts line 1 (today's, a round), line 2 (a date); p.css line 1 (a date); line 3 a measurement's date
    expect(r.trees.NOW.history).toMatchObject({ lines: 3, todays: 1, dated: 2, measuredDates: 1, named: 1 })
  })

  it('counts casts, `as const` apart, the unsafe ones, non-null assertions and @ts-ignore', () => {
    expect(r.trees.NOW.types).toMatchObject({ casts: 5, unsafeCasts: 3, nonNull: 1, suppressions: 1, packages: { casts: 5, unsafeCasts: 3, suppressions: 1 } })
  })

  it('records the new measures in the ledger, per repository', () => {
    const j = ratchetOf(r, { engine: null, web: null })
    const engine = record(null, j.engine.current, j.engine.lines, { commit: null, at: 't0', about: 'a fixture' })
    expect(engine.trees.NOW?.values).toMatchObject({ longestFunction: 1004, functionsOver1000: 1, tenLongest: 1004 + 7 + 8, contentVersions: 2, budgetsUnmeasured: 1, historyComments: 3, unsafeCasts: 3, suppressions: 1, chains: 2 })
    const web = record(null, j.web!.current, j.web!.lines, { commit: null, at: 't0', about: 'a fixture' })
    expect(web.trees.NOW?.values).toMatchObject({ chains: 0, longestFunction: 1, tenLongest: 1 })
  })
})

// A list is classed by what the code does with its members, never by how it is spelled (DEFINITIONS.lists), and an export
// is live by what is read of it (DEFINITIONS.dead), on a third tree: a package whose lists are each used one way (a type read
// off them in their module or an importer's, a schema's enum, a union of the code's they are declared an array or a set of,
// a JavaScript module's list typed by its declaration; names matched against a value, a table's rows, an annotation nothing
// else names, a type read off a list whose members are not kept), and whose entry reads two members of one namespace, passes
// another namespace on whole and re-exports a third; a test reads one member of a fourth.
describe('lists by use, exports by what is read', () => {
  const P3 = {
    name: 'engine',
    areas: [
      { prefix: 'packages/p/src/', area: 'pkg:p', role: 'product' },
      { prefix: 'packages/', area: 'packages', role: 'config' },
      { prefix: 'tests/', area: 'tests', role: 'test' },
      { prefix: '', area: 'root', role: 'config' },
    ],
    workspaces: ['packages'],
    publicEntries: { packageExports: 'packages' },
    engineAreas: ['pkg:p'],
    debtAreas: ['pkg:p'],
    builds: [{ name: 'packages', entries: { packageExports: 'packages' } }],
  }
  let root = ''
  let r: Census
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'census-use-'))
    put('engine/package.json', JSON.stringify({ name: 'e3' }))
    put('engine/packages/p/package.json', JSON.stringify({ name: '@x/p', exports: { '.': './src/index.ts' } }))
    put(
      'engine/packages/p/src/kinds.ts',
      [
        "import { z } from 'zod'",
        '// our kinds: a type is read off them',
        "export const KINDS = Object.freeze(['para', 'heading', 'caption'] as const)",
        'export type Kind = (typeof KINDS)[number]',
        "// a paper's font names, declared `as const`: matched against a name read off a page, no type read off them",
        "export const FONTS = ['cmr10', 'cmbx10', 'cmti10'] as const",
        'export const isTexFont = (name: string): boolean => (FONTS as readonly string[]).includes(name)',
        '// a family of ours: a union the code names, the list declared an array of it, no `as const`',
        "export type Family = 'cm' | 'times' | 'other'",
        "export const FAMILIES: readonly Family[] = Object.freeze(['cm', 'times', 'other'])",
        "export const familyOf = (name: string): Family => (name.startsWith('cm') ? 'cm' : 'other')",
        '// the stops that go on: a set of a union the code names elsewhere',
        "export type Stop = 'busy' | 'rate' | 'network' | 'auth'",
        "export const GOES: ReadonlySet<Stop> = new Set<Stop>(['busy', 'rate', 'network'])",
        "export const stopOf = (s: string): Stop => (GOES.has(s as Stop) ? (s as Stop) : 'auth')",
        '// an annotation whose union nothing else names: spelling alone',
        "export const ONLY: readonly ('a' | 'b' | 'c')[] = ['a', 'b', 'c']",
        "// a type read off a list whose members are not kept: `string`",
        "export const LOOSE = ['x', 'y', 'z']",
        'export type Loose = (typeof LOOSE)[number]',
        "// a schema's enum, written in place and by a list's name",
        "export const STATE = z.enum(['open', 'shut', 'gone'])",
        "const UNDER = ['none', 'solid', 'dotted'] as const",
        'export const Look = z.object({ underline: z.enum(UNDER) })',
        "// a table of each face's alphabets, read off its file: rows of measured values",
        "export const HOLDS: Readonly<Record<string, readonly string[]>> = { a: ['Latn', 'Cyrl', 'de'], b: ['Latn', 'de', 'fr'] }",
        '',
      ].join('\n'),
    )
    put('engine/packages/p/src/modes.ts', "export const MODES = ['stack', 'side', 'only'] as const\n")
    put(
      'engine/packages/p/src/use.ts',
      "import * as K from './kinds.ts'\nimport { MODES } from './modes.ts'\nexport type Mode = (typeof MODES)[number]\nexport const kindAt = (k: K.Kind): number => K.KINDS.indexOf(k)\n",
    )
    put('engine/packages/p/src/old.mjs', "export const CLASSES = Object.freeze(['math', 'cite', 'ref'])\nexport const NAMES = Object.freeze(['Figure', 'Table', 'Algorithm'])\nexport const classOf = x => (CLASSES.includes(x) ? x : 'math')\n")
    put(
      'engine/packages/p/src/old.d.mts',
      "export type MarkClass = 'math' | 'cite' | 'ref'\nexport declare const CLASSES: readonly MarkClass[]\nexport declare const NAMES: readonly string[]\nexport declare function classOf(x: string): MarkClass\n",
    )
    put('engine/packages/p/src/ns.ts', 'export const a = 1\nexport const b = 2\nexport const c = 3\n')
    put('engine/packages/p/src/whole.ts', 'export const d = 4\nexport const e = 5\n')
    put('engine/packages/p/src/re.ts', 'export const f = 6\n')
    put('engine/packages/p/src/two.ts', 'export const g = 7\nexport const h = 8\n')
    put(
      'engine/packages/p/src/index.ts',
      [
        "import * as N from './ns.ts'",
        "import * as W from './whole.ts'",
        "export { kindAt } from './use.ts'",
        "export { classOf } from './old.mjs'",
        "export { familyOf, isTexFont, stopOf } from './kinds.ts'",
        "export * as R from './re.ts'",
        'const keep = (m: object): number => Object.keys(m).length',
        'export const total = (x: typeof N.b): number => N.a + x + keep(W)',
        "export type { Family } from './kinds.ts'",
        '',
      ].join('\n'),
    )
    put('engine/tests/two.test.ts', "import * as T from '../packages/p/src/two.ts'\nexport const seen = T.g\n")
    // (a dynamic import's module object: destructured, bound to a name, one member read off it, and one handed on unread)
    for (const [m, a, b] of [['three', 'i', 'j'], ['four', 'k', 'l'], ['five', 'n', 'o'], ['six', 'q', 's']]) put(`engine/packages/p/src/${m}.ts`, `export const ${a} = 1\nexport const ${b} = 2\n`)
    put(
      'engine/tests/dyn.test.ts',
      [
        'export const run = async (): Promise<number> => {',
        "  const { i } = await import('../packages/p/src/three.ts')",
        "  const m = await import('../packages/p/src/four.ts')",
        "  return i + m.k + (await import('../packages/p/src/five.ts')).n",
        '}',
        "export const later = () => import('../packages/p/src/six.ts')",
        '',
      ].join('\n'),
    )
    // (the website declares a list of the package's union, through the package's entry in its pin)
    put('web/package.json', JSON.stringify({ name: 'w3' }))
    put('web/app/main.ts', "import { pickOf } from './pick.ts'\nexport const run = () => pickOf('cm')\n")
    put('web/app/pick.ts', "import type { Family } from '@x/p'\nexport const PICKS: readonly Family[] = ['cm', 'times', 'other']\nexport const pickOf = (f: Family): number => PICKS.indexOf(f)\n")
    const SITE3 = { ...WEB, workspaces: ['vendor/e/packages'] }
    r = await census({ today: null, now: [scanTree('engine', join(root, 'engine'), P3), scanTree('web', join(root, 'web'), SITE3)] })
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('classes a list as a vocabulary where the code types over its members, whatever it is declared with', () => {
    const d = r.trees.NOW.debt
    // KINDS and MODES: a type read off them (in their module, in an importer); FAMILIES and GOES: declared of a union the
    // code names elsewhere; CLASSES: a JavaScript module's list its declaration types so; STATE and UNDER: a schema's enum
    expect(d.vocabularies.list.filter(x => x.repo === 'engine').map(x => x.name).sort()).toEqual(['CLASSES', 'FAMILIES', 'GOES', 'KINDS', 'MODES', 'STATE', 'UNDER'])
    expect(Object.fromEntries(d.vocabularies.list.filter(x => ['KINDS', 'GOES', 'CLASSES', 'UNDER'].includes(x.name ?? '')).map(x => [x.name, x.by]))).toEqual({
      KINDS: 'a type read off it',
      GOES: 'declared of Stop',
      CLASSES: 'declared of MarkClass',
      UNDER: "a schema's enum",
    })
  })

  it("classes a website's list declared of a package's union a vocabulary, the union read through the pin", () => {
    expect(r.trees.NOW.debt.vocabularies.list.filter(x => x.repo === 'web').map(x => [x.name, x.by])).toEqual([['PICKS', 'declared of Family']])
  })

  it("keeps a name list a name list whatever its spelling: `as const`, an annotation nothing else names, a table's rows", () => {
    const d = r.trees.NOW.debt
    // FONTS is `as const` and matched against a value; ONLY's union is named nowhere else; LOOSE's members are not kept, so
    // the type read off it is `string`; HOLDS's two rows; NAMES is declared `readonly string[]`
    expect(d.lists.list.filter(x => x.repo === 'engine').map(x => x.name).sort()).toEqual(['FONTS', 'HOLDS', 'HOLDS', 'LOOSE', 'NAMES', 'ONLY'])
  })

  it('counts an export live through a namespace import only where the importer reads it', () => {
    const dead = r.trees.NOW.dead
    // ns.ts: N.a and `typeof N.b` read, c not; two.ts: the test reads T.g alone, so h is dead and g is the tests' only
    expect(dead.deadExportList).toEqual(expect.arrayContaining(['packages/p/src/ns.ts:3 c', 'packages/p/src/two.ts:2 h']))
    expect(dead.deadExportList).not.toEqual(expect.arrayContaining(['packages/p/src/ns.ts:1 a']))
    expect(dead.deadExportList).not.toEqual(expect.arrayContaining(['packages/p/src/ns.ts:2 b']))
    expect(dead.deadExportList).not.toEqual(expect.arrayContaining(['packages/p/src/two.ts:1 g']))
  })

  it("reads a dynamic import's module object as a namespace: destructured, bound to a name, a member read off it", () => {
    const dead = r.trees.NOW.dead.deadExportList
    expect(dead).toEqual(expect.arrayContaining(['packages/p/src/three.ts:2 j', 'packages/p/src/four.ts:2 l', 'packages/p/src/five.ts:2 o']))
    for (const x of ['packages/p/src/three.ts:1 i', 'packages/p/src/four.ts:1 k', 'packages/p/src/five.ts:1 n', 'packages/p/src/six.ts:1 q', 'packages/p/src/six.ts:2 s']) expect(dead).not.toContain(x)
  })

  it('counts every export live where a namespace escapes whole, and lists each such import with why', () => {
    const dead = r.trees.NOW.dead
    // W is passed on whole, R re-exported whole: their exports live, each import listed
    for (const x of ['packages/p/src/whole.ts:1 d', 'packages/p/src/whole.ts:2 e', 'packages/p/src/re.ts:1 f']) expect(dead.deadExportList).not.toContain(x)
    expect(dead.wholeImports).toEqual([
      { from: 'packages/p/src/index.ts', line: 2, to: 'packages/p/src/whole.ts', why: 'a namespace passed on whole' },
      { from: 'packages/p/src/index.ts', line: 6, to: 'packages/p/src/re.ts', why: 'a namespace re-exported' },
      { from: 'tests/dyn.test.ts', line: 6, to: 'packages/p/src/six.ts', why: 'a dynamic import' },
    ])
  })
})

// The repository's own profile (census-profile.mjs): the debt areas the owner's measure reads are the prepare's and the
// typesetter's code, today's and the packages', and the package the two share, @readarxiv/text, where a table both read is held
// once: a list moved there from the engine or the typesetter is still theirs, and still counted.
describe("the repository's debt areas", () => {
  let root = ''
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'census-areas-'))
    const put = (path: string, text: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    put('package.json', JSON.stringify({ name: 'e3' }))
    put('packages/engine/src/a.ts', "export const DESIGNS = ['Figure', 'Table', 'Algorithm']\n")
    put('packages/typeset/src/b.ts', "export const WORDS = ['Mono', 'Courier', 'Typewriter']\n")
    put('packages/text/src/c.ts', "export const MOVED = ['Sans', 'Gothic', 'Grotesk']\n")
    put('packages/translate/src/d.ts', "export const OTHER = ['Times', 'Helvetica', 'Courier']\n")
    execFileSync('git', ['init', '-q'], { cwd: root })
    execFileSync('git', ['add', '-A'], { cwd: root })
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('counts a list held in @readarxiv/text in the headline, as one held in the engine or the typesetter', async () => {
    const { ENGINE_PROFILE } = await import('../../lab/release-check/census-profile.mjs')
    const { debtOf } = await import('../../lab/release-check/census.mjs')
    const scan = scanTree('engine', root, ENGINE_PROFILE)
    const files = [...scan.files].map(([path, f]) => ({ id: `engine:${path}`, repo: 'engine', path, f, scan }))
    const d = debtOf({ label: 'AFTER', scans: [scan], files })
    const headline = (name: string) => d.lists.list.find((l) => l.name === name)?.headline
    expect([headline('DESIGNS'), headline('WORDS'), headline('MOVED')]).toEqual([true, true, true])
    // (a package the two do not share is no debt area of theirs)
    expect(headline('OTHER')).toBe(false)
  })
})

// A template literal type over closed unions holds as few members as they do: a list declared of a union that holds one is a
// vocabulary (a face's change, `${Role}-${Slant}`); a template with an open part (`${string}`) holds any string and is open.
describe('a template of closed types is closed', () => {
  let root = ''
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'axt-census-template-'))
    const put = (path: string, text: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    put('packages/engine/package.json', JSON.stringify({ name: '@x/engine', type: 'module', exports: { '.': './src/index.ts' } }))
    put(
      'packages/engine/src/index.ts',
      [
        "export type Role = 'serif' | 'sans'",
        "export type Slant = 'italic' | 'upright'",
        `export type Change = Role | Slant | \`\${Role}-\${Slant}\``,
        `export type Loose = Role | \`\${string}-x\``,
        "export const FACED = new Set<string>(['serif', 'sans-italic', 'upright'] satisfies readonly Change[])",
        "export const LOOSE = new Set<string>(['serif', 'a-x', 'b-x'] satisfies readonly Loose[])",
        'export const faced = (c: Change, l: Loose): boolean => FACED.has(c) || LOOSE.has(l)',
        '',
      ].join('\n'),
    )
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))
  it('reads a list declared of a union of templates over closed unions as a vocabulary, and one with an open part as a list', async () => {
    const { ENGINE_PROFILE } = await import('../../lab/release-check/census-profile.mjs')
    const c = await census({ today: null, now: [scanTree('engine', root, ENGINE_PROFILE)] })
    expect(c.trees.NOW.debt.vocabularies.list.map((x) => [x.name, x.by])).toEqual([['FACED', 'declared of Change']])
    expect(c.trees.NOW.debt.lists.list.map((x) => x.name)).toEqual(['LOOSE'])
  })
})

describe('the history reading (DEFINITIONS.history)', () => {
  // each case one comment line of a package's source; `told` the lines read as history, `attribution` those read apart
  const read = (lines: string[]) => {
    const h = factsOf('packages/p/src/x.ts', `${lines.join('\n')}\nexport const x = 1\n`).history!
    const told = new Set([...h.todays, ...h.dated, ...h.named, ...Object.values(h.forms).flat()])
    return { told: [...told].sort((a, b) => a - b), attribution: h.attribution }
  }
  it('reads a map to the old engine: a line map, a file and its line, its paths, its commits, a port statement', () => {
    const { told } = read([
      '// layer2.mjs L2:3283-3893 and RUN:2022, TEX:120',
      '// a line rectangle (tex.mjs:269 texRects)',
      '// Ported from engine 065c1d973 run.mjs fillPage',
      '// Carried from the website own store, as it was at baf2083e0',
      '// (today/ink-units.mjs keptUnitsOf)',
      '// (src/pdf-reader/engine/view/links.mjs)',
      '// COPIED as it is from the engine sheet (abe884b5e)',
      '// carried from page to page in order: one map for the glyphs',
      "// a punctuation mark moved from after it (cite.sty's own)",
      '// the bytes taken from the store where they are in it',
      '// graphics-def 8d691483be, the version its driver states',
    ])
    expect(told).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
  it("reads 'today' without the 's where it names the old engine, never the word's ordinary use", () => {
    const { told } = read([
      '// laid as today draws it',
      '// where today decides them',
      "// the extension's today session says it",
      '// \\today in our compiles is the day arXiv printed',
      '// `today`: the ownership records the lab checks',
      '// `state`, what exists today: built or planned',
      '// held equal by tests/pdf-reader/locate-ink-today.test.ts',
      "// the last step's log, whatever the earlier passes' hold (BusyTeX's pipeline empties them today)",
      "// the original's own family. Today, measured against what arXiv's PDFs embed: Times → Nimbus Roman",
    ])
    expect(told).toEqual([1, 2, 3])
  })
  it('reads a document, a note or a piece of work that is not in this repository', () => {
    const { told } = read([
      '// (design-b §1.5, T25)',
      '// the host design A §1.1',
      '// (design §4.5 "Painting")',
      '// a unit kind, of the dump spec §2',
      '// engine-view-host §16',
      '// the redesign\'s design, §2.1',
      "// the compile move's B3",
      "// the reader's design §15",
      '// DESIGN §7.2, docs/route/design.md §3.4',
    ])
    expect(told).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
  it("reads a pull request's review, never the product's own `review` or an issue of the tracker", () => {
    const { told } = read([
      "// the original's anchor stays with it, #626's review",
      "// PR #620's re-review",
      '// the review of #490',
      '// whatever the width (the interface review)',
      "// drew it for two frames (the pin's wave-1 review)",
      '// the `review` faces are served for the web',
      '// (#636: 100 units were 199 requests)',
    ])
    expect(told).toEqual([1, 2, 3, 4, 5])
  })
  it('reads a lane, a triage, a part, a stage, a numbered ruling and an option by name, never a word of the code', () => {
    const { told } = read([
      "// (triage-1 B: 2608.16117v1-de p4's t11)",
      '// (L11 third round, gap 5)',
      "// lane L7's record",
      '// (lane style-wire, on the corpus)',
      "// (Part 3's interfaces)",
      '// (stage 1b states them)',
      "// lab option (i)'s frame share",
      '// a sentence lit with the one before (ruling 5)',
      "// the coordinator's R7: the network down",
      '// a design-performance item (Q7)',
      '// its lane cuts them by its own limits alone',
      '// evened by a size step in the first round',
      '// R1 of PDF-READER §18.72: no ordinary word',
    ])
    expect(told).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
  it('reads who decided, never an owner that is a part of the code', () => {
    const { told } = read([
      "// (the owner's ruling, docs/PDF-READER.md §18.13)",
      '// (the maintainer plans more interface languages)',
      '// a page that is arXiv\'s, as the owner decided',
      '// (his answer: the size never gives way to whole words)',
      '// is told to the owner (`refused`), who fails the page',
      '// asked of the owner (`contentOf(n)`)',
      "// the label stays the owner's, its group off",
    ])
    expect(told).toEqual([1, 2, 3, 4])
  })
  it("counts a licence's statement of third-party origin apart, never one of our own code's", () => {
    const { told, attribution } = read([
      '// Ported from reference/read-frog/src/x.ts@abc1234 (GPL-3.0), 2026-01-01, modified',
      '//',
      '// The conversion (cmykToRgb) is ported from pdfjs-dist 6.3.289 (Mozilla, Apache-2.0), src/core/colorspace.js, its',
      '// #toRgb, 2026-10-19, modified: one colour at a time into a clamped array, no buffer.',
      "// Ported from the website's prototype, 2026-10-06, as it stood",
    ])
    expect(attribution).toEqual([1, 3, 4])
    expect(told).toEqual([5])
  })
  it("reads no date inside a git ref's name, and a date beside it as a date", () => {
    const { told } = read([
      '// top alignment (exp-freeze-2026-10-07:experiments/pdf-bilingual/REPORT.md §4)',
      '// decided 2026-10-07 beside it',
    ])
    expect(told).toEqual([2])
  })
})

describe("the history reading: this repository's own names, a third party's files (DEFINITIONS.history)", () => {
  let root = ''
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'census-names-'))
    const put = (path: string, text: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    put('package.json', JSON.stringify({ name: 'e4', dependencies: { libx: '1.0.0' } }))
    put('.gitignore', 'node_modules\n')
    // a dependency's distribution: its build files, one of whose names this repository also holds (tools/lib.mjs)
    put('node_modules/libx/package.json', JSON.stringify({ name: 'libx' }))
    put('node_modules/libx/build/lib.worker.mjs', 'export {}\n')
    put('node_modules/libx/build/lib.mjs', 'export {}\n')
    put('tools/lib.mjs', 'export {}\n')
    // this repository's documents: a label given right after a bold rule, a part of it named, a table of stages
    put(
      'docs/DESIGN.md',
      [
        '# Design',
        '## 16. The prepare',
        '**The marked compile is the pass loop** (Q1, the lab design): the files carried in (`carried`, Q1\'s option (i)).',
        '**A marked request that dies is asked once more, reduced** (Q2; `reduce`).',
        '**Over the 88** (stage 1a, a lane of the lab): every object the same.',
        '',
      ].join('\n'),
    )
    put(
      'docs/route/notes.md',
      ['## 7. Versions, stages', '', '| Stage | Scope |', '|---|---|', '| 1 (built) | the ledger |', '| 2 (built) | ink units |', '| 5 (built) | figure text |', ''].join('\n'),
    )
    // a file that cites both documents, and one that cites none
    put(
      'packages/p/src/a.ts',
      [
        "// the pass loop (DESIGN §16's Q1)",
        '// asked once more without the optional classes (Q2)',
        '// carried into pass 1 (option (i) of Q1)',
        '// a folio: stage 2 brackets them (notes.md §7)',
        "// a folio: the lab plan's stage 3 (notes.md §7)",
        "// the worker's Glyph (lib.worker.mjs:32428-32439): the library's contract",
        '// a line rectangle (tex.mjs:269 texRects)',
        "// the run (Q7, the lab's performance design)",
        "// the old reader's parse (lib.mjs:12)",
        '// (docs/route/notes.md stage 5)',
        "// a page's figure texts (the content class `figures`, docs/route/notes.md",
        '// stage 5), each drawn in its translation',
        '// a gate, which must count none (stage 1a fails a paper with one; DESIGN §16)',
        'export const a = 1',
        '',
      ].join('\n'),
    )
    put('packages/p/src/b.ts', ['// the pass loop (Q1, convergeThenMark)', '// built for the right pane first (stage 2, deliverable 7)', 'export const b = 1', ''].join('\n'))
    execFileSync('git', ['init', '-q'], { cwd: root })
    execFileSync('git', ['add', '-A'], { cwd: root })
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))
  const told = async (path: string) => {
    const { ENGINE_PROFILE } = await import('../../lab/release-check/census-profile.mjs')
    const h = scanTree('engine', root, ENGINE_PROFILE).files.get(path)!.history!
    return [...new Set([...h.todays, ...h.dated, ...h.named, ...Object.values(h.forms).flat()])].sort((a, b) => a - b)
  }
  it('reads no name a document of this repository defines in a file that cites it, and every other as before', async () => {
    // Q1, Q2 and Q1's option (i) are DESIGN's labels, stages 2 and 5 rows of notes.md's table of stages (a stage named on the
    // line after the document's path too): this file cites both. Stage 3 and Q7 are no document's; a file that cites neither
    // document reads Q1 and stage 2 as the lab's. A stage named after a bold heading (DESIGN's stage 1a) is the lab's, cited
    expect((await told('packages/p/src/a.ts')).filter(l => l <= 5 || l >= 8)).toEqual([5, 8, 9, 13])
    expect(await told('packages/p/src/b.ts')).toEqual([1, 2])
  })
  it("reads no file a dependency distributes, cited by its line, as the old engine's; one this repository holds too stays", async () => {
    // lib.worker.mjs is libx's alone; tex.mjs is no dependency's; lib.mjs is libx's and this repository's (tools/lib.mjs)
    expect((await told('packages/p/src/a.ts')).filter(l => l >= 6 && l <= 9)).toEqual([7, 8, 9])
  })
})
