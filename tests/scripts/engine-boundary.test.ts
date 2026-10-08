// The engine's boundary (scripts/check-boundary.mjs, ENGINE): what a file of src/pdf-reader/engine may import, which ported
// files its entries reach, and which of its modules nothing reaches. Every case is a small tree written in a temporary
// directory, so that the rule is judged on what it is given and not on what the engine holds today; the last group reads
// the repository's own tree for the three things that must stay true of it.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  closureOf,
  ENGINE,
  ENGINE_ALLOW,
  ENGINE_MOVE_IN,
  ENGINE_MOVE_OUT,
  ENGINE_PACKAGES,
  engineFiles,
  engineViolations,
  movesPending,
  PORT_STATEMENT,
  portedInClosure,
  resolveSpecifier,
  statesPort,
  unreached,
  valueImportsOf,
  // @ts-expect-error — a plain node script, deliberately dependency-free and untyped
} from '../../scripts/check-boundary.mjs'

type Violation = { file: string; spec: string; why: string }
const E = 'src/pdf-reader/engine'
/** the destination of a violation's import, repository-relative, without an extension */
const resolveFor = (v: Violation) => resolveSpecifier(v.file, v.spec) as string

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
/** the specifiers of the engine file `file` (holding `text`) that the rule refuses */
function violationsOf(text: string, file = `${E}/pipeline/x.mjs`) {
  const t = tree({ [file]: text })
  return (engineViolations([file], { root: t.root }) as Violation[]).map(v => v.spec)
}

