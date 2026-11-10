// The workspace packages' boundary (scripts/check-boundary.mjs, PACKAGES): what a file under packages/<name> may import, and
// what its manifest may declare. Every case is a small tree written in a temporary directory, so that the rule is judged on
// what it is given and not on what the packages hold today; the last group reads the repository's own tree.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PACKAGES,
  packageFiles,
  packageViolations,
  // @ts-expect-error — a plain node script, deliberately dependency-free and untyped
} from '../../scripts/check-boundary.mjs'

type Violation = { file: string; spec: string; why: string }

const roots: string[] = []
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})
/** a tree of files written under a temporary root */
function tree(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'package-boundary-'))
  roots.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return { root, files: Object.keys(files) }
}
/** what the gate reports for a tree, as { file, spec } pairs */
function violations(files: Record<string, string>) {
  const t = tree(files)
  return (packageViolations(t.files, { root: t.root }) as Violation[]).map(v => ({ file: v.file, spec: v.spec }))
}
/** the specifiers of package `pkg`'s source file holding `text` that the gate refuses */
const refused = (pkg: string, text: string) => violations({ [`packages/${pkg}/src/x.ts`]: text }).map(v => v.spec)
const manifest = (pkg: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ name: `@readarxiv/${pkg}`, private: true, ...extra })

describe('the extension and the platform', () => {
  it('refuses the extension by every alias, and by a relative path out of the package', () => {
    expect(refused('engine', "import { a } from '@/core/sentences'\n")).toEqual(['@/core/sentences'])
    expect(refused('engine', "import { a } from '~/core/sentences'\n")).toEqual(['~/core/sentences'])
    expect(refused('engine', "import { a } from '@@/src/core/sentences'\n")).toEqual(['@@/src/core/sentences'])
    expect(refused('engine', "import { a } from '~~/src/core/sentences'\n")).toEqual(['~~/src/core/sentences'])
    expect(refused('engine', "import { a } from '../../../src/core/sentences.ts'\n")).toEqual([
      '../../../src/core/sentences.ts',
    ])
  })
  it('refuses WXT, its virtual modules and the extension API polyfill', () => {
    expect(refused('ui', "import { browser } from 'wxt/browser'\n")).toEqual(['wxt/browser'])
    expect(refused('ui', "import { defineConfig } from 'wxt'\n")).toEqual(['wxt'])
    expect(refused('ui', "import { x } from '@wxt-dev/storage'\n")).toEqual(['@wxt-dev/storage'])
    expect(refused('ui', "import { x } from '#imports'\n")).toEqual(['#imports'])
    expect(refused('ui', "import { x } from 'virtual:wxt-x'\n")).toEqual(['virtual:wxt-x'])
    expect(refused('ui', "import browser from 'webextension-polyfill'\n")).toEqual(['webextension-polyfill'])
  })
  it('counts a type-only import: a consumer resolves a type as it resolves a value', () => {
    expect(refused('format', "import type { Page } from '@/shared/messages'\n")).toEqual(['@/shared/messages'])
    expect(refused('format', "export type { Page } from '@/shared/messages'\n")).toEqual(['@/shared/messages'])
  })
  it('catches the other forms an import takes', () => {
    expect(refused('format', "import '@/a'\nexport * from '@/b'\n")).toEqual(['@/a', '@/b'])
    expect(refused('format', "const a = await import('@/c')\nconst b = require('@/d')\n")).toEqual(['@/c', '@/d'])
    expect(refused('format', 'const a = await import(name)\n')).toEqual(['import(name)'])
  })
  it('reads a comment as prose and a literal as a literal', () => {
    expect(refused('format', "// import { a } from '@/core/sentences'\n/* import '@/x' */\nexport const a = 1\n")).toEqual([])
  })
  it('judges a test file of a package like its source', () => {
    expect(violations({ 'packages/format/tests/x.test.ts': "import { a } from '@/core/sentences'\n" })).toEqual([
      { file: 'packages/format/tests/x.test.ts', spec: '@/core/sentences' },
    ])
  })
  it('judges a stylesheet by the files it names', () => {
    expect(violations({ 'packages/ui/src/x.css': "@import '../../../src/styles/tokens.css';\n" }).map(v => v.spec)).toEqual([
      '../../../src/styles/tokens.css',
    ])
    expect(violations({ 'packages/ui/src/x.css': "@import './tokens.css';\n" })).toEqual([])
  })
})

