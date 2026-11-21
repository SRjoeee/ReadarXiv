// @vitest-environment node
// The same-code proof (lab/release-check/same-code.mjs, design-reduction §3e) on a repository written here: a JavaScript module
// behind a facade, made TypeScript as a typing lane makes it (the module renamed, its facade deleted, its importers pointed at
// it), then changes that are not the same code.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compareRefs, erasedOf, facadeOf, summaryOf, verdictOf } from '../../lab/release-check/same-code.mjs'

let dir = ''
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), text)
}
const git = (...a: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' })
const commit = (message: string) => {
  git('add', '-A')
  git('commit', '-q', '-m', message)
  return git('rev-parse', 'HEAD').trim()
}

const JS = `// the window's end
/** the bytes looked at, at most */
const WINDOW = 1024

/** the number after the last mark, or null */
export function lastOf(bytes, mark = 'end') {
  const text = String(bytes).slice(-WINDOW)
  const at = text.lastIndexOf(mark)
  return at < 0 ? null : Number(text.slice(at + mark.length).trim()) || null
}
export const LIMIT = 8_388_607
`
const TS = `// the window's end, typed
import type { Bytes } from './bytes.ts'
/** the bytes looked at, at most */
const WINDOW: number = 1024

/** the number after the last mark, or null */
export function lastOf(bytes: Bytes, mark: string = 'end'): number | null {
  const text = String(bytes).slice(-WINDOW)
  const at: number = text.lastIndexOf(mark)
  return at < 0 ? null : Number(text.slice(at + mark.length).trim()) || null
}
export const LIMIT = 8_388_607 satisfies number
`
const FACADE = `// The types of tail.mjs, each value re-exported with its type
// @ts-ignore: JavaScript, typed by this file alone
import * as tail_js from './tail.mjs'
export type Bytes = Uint8Array
export const lastOf = tail_js.lastOf as (b: Bytes, mark?: string) => number | null
export const LIMIT = tail_js.LIMIT as number
`

let base = ''
let typed = ''
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'same-code-'))
  git('init', '-q')
  write('packages/engine/src/tail.mjs', JS)
  write('packages/engine/src/tail.types.ts', FACADE)
  write('packages/engine/src/bytes.ts', 'export type Bytes = Uint8Array\n')
  write('packages/engine/src/use.ts', "import { lastOf, LIMIT } from './tail.types.ts'\nexport const read = (b: Uint8Array) => Math.min(lastOf(b) ?? 0, LIMIT)\n")
  write('tests/use.test.ts', "import { lastOf } from '../packages/engine/src/tail.types.ts'\nlastOf(new Uint8Array())\n")
  write('docs/x.md', 'one\n')
  base = commit('base')
  // the typing lane: the module made TypeScript, its facade deleted, its importers pointed at it; a comment and a doc changed
  git('mv', 'packages/engine/src/tail.mjs', 'packages/engine/src/tail.ts')
  write('packages/engine/src/tail.ts', TS)
  unlinkSync(join(dir, 'packages/engine/src/tail.types.ts'))
  write('packages/engine/src/use.ts', "// read through the typed module\nimport { lastOf, LIMIT } from './tail.ts'\nexport const read = (b: Uint8Array): number => Math.min(lastOf(b) ?? 0, LIMIT)\n")
  write('tests/use.test.ts', "import { lastOf } from '../packages/engine/src/tail.ts'\nlastOf(new Uint8Array() as Uint8Array)\n")
  write('docs/x.md', 'two\n')
  typed = commit('typed')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('erasure', () => {
  it('erases types, comments and white space, and nothing else', () => {
    expect(erasedOf(TS, 'tail.ts')).toBe(erasedOf(JS, 'tail.mjs'))
    expect(erasedOf('export type A = 1\nexport interface B { b: A }\n', 'a.ts')).toBe('')
    expect(erasedOf('export declare function f(): void\n', 'a.d.mts')).toBe('')
    // (an import whose names are all inline types keeps the module's load: under verbatimModuleSyntax it is code)
    expect(erasedOf("import { type A } from './a.ts'\nexport const b = 1\n", 'b.ts')).not.toBe(erasedOf('export const b = 1\n', 'b.mjs'))
    // (a class field a declaration only states is no code; one it declares is)
    expect(erasedOf('class K { declare x: number }\n', 'k.ts')).toBe(erasedOf('class K {}\n', 'k.mjs'))
    expect(erasedOf('class K { x!: number }\n', 'k.ts')).not.toBe(erasedOf('class K {}\n', 'k.mjs'))
  })
})