describe('what an engine file may import', () => {
  it('refuses the extension\'s messaging by its alias, and the UI by a relative path', () => {
    expect(violationsOf("import { send } from '@/shared/messages'\n")).toEqual(['@/shared/messages'])
    expect(violationsOf("import { S } from '../../ui/strings'\n", `${E}/x.mjs`)).toEqual(['../../ui/strings'])
  })
  it('says why, and which file', () => {
    const t = tree({ [`${E}/x.mjs`]: "import { S } from '../../ui/strings'\n" })
    const [v] = engineViolations([`${E}/x.mjs`], { root: t.root }) as Violation[]
    expect(v).toEqual({ file: `${E}/x.mjs`, spec: '../../ui/strings', why: expect.stringContaining('src/core/sentences') })
  })
  it('lets src/core/sentences, src/core/protector/tokens and src/core/names through by a relative path, however the module is spelled', () => {
    expect(violationsOf("import { splitSentences } from '../../../core/sentences'\n")).toEqual([])
    expect(violationsOf("import { splitSentences } from '../../../core/sentences/index.ts'\n")).toEqual([])
    expect(violationsOf("import { toAlpha } from '../../../core/protector/tokens'\nimport { n } from '../../../core/protector/tokens.ts'\n")).toEqual([])
    expect(violationsOf("import { isName } from '../../../core/names'\nexport * from '../../../core/names.ts'\n")).toEqual([])
  })
  it('refuses an alias for its spelling, even to a module the engine may import or to the engine itself: only a bundler resolves it', () => {
    expect(violationsOf("import { toAlpha } from '@/core/protector/tokens'\n")).toEqual(['@/core/protector/tokens'])
    expect(violationsOf("import { toAlpha } from '~/core/protector/tokens.ts'\n")).toEqual(['~/core/protector/tokens.ts'])
    expect(violationsOf("import { a } from '@/pdf-reader/engine/layout/file.mjs'\n")).toEqual(['@/pdf-reader/engine/layout/file.mjs'])
    const t = tree({ [`${E}/x.mjs`]: "import { a } from '@/pdf-reader/engine/layout/file.mjs'\n" })
    expect((engineViolations([`${E}/x.mjs`], { root: t.root }) as Violation[])[0]?.why).toMatch(/alias/)
  })
  it('judges the destination of a relative path: a forbidden module is refused, however it is spelled', () => {
    expect(violationsOf("import { serialize } from '../../../core/protector/serialize'\n")).toEqual(['../../../core/protector/serialize'])
    expect(violationsOf("import { serialize } from '@/core/protector'\n")).toEqual(['@/core/protector'])
  })
  it('allows those three modules and no other of the core: a sibling of one is another module', () => {
    expect(violationsOf("import { x } from '../../../core/sentences/other'\n")).toEqual(['../../../core/sentences/other'])
    expect(violationsOf("import { x } from '../../../core/text'\n")).toEqual(['../../../core/text'])
    expect(violationsOf("import { x } from '../../../core/namesake'\n")).toEqual(['../../../core/namesake'])
  })
  it('lets the engine import itself, from any depth, and node: modules', () => {
    expect(violationsOf("import { a } from './a.mjs'\nimport { b } from '../layout/b.mjs'\nimport { c } from '../../../pdf-reader/engine/c.mjs'\n")).toEqual([])
    expect(violationsOf("import { readFileSync } from 'node:fs'\n", `${E}/node-files.mjs`)).toEqual([])
  })
  it('refuses the engine importing itself back out through its own directory\'s parent', () => {
    expect(violationsOf("import { a } from '../a.mjs'\n", `${E}/x.mjs`)).toEqual(['../a.mjs'])
    expect(violationsOf("import { controller } from '../controller'\n", `${E}/x.mjs`)).toEqual(['../controller'])
  })
  it('catches every form an import takes: re-exports, dynamic imports, require, a bare side-effect import', () => {
    expect(violationsOf("export * from '@/ui/strings'\n")).toEqual(['@/ui/strings'])
    expect(violationsOf("export { S } from '@/ui/strings'\n")).toEqual(['@/ui/strings'])
    expect(violationsOf("const s = await import('@/ui/strings')\n")).toEqual(['@/ui/strings'])
    expect(violationsOf("const s = require('@/ui/strings')\n")).toEqual(['@/ui/strings'])
    expect(violationsOf("import '@/ui/strings'\n")).toEqual(['@/ui/strings'])
  })
  it('reads a comment that names an import as no import', () => {
    expect(violationsOf("// import { S } from '@/ui/strings'\n/* import x from '@/shared/messages' */\nexport const a = 1\n")).toEqual([])
  })
  it('reads quoted data that the tolerant import matcher takes for a specifier as no import', () => {
    // as latex-front.mjs's tables: `export … from '`, a quote and a stretch of data up to the next quote
    expect(violationsOf("export const NAMES = [\n  ['title', 'comes from', true],\n  ['author', false],\n]\n")).toEqual([])
  })
  it('judges the engine alone: a file outside it is none of this rule\'s', () => {
    const t = tree({ 'src/core/x.ts': "import { S } from '@/ui/strings'\n", 'src/pdf-reader/session/y.mjs': "import { S } from '@/ui/strings'\n" })
    expect(engineViolations(['src/core/x.ts', 'src/pdf-reader/session/y.mjs'], { root: t.root })).toEqual([])
  })
})

