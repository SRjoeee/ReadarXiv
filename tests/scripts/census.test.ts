// @vitest-environment node
// The complexity and debt census (lab/release-check/census.mjs): each number of its DEFINITIONS on a tree written here, small
// enough to count by hand. Two repositories: `engine` (an extension with an old arm its build switch cuts, an engine of
// .mjs behind a declaration, two translator clients, a ported file, a dead one, a copy in the lab) and `web`, which pins the
// first under vendor/ and imports one of its entries and one of its internals.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { alternativesOf, factsOf, lineKinds, scanTree, thresholdOf } from '../../lab/release-check/census-lib.mjs'
import { type Census, census, DEFINITIONS, headlineOf, numbersOf } from '../../lab/release-check/census.mjs'
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
  const engine = scanTree('engine', join(dir, 'engine'), ENGINE)
  const web = scanTree('web', join(dir, 'web'), WEB)
  c = await census({ today: null, now: [engine, web] })
})
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

  it('counts the engine\'s thresholds, lists, special cases and version constants', () => {
    const d = c.trees.NOW.debt
    // GAP 0.35 (evidence), 0.8 (no reason), 3 (Math.min): tuned; LIMIT borderline; PT_PER_IN a conversion; FLAGS an enumeration
    expect(d.thresholds.headline).toEqual({ conversion: 1, borderline: 1, tuned: 3, code: 3 })
    expect(d.thresholds.headlineTunedNoReason).toBe(2)
    expect(d.lists.list.map(l => [l.form, l.size])).toEqual([['list', 3], ['regex', 3]])
    expect(alternativesOf('\\b(?:Fig|Table|Eq)\\b')).toEqual(['Fig', 'Table', 'Eq'])
    expect(d.papers).toEqual([{ id: '2401.01234', at: 'src/engine/legacy.mjs:15' }])
    expect(d.texFiles).toEqual([{ name: 'subfigure.sty', at: 'src/engine/legacy.mjs:15' }])
    expect(d.versions.list).toEqual([{ name: 'PIPELINE_VERSION', value: '7', at: 'src/engine/legacy.mjs:3' }])
  })
})

describe('the graph', () => {
  it('finds the cycle, the chain and the ported file a build reaches', () => {
    const now = c.trees.NOW
    expect(now.graph.cycles).toMatchObject({ count: 1, modules: 2 })
    expect(now.chains.chains.map(x => [x.file, x.kinds])).toEqual([['src/new.ts', ['google', 'microsoft']]])
    expect(now.gpl).toEqual([{ file: 'src/ported.ts', code: 1, role: 'product', reachedBy: [{ build: 'engine/app', path: ['src/entrypoints/main.ts', 'src/new.ts', 'src/ported.ts'] }, { build: 'web/site', path: ['web:app/main.ts', 'src/new.ts', 'src/ported.ts'] }] }])
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
