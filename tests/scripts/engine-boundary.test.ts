// The boundary gate's port and closure rules (scripts/check-boundary.mjs): what a file states of its origin, and which ported
// files the closure of an entry reaches (the licence of what a reader's build would carry: tests/pdf-reader/engine-contract.test.ts).
// Its rules for today's engine (src/pdf-reader/engine) went with that engine at the cut-over. Every case is a small tree
// written in a temporary directory, so that the rule is judged on what it is given.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  closureOf,
  PORT_STATEMENT,
  portedInClosure,
  statesPort,
  // @ts-expect-error — a plain node script, deliberately dependency-free and untyped
} from '../../scripts/check-boundary.mjs'

const E = 'src/pdf-reader/engine'

const roots: string[] = []
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }) })
/** a tree of files written under a temporary root; returns the root and the tree's paths */
function tree(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'engine-boundary-'))
  roots.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return { root, files: Object.keys(files) }
}

describe('a port statement', () => {
  const states = (text: string) => PORT_STATEMENT.test(text.replace(/^[ \t]*(?:\/\/+|\/\*+|\*+\/?)/gm, '').replace(/\s+/g, ' '))
  it('is the web\'s R21, matched on the text with its comment markers off and its white space collapsed', () => {
    expect(PORT_STATEMENT.source).toBe(String.raw`\bported\s+from\s+(?:reference\/|@[a-z0-9][\w.-]*\/)`)
    expect(PORT_STATEMENT.flags).toBe('i')
    expect(states('// Ported from reference/read-frog/src/a.ts@9b44f82 (GPL-3.0), 2026-09-04, modified\n')).toBe(true)
    expect(states('// ported from @scope/pkg/dist/a.js\n')).toBe(true)
    expect(states('// the fallback once ported from Read Frog\'s crypto-polyfill is gone\n')).toBe(false)
  })
  it('is found by statesPort wherever it stands in a file, however it is wrapped or spaced', () => {
    for (const text of [
      "export const a = 1\n// Ported from reference/read-frog/src/utils/host/translate/api/google.ts@9b44f82 (GPL-3.0), 2026-09-04, modified:\nexport const b = 2\n",
      '// The queue below is ported\n// from reference/read-frog/src/utils/request/request-queue.ts@9b44f82 (GPL-3.0)\nexport const q = 1\n',
      '/**\n * The batching below is ported from\n * reference/read-frog/src/utils/request/batch-queue.ts@9b44f82 (GPL-3.0)\n */\nexport const b = 1\n',
      '// Ported  from reference/read-frog/src/utils/request/retry-policy.ts@9b44f82 (GPL-3.0)\nexport const r = 1\n',
      "'use client'\n// Ported from reference/read-frog/src/utils/request/cancellation.ts@9b44f82 (GPL-3.0)\nexport const c = 1\n",
    ]) expect(statesPort(text), text).toBe(true)
    expect(statesPort("// the fallback once ported from Read Frog's crypto-polyfill is gone\nexport const a = 1\n")).toBe(false)
  })
  it('does not flag the file that holds the rule', () => {
    expect(statesPort(readFileSync('scripts/check-boundary.mjs', 'utf8'))).toBe(false)
  })
})