describe('every way a module is named is judged: the rule is a whitelist', () => {
  it('refuses a specifier that is not a relative path, a node: module or an allowed package: a build setting\'s, a root-absolute path, a URL', () => {
    expect(violationsOf("import { browser } from '#imports'\n")).toEqual(['#imports'])
    expect(violationsOf("import { S } from '/src/ui/strings.ts'\n")).toEqual(['/src/ui/strings.ts'])
    expect(violationsOf("import { x } from 'https://example.com/x.js'\n")).toEqual(['https://example.com/x.js'])
    expect(violationsOf("export * from '#imports'\n")).toEqual(['#imports'])
    expect(violationsOf("import '#imports'\n")).toEqual(['#imports'])
    expect(violationsOf("const m = await import('/src/ui/strings.ts')\n")).toEqual(['/src/ui/strings.ts'])
  })
  it('judges a dynamic import written as a template literal, and refuses one whose specifier is computed', () => {
    expect(violationsOf("const m = await import(`../../../ui/strings.ts`)\n")).toEqual(['../../../ui/strings.ts'])
    expect(violationsOf("const m = await import(`./a.mjs`)\n")).toEqual([])
    expect(violationsOf("const m = await import(`./${name}.mjs`)\n")).toEqual(['import(`./${name}.mjs`)'])
    expect(violationsOf("const m = await import(name)\n")).toEqual(['import(name)'])
    expect(violationsOf("const m = require(path)\n")).toEqual(['require(path)'])
    expect(violationsOf("const m = await import(  'node:fs'  )\n")).toEqual([])
  })
  it('judges new URL(…, import.meta.url): it must stay inside the engine, and its path must be a literal', () => {
    expect(violationsOf("const u = new URL('../../../ui/strings.ts', import.meta.url)\n")).toEqual(['../../../ui/strings.ts'])
    expect(violationsOf("const u = new URL('./layout-rules.json', import.meta.url)\n", `${E}/rules/layout.mjs`)).toEqual([])
    expect(violationsOf("const u = new URL(path, import.meta.url)\n")).toEqual(['new URL(path, import.meta.url)'])
    // (a URL that is not made of the module's own address is the host's business, not a way into the engine)
    expect(violationsOf("const u = new URL(value)\nconst v = new URL(url, site)\n")).toEqual([])
  })
  it('judges a type-only import and a type-only export as it judges a value one: a consumer\'s build resolves it', () => {
    expect(violationsOf("import type { Provider } from '@/providers/types'\n")).toEqual(['@/providers/types'])
    expect(violationsOf("export type { Row } from '@/shared/messages'\n")).toEqual(['@/shared/messages'])
    expect(violationsOf("import type { S } from '../../../ui/strings'\n")).toEqual(['../../../ui/strings'])
    expect(violationsOf("import { type S } from '../../../ui/strings'\n")).toEqual(['../../../ui/strings'])
    expect(violationsOf("type T = import('@/ui/strings').S\n")).toEqual(['@/ui/strings'])
    expect(violationsOf("type T = typeof import('../../../ui/strings.ts')\n")).toEqual(['../../../ui/strings.ts'])
    expect(violationsOf("import type { A } from './a.mjs'\nexport type { B } from '../layout/b.mjs'\n")).toEqual([])
  })
  it('judges the declaration files and the TypeScript files of the engine as it judges its modules', () => {
    expect(violationsOf("import type { S } from '@/ui/strings'\n", `${E}/pipeline/x.d.mts`)).toEqual(['@/ui/strings'])
    expect(violationsOf("export { S } from '../../../ui/strings'\n", `${E}/pipeline/x.d.mts`)).toEqual(['../../../ui/strings'])
    expect(violationsOf("import type { A } from './a.mjs'\nexport declare const x: number\n", `${E}/pipeline/x.d.mts`)).toEqual([])
    expect(violationsOf("import type { ZodMiniType } from 'zod/mini'\n", `${E}/rules/layout.d.mts`)).toEqual([])
    expect(violationsOf("import type { ZodMiniType } from 'zod/mini'\n", `${E}/pipeline/x.d.mts`)).toEqual(['zod/mini'])
    expect(violationsOf("import { S } from '@/ui/strings'\n", `${E}/view/outline.ts`)).toEqual(['@/ui/strings'])
    expect(violationsOf("import { S } from '@/ui/strings'\n", `${E}/view/x.tsx`)).toEqual(['@/ui/strings'])
  })
  it('reads the form a statement has, not any text that holds `from` and a quote (a table\'s data is no import)', () => {
    expect(violationsOf("export const NAMES = [\n  ['title', 'comes from', true],\n  ['author', false],\n]\n")).toEqual([])
    expect(violationsOf("import {\n  a,\n  b,\n} from './ab.mjs'\nimport x, { y } from './xy.mjs'\nimport z, * as w from './zw.mjs'\nimport def from './def.mjs'\n")).toEqual([])
    expect(violationsOf("import{S}from'@/ui/strings'\nexport*from'#imports'\n")).toEqual(['@/ui/strings', '#imports'])
  })
  it('names every file of the repository\'s engine, the declaration files included', () => {
    const files = engineFiles() as string[]
    expect(files.some(f => f.endsWith('.d.mts'))).toBe(true)
    expect(files.some(f => f.endsWith('.ts') && !f.endsWith('.d.mts'))).toBe(true)
    expect(files.some(f => f.endsWith('.mjs'))).toBe(true)
  })
})