describe('the directions between packages', () => {
  const allowed = Object.entries(PACKAGES as Record<string, string[]>)
  const names = Object.keys(PACKAGES)

  it('lets each package import the packages the table names, by their entry', () => {
    for (const [pkg, deps] of allowed) {
      for (const dep of deps) expect(refused(pkg, `import { a } from '@readarxiv/${dep}'\n`)).toEqual([])
    }
  })
  it('refuses every pair the table does not name, and a package importing itself by name', () => {
    for (const [pkg, deps] of allowed) {
      for (const dep of names.filter(n => !deps.includes(n))) {
        expect(refused(pkg, `import { a } from '@readarxiv/${dep}'\n`)).toEqual([`@readarxiv/${dep}`])
      }
    }
  })
  it('holds the directions of the design: format, text and ui import nothing; the rest only downwards', () => {
    expect(PACKAGES).toEqual({
      format: [],
      text: [],
      engine: ['format', 'text'],
      typeset: ['format', 'text'],
      translate: ['text'],
      reader: ['format', 'typeset', 'text', 'ui'],
      ui: [],
    })
  })
  it('refuses a deep path into another package, whether by name or by a relative path', () => {
    expect(refused('engine', "import { a } from '@readarxiv/format/src/index.ts'\n")).toEqual([
      '@readarxiv/format/src/index.ts',
    ])
    expect(refused('engine', "import { a } from '@readarxiv/format/src/schema'\n")).toEqual([
      '@readarxiv/format/src/schema',
    ])
    expect(refused('engine', "import { a } from '../../format/src/index.ts'\n")).toEqual(['../../format/src/index.ts'])
  })
  it('refuses a package nobody listed', () => {
    expect(refused('engine', "import { a } from '@readarxiv/unlisted'\n")).toEqual(['@readarxiv/unlisted'])
  })
  it('says why', () => {
    const t = tree({ 'packages/format/src/x.ts': "import { a } from '@readarxiv/engine'\n" })
    const [v] = packageViolations(t.files, { root: t.root }) as Violation[]
    expect(v).toEqual({
      file: 'packages/format/src/x.ts',
      spec: '@readarxiv/engine',
      why: expect.stringContaining('format may import no other package'),
    })
  })
})

describe('what stays allowed', () => {
  it('lets a package import its own files, however it reaches them', () => {
    expect(refused('engine', "import { a } from './b.ts'\nimport { c } from '../tests/c'\nexport { d } from './d/index.ts'\n")).toEqual([])
    expect(violations({ 'packages/engine/tests/x.test.ts': "import { a } from '../src/index.ts'\n" })).toEqual([])
  })
  it('lets a package import node: modules and third-party packages', () => {
    expect(refused('engine', "import { readFile } from 'node:fs/promises'\nimport { z } from 'zod'\nimport { it } from 'vitest'\n")).toEqual([])
  })
})

describe('the tree and the manifests', () => {
  it('refuses a directory under packages/ that the table does not list', () => {
    expect(violations({ 'packages/stray/src/index.ts': 'export const a = 1\n' })).toEqual([
      { file: 'packages/stray/src/index.ts', spec: 'packages/stray' },
    ])
  })
  it('refuses a hand-written declaration file', () => {
    expect(violations({ 'packages/engine/src/a.d.ts': 'export declare const a: number\n' })).toEqual([
      { file: 'packages/engine/src/a.d.ts', spec: 'packages/engine/src/a.d.ts' },
    ])
  })
  it('refuses a manifest not named for its directory', () => {
    expect(violations({ 'packages/engine/package.json': JSON.stringify({ name: '@readarxiv/other' }) })).toEqual([
      { file: 'packages/engine/package.json', spec: '@readarxiv/other' },
    ])
  })
  it('refuses a manifest that depends on a package the table forbids, or on WXT', () => {
    const dependencies = { '@readarxiv/reader': 'workspace:*', '@readarxiv/format': 'workspace:*' }
    expect(violations({ 'packages/engine/package.json': manifest('engine', { dependencies }) })).toEqual([
      { file: 'packages/engine/package.json', spec: '@readarxiv/reader' },
    ])
    expect(violations({ 'packages/ui/package.json': manifest('ui', { devDependencies: { wxt: '^0.21.4' } }) })).toEqual([
      { file: 'packages/ui/package.json', spec: 'wxt' },
    ])
  })
  it('lets a manifest depend on the packages the table names and on third parties', () => {
    const dependencies = { '@readarxiv/format': 'workspace:*', '@readarxiv/text': 'workspace:*', zod: '^4.5.4' }
    expect(violations({ 'packages/engine/package.json': manifest('engine', { dependencies }) })).toEqual([])
  })
  it('leaves the files outside packages/ to the other rules', () => {
    expect(violations({ 'src/core/a.ts': "import { x } from '@/ui/strings'\n", 'packages/README.md': 'x\n' })).toEqual([])
  })
})

describe('the repository\'s own packages', () => {
  it('hold no violation', () => {
    expect(packageViolations(packageFiles())).toEqual([])
  })
  it('are the ones the table lists, each with a manifest, an entry and a test', () => {
    const files = new Set<string>(packageFiles())
    for (const pkg of Object.keys(PACKAGES)) {
      expect(files.has(`packages/${pkg}/package.json`)).toBe(true)
      expect(files.has(`packages/${pkg}/src/index.ts`)).toBe(true)
      expect(files.has(`packages/${pkg}/tests/index.test.ts`)).toBe(true)
    }
  })
})