describe('portedInClosure: the licence of what an entry reaches', () => {
  const clean = 'export const a = 1\n'
  const ported = (head: string) => `${head}\nexport const p = 1\n`
  it('finds a ported file two hops inside the closure of view.mjs, wrapped across comment lines, mid-file, with a double space', () => {
    const t = tree({
      [`${E}/view.mjs`]: "export * from './view/outline.mjs'\n",
      [`${E}/view/outline.mjs`]: "import { w } from './wrapped.mjs'\nimport { m } from './mid.mjs'\nimport { d } from './double.mjs'\nimport { l } from './below.mjs'\nimport { c } from './clean.mjs'\nexport { w, m, d, l, c }\n",
      [`${E}/view/wrapped.mjs`]: ported('/**\n * The batching below is ported from\n * reference/read-frog/src/utils/request/batch-queue.ts@9b44f82 (GPL-3.0), 2026-09-05, modified.\n */'),
      [`${E}/view/mid.mjs`]: `export const before = 1\n// Ported from reference/read-frog/src/utils/host/translate/api/google.ts@9b44f82 (GPL-3.0)\n${clean}`,
      [`${E}/view/double.mjs`]: ported('// Ported  from reference/read-frog/src/utils/request/retry-policy.ts@9b44f82 (GPL-3.0)'),
      [`${E}/view/below.mjs`]: `'use client'\n${ported('// The queue is ported\n// from reference/read-frog/src/utils/request/request-queue.ts@9b44f82 (GPL-3.0)')}`,
      [`${E}/view/clean.mjs`]: clean,
    })
    expect(portedInClosure([`${E}/view.mjs`], { root: t.root })).toEqual([`${E}/view/below.mjs`, `${E}/view/double.mjs`, `${E}/view/mid.mjs`, `${E}/view/wrapped.mjs`])
  })
  it('counts an entry that states a port itself, and a file reached through an alias, a dynamic import or a stylesheet', () => {
    const t = tree({
      'src/a.mjs': `${ported('// Ported from reference/kiss-translator/src/a.js@abc1234 (GPL-3.0)')}`,
      'src/b.mjs': ported('// Ported from @scope/pkg/b.js'),
      'src/c.mjs': ported('// ported from reference/fluent-read/src/c.ts@abc1234'),
      'src/d.css': '/* Ported from reference/read-frog/src/styles/presets.css@9b44f82 (GPL-3.0) */\n.a { color: red }\n',
      'src/entry.mjs': "import { a } from '@/a.mjs'\nconst b = await import('./b.mjs')\nimport { c } from './c.mjs?x'\nimport './d.css?inline'\nexport { a, b, c }\n",
    })
    expect(portedInClosure(['src/entry.mjs'], { root: t.root })).toEqual(['src/a.mjs', 'src/b.mjs', 'src/c.mjs', 'src/d.css'])
    const own = tree({ 'src/own.mjs': ported('// Ported from reference/kiss-translator/src/a.js@abc1234 (GPL-3.0)') })
    expect(portedInClosure(['src/own.mjs'], { root: own.root })).toEqual(['src/own.mjs'])
  })
  it('does not see a ported file nothing in the closure imports, nor one only a type-only import names', () => {
    const t = tree({
      'src/entry.mjs': "import type { P } from './ported.mjs'\nexport type { P } from './ported.mjs'\nimport { a } from './clean.mjs'\nexport { a }\n",
      'src/ported.mjs': ported('// Ported from reference/read-frog/src/a.ts@9b44f82 (GPL-3.0)'),
      'src/other.mjs': ported('// Ported from reference/read-frog/src/b.ts@9b44f82 (GPL-3.0)'),
      'src/clean.mjs': clean,
    })
    expect(portedInClosure(['src/entry.mjs'], { root: t.root })).toEqual([])
  })
  it('stops at a package and at node: modules, follows a cycle once, and names an entry that is not there', () => {
    const t = tree({
      'src/a.mjs': "import { b } from './b.mjs'\nimport { z } from 'zod'\nimport fs from 'node:fs'\nexport const a = b\n",
      'src/b.mjs': "import { a } from './a.mjs'\nexport const b = a\n",
    })
    expect(portedInClosure(['src/a.mjs'], { root: t.root })).toEqual([])
    expect(() => portedInClosure(['src/absent.mjs'], { root: t.root })).toThrow(/src\/absent\.mjs/)
  })
  it('resolves a specifier the way the compiler does: an extension left off, an index file, a TypeScript source behind a .js name', () => {
    const t = tree({
      'src/entry.mjs': "import a from './dir'\nimport b from './b'\nimport c from './c.js'\nexport { a, b, c }\n",
      'src/dir/index.ts': ported('// Ported from reference/read-frog/src/a.ts@9b44f82'),
      'src/b.ts': ported('// Ported from reference/read-frog/src/b.ts@9b44f82'),
      'src/c.ts': ported('// Ported from reference/read-frog/src/c.ts@9b44f82'),
    })
    expect(portedInClosure(['src/entry.mjs'], { root: t.root })).toEqual(['src/b.ts', 'src/c.ts', 'src/dir/index.ts'])
  })
})

describe('closureOf', () => {
  it('is the entries and every file their value imports reach, resolved to files, once each', () => {
    const t = tree({
      'src/a.mjs': "import './b.mjs'\nimport { c } from '@/c'\nexport const a = c\n",
      'src/b.mjs': "import { a } from './a.mjs'\nexport const b = a\n",
      'src/c.ts': 'export const c = 1\n',
      'src/unrelated.mjs': 'export const u = 1\n',
    })
    expect([...closureOf(['src/a.mjs'], { root: t.root })].sort()).toEqual(['src/a.mjs', 'src/b.mjs', 'src/c.ts'])
  })
})