describe('the other ways an engine file reaches outside itself', () => {
  it('judges a triple-slash reference path like any specifier, and refuses a reference to types or a lib', () => {
    expect(violationsOf('/// <reference path="../../../ui/strings.d.ts" />\nexport declare const a: number\n', `${E}/pipeline/x.d.mts`)).toEqual(['../../../ui/strings.d.ts'])
    expect(violationsOf('/// <reference path="/src/ui/strings.d.ts" />\n', `${E}/pipeline/x.d.mts`)).toEqual(['/src/ui/strings.d.ts'])
    expect(violationsOf('/// <reference path="./a.d.mts" />\n/// <reference path="b.d.mts" />\n', `${E}/pipeline/x.d.mts`)).toEqual([])
    expect(violationsOf('/// <reference types="node" />\n', `${E}/pipeline/x.d.mts`)).toEqual(['/// <reference types="node" />'])
    expect(violationsOf('/// <reference lib="dom" />\n', `${E}/pipeline/x.d.mts`)).toEqual(['/// <reference lib="dom" />'])
    expect(violationsOf('/// <reference no-default-lib="true" />\n', `${E}/pipeline/x.d.mts`)).toEqual(['/// <reference no-default-lib="true" />'])
    // (the single-quoted form, a TypeScript file, and the directive's place among comments)
    expect(violationsOf("// a comment\n/// <reference types='vite/client' />\n", `${E}/view/outline.ts`)).toEqual(["/// <reference types='vite/client' />"])
  })
  it('refuses import.meta.glob and import.meta.resolve, whatever they are given', () => {
    expect(violationsOf("const files = import.meta.glob('./*.mjs')\n")).toEqual(["import.meta.glob('./*.mjs')"])
    expect(violationsOf("const f = import.meta.resolve('../../../ui/strings.ts')\n")).toEqual(["import.meta.resolve('../../../ui/strings.ts')"])
    expect(violationsOf("const f = import.meta.resolve('./a.mjs')\n")).toEqual(["import.meta.resolve('./a.mjs')"])
  })
  it('judges what a stylesheet of the engine imports or loads: @import and url() that leave it are refused', () => {
    const css = `${E}/view/engine.css`
    expect(violationsOf("@import url('../../../ui/x.css');\n.a { color: red }\n", css)).toEqual(['../../../ui/x.css'])
    expect(violationsOf('@import "https://example.com/y.css";\n', css)).toEqual(['https://example.com/y.css'])
    expect(violationsOf('.a { background: url(/fonts/a.woff2) }\n', css)).toEqual(['/fonts/a.woff2'])
    expect(violationsOf('@font-face { src: url("../../../x.woff") format("woff"), url(\'../../y.woff\') }\n', css)).toEqual(['../../../x.woff', '../../y.woff'])
    expect(violationsOf('@import "./b.css";\n.a { background: url(./a.png); mask: url(font.svg#m) }\n', css)).toEqual([])
    // (a data URL holds its own bytes, a fragment names an element of the document, a comment says nothing)
    expect(violationsOf('.a { background: url(data:image/png;base64,AAAA); filter: url(#blur) }\n/* @import "/x.css"; url(/y.png) */\n', css)).toEqual([])
    expect(violationsOf('.a { content: "url(not a call" }\n', css)).toEqual([])
  })
})