describe('a typing change', () => {
  it('is the same code file by file: the renamed module, the deleted facade, its importers mapped', () => {
    const rows = compareRefs(dir, base, typed)
    expect(rows.map(r => [r.old, r.new, r.verdict, r.role])).toEqual([
      ['docs/x.md', 'docs/x.md', 'not code', 'docs'],
      ['packages/engine/src/tail.mjs', 'packages/engine/src/tail.ts', 'same code', 'product'],
      ['packages/engine/src/tail.types.ts', null, 'same code', 'product'],
      ['packages/engine/src/use.ts', 'packages/engine/src/use.ts', 'same code', 'product'],
      ['tests/use.test.ts', 'tests/use.test.ts', 'same code', 'test'],
    ])
    expect(rows.find(r => r.old === 'packages/engine/src/tail.types.ts')?.facade).toBe('packages/engine/src/tail.ts')
    expect(summaryOf(rows)).toEqual({ judged: 3, same: 3, changed: 0, others: 1, notCode: 1 })
  })

  it('reads a transition path of the engine package (`@readarxiv/engine/today/<path>`) as the module it names, renamed', () => {
    const renames = new Map([['packages/engine/src/source/k.mjs', 'packages/engine/src/source/k.ts']])
    const at = (text: string) => ({ path: 'src/pdf-reader/engine/rules/k.mjs', text })
    const old = at("export { a } from '@readarxiv/engine/today/source/k.mjs'\n")
    expect(verdictOf(old, at("export { a } from '@readarxiv/engine/today/source/k.ts'\n"), renames).verdict).toBe('same code')
    // (another module, or the old path where the module was renamed, is other code)
    expect(verdictOf(old, at("export { a } from '@readarxiv/engine/today/source/j.ts'\n"), renames).verdict).toBe('code changed')
    expect(verdictOf(old, at("export { a } from '@readarxiv/engine/today/source/k.mjs'\n"), renames).verdict).toBe('code changed')
  })

  it('reads a facade only where it re-exports one module\'s values under their own names, none a `let`', () => {
    const module = (path: string) => (path.endsWith('tail.mjs') ? JS : path.endsWith('live.mjs') ? 'export let n = 1\nexport const bump = () => n++\n' : null)
    expect(facadeOf(FACADE, 'src/tail.types.ts', module)).toBe('src/tail.mjs')
    expect(facadeOf("import * as m from './tail.mjs'\nexport const later = m.lastOf\n", 'src/x.types.ts', module)).toBeNull()
    expect(facadeOf("import * as m from './tail.mjs'\nexport const lastOf = m.lastOf\nexport const two = 2\n", 'src/x.types.ts', module)).toBeNull()
    expect(facadeOf("import * as m from './live.mjs'\nexport const n = m.n\n", 'src/x.types.ts', module)).toBeNull()
  })
})

describe('changes that are not the same code', () => {
  it('names a changed operator with the first difference, and a module added or removed with its code', () => {
    const use = "// read through the typed module\nimport { lastOf, LIMIT } from './tail.ts'\nexport const read = (b: Uint8Array): number => Math.min(lastOf(b) ?? 0, LIMIT)\n"
    write('packages/engine/src/tail.ts', TS.replace('at < 0', 'at <= 0'))
    write('packages/engine/src/new.ts', 'export const two = 2\n')
    unlinkSync(join(dir, 'packages/engine/src/use.ts'))
    write('packages/engine/src/types-only.ts', 'export type T = number\n')
    try {
      const rows = compareRefs(dir, typed)
      const by = Object.fromEntries(rows.map(r => [r.new ?? r.old, r.verdict]))
      expect(by).toEqual({
        'packages/engine/src/new.ts': 'code added',
        'packages/engine/src/tail.ts': 'code changed',
        'packages/engine/src/types-only.ts': 'same code',
        'packages/engine/src/use.ts': 'code removed',
      })
      expect(rows.find(r => r.new === 'packages/engine/src/tail.ts')?.difference?.new).toContain('at<=0')
      expect(summaryOf(rows).changed).toBe(3)
    } finally {
      // (the tree as the commit holds it again, file by file)
      write('packages/engine/src/tail.ts', TS)
      write('packages/engine/src/use.ts', use)
      unlinkSync(join(dir, 'packages/engine/src/new.ts'))
      unlinkSync(join(dir, 'packages/engine/src/types-only.ts'))
      expect(git('status', '--porcelain')).toBe('')
    }
  })

  it('compares two files, the old one read where the new one stands', () => {
    const one = verdictOf({ path: '/a/tail.mjs', at: '/b/tail.ts', text: "import { x } from './x.mjs'\nexport const y = x\n" }, { path: '/b/tail.ts', text: "import { x } from './x.mjs'\nexport const y: number = x\n" })
    expect(one.verdict).toBe('same code')
    const two = verdictOf({ path: 'a.mjs', text: 'export const y = 1 // one\n' }, { path: 'a.mjs', text: '/* two */ export const y = 2\n' })
    // ('export const y=' is 15 bytes: the values differ at the 16th)
    expect(two).toMatchObject({ verdict: 'code changed', difference: { at: 15 } })
  })
})
