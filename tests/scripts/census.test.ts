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
    const text = "// Unicode's hyphens: U+002D, U+2010, U+2011\nexport const HYPHENS = ['-', '\u2010', '\u2011']\n// TeX's \\hbadness default\nexport const loose = (b: number) => b > 7\n"
    for (const t of [text, text.replace(/export /g, '')]) {
      const f = factsOf('src/engine/marks.ts', t)
      expect(f.lists?.[0]).toMatchObject({ name: 'HYPHENS', class: 'defined' })
      expect(f.thresholds?.find(x => x.raw === '7')).toMatchObject({ class: 'borderline', reason: true, cites: 'TeX' })
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
    expect(d.vocabularies.list.map(x => x.name)).toEqual(['KEYS', 'KINDS', 'STATE'])
    expect(d.lists.list.map(x => x.name)).toEqual(['NAMES'])
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