describe('the engine\'s packages', () => {
  it('refuses @cantoo/pdf-lib outside layout/, and in layout/ too: the layout maker is handed it as `PL`, it imports none', () => {
    expect(violationsOf("import * as PL from '@cantoo/pdf-lib'\n", `${E}/pipeline/x.mjs`)).toEqual(['@cantoo/pdf-lib'])
    expect(violationsOf("import * as PL from '@cantoo/pdf-lib'\n", `${E}/view/x.mjs`)).toEqual(['@cantoo/pdf-lib'])
    expect(violationsOf("import * as PL from '@cantoo/pdf-lib'\n", `${E}/layout/addon.mjs`)).toEqual(['@cantoo/pdf-lib'])
  })
  it('keeps the layout rules\' validator: zod in rules/ alone, as the rules-as-data plan allowed', () => {
    expect(ENGINE_PACKAGES).toEqual([{ name: 'zod', under: `${E}/rules/` }])
    expect(violationsOf("import * as z from 'zod/mini'\n", `${E}/rules/layout.mjs`)).toEqual([])
    expect(violationsOf("import * as z from 'zod/mini'\n", `${E}/layer-proto/run.mjs`)).toEqual(['zod/mini'])
  })
  it('refuses any other package, whatever it is, wherever it is', () => {
    expect(violationsOf("import PDF from 'pdfjs-dist'\n")).toEqual(['pdfjs-dist'])
    expect(violationsOf("const m = await import('lodash')\n", `${E}/rules/layout.mjs`)).toEqual(['lodash'])
  })
})

describe('the exported rule', () => {
  it('scopes to src/pdf-reader/engine/ and allows the three core modules by path', () => {
    expect(ENGINE.test(`${E}/mt.mjs`)).toBe(true)
    expect(ENGINE.test('src/pdf-reader/controller.ts')).toBe(false)
    expect(ENGINE_ALLOW).toEqual(['src/core/sentences', 'src/core/protector/tokens', 'src/core/names'])
  })
})

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

describe('unreached: the engine modules no entry and no gate reaches', () => {
  const engineTree = (extra: Record<string, string> = {}) => tree({
    [`${E}/view.mjs`]: "export * from './view/a.mjs'\n",
    [`${E}/view/a.mjs`]: "import { b } from './b.mjs'\nexport const a = b\n",
    [`${E}/view/b.mjs`]: 'export const b = 1\n',
    [`${E}/view/orphan.mjs`]: 'export const orphan = 1\n',
    [`${E}/view/orphan.d.mts`]: 'export declare const orphan: number\n',
    [`${E}/layout/gated.mjs`]: 'export const gated = 1\n',
    [`${E}/layout/used.mjs`]: 'export const used = 1\n',
    [`${E}/layout/typed.mjs`]: 'export const typed = 1\n',
    [`${E}/rules/data.json`]: '{}\n',
    'lab/pdf/spikes/gate.mjs': "import { gated } from '../../../src/pdf-reader/engine/layout/gated.mjs'\nconsole.log(gated)\n",
    ...extra,
  })
  const listing = (t: { root: string; files: string[] }) => ({ root: t.root, files: t.files })

  it('names a module no entry and no gate imports, and only that, beside none of the entry\'s own closure', () => {
    const t = engineTree()
    expect(unreached([`${E}/view.mjs`], ['lab/pdf/spikes/gate.mjs'], listing(t))).toEqual([`${E}/layout/used.mjs`, `${E}/layout/typed.mjs`, `${E}/view/orphan.mjs`].sort())
  })
  it('counts a module a gate imports as reached, whether or not the gate is in the listing', () => {
    const t = engineTree()
    const files = t.files.filter(f => f !== 'lab/pdf/spikes/gate.mjs')
    expect(unreached([`${E}/view.mjs`], ['lab/pdf/spikes/gate.mjs'], { root: t.root, files })).not.toContain(`${E}/layout/gated.mjs`)
    expect(unreached([`${E}/view.mjs`], [], { root: t.root, files })).toContain(`${E}/layout/gated.mjs`)
  })
  it('takes every file outside the engine, in src/ and lab/, that imports an engine module as a root too, and no test, script or parked file', () => {
    const t = engineTree({
      'src/pdf-reader/session/session.mjs': "import { used } from '../engine/layout/used.mjs'\nexport const s = used\n",
      'lab/pdf/layer-lab/lab.mjs': "import { orphan } from '../../../src/pdf-reader/engine/view/orphan.mjs'\nexport const l = orphan\n",
      'tests/pdf-reader/typed.test.ts': "import { typed } from '@/pdf-reader/engine/layout/typed.mjs'\nexport const t = typed\n",
      'scripts/make.mjs': "import { typed } from '../src/pdf-reader/engine/layout/typed.mjs'\nexport const m = typed\n",
      'parked/engine/x.mjs': "import { typed } from '../../src/pdf-reader/engine/layout/typed.mjs'\nexport const x = typed\n",
    })
    // (a module only a test, a script or parked code reaches is parked with its tests: unreached)
    expect(unreached([`${E}/view.mjs`], ['lab/pdf/spikes/gate.mjs'], listing(t))).toEqual([`${E}/layout/typed.mjs`])
  })
  it('follows an importer outside the engine to the engine modules it reaches in turn', () => {
    const t = engineTree({
      'src/pdf-reader/session/session.mjs': "import { helper } from './helper.mjs'\nexport const s = helper\n",
      'src/pdf-reader/session/helper.mjs': "import { used } from '../engine/layout/used.mjs'\nexport const helper = used\n",
    })
    expect(unreached([`${E}/view.mjs`], ['lab/pdf/spikes/gate.mjs'], listing(t))).not.toContain(`${E}/layout/used.mjs`)
  })
  it('reaches nothing through a type-only import, and counts neither declaration files nor data files as modules', () => {
    const t = engineTree({ 'src/pdf-reader/session/types.ts': "import type { typed } from '../engine/layout/typed.mjs'\nexport type T = typeof typed\n" })
    const out = unreached([`${E}/view.mjs`], ['lab/pdf/spikes/gate.mjs'], listing(t))
    expect(out).toContain(`${E}/layout/typed.mjs`)
    expect(out.some((f: string) => f.endsWith('.d.mts') || f.endsWith('.json'))).toBe(false)
  })
  it('names an entry or a gate that is not there, rather than calling everything unreached', () => {
    const t = engineTree()
    expect(() => unreached([`${E}/absent.mjs`], [], listing(t))).toThrow(/absent\.mjs/)
    expect(() => unreached([`${E}/view.mjs`], ['lab/absent.mjs'], listing(t))).toThrow(/lab\/absent\.mjs/)
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

// ---- the repository's own tree
describe('the repository\'s engine today', () => {
  it('has only the violations of the modules Task 4b moves out, named, and the one import of a module it moves in', () => {
    const found = engineViolations(engineFiles()) as Violation[]
    expect(found.filter(v => !movesPending(v))).toEqual([])
  })
  it('names in the move-out list only engine files that still violate, and in the move-in list only modules that are still imported', () => {
    const found = engineViolations(engineFiles()) as Violation[]
    for (const file of ENGINE_MOVE_OUT) expect(found.some(v => v.file === file), `${file} no longer violates: take it off the list`).toBe(true)
    for (const target of ENGINE_MOVE_IN) expect(found.some(v => resolveFor(v) === target), `${target} is no longer imported from the engine: take it off the list`).toBe(true)
  })
  it('has a closure behind the three core modules it may import that is alias-free and holds nothing but those three', () => {
    const allowed = new Set<string>()
    for (const module of ENGINE_ALLOW as string[]) for (const file of closureOf([module]) as Set<string>) allowed.add(file)
    for (const file of allowed) {
      for (const spec of valueImportsOf(readFileSync(file, 'utf8')) as string[]) expect(spec.startsWith('.'), `${file} imports ${spec}`).toBe(true)
      expect((ENGINE_ALLOW as string[]).includes(resolveSpecifier('src/x.ts', file)), `${file} is not one of the three`).toBe(true)
    }
    expect(allowed.size).toBe(3)
  })
})
