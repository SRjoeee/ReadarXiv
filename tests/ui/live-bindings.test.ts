// `S`, `O` and `R` are live bindings (@readarxiv/ui, packages/ui/src/strings.ts): `setLocale` swaps them, and an importer
// sees the swap because ES modules bind by reference. What does not see it is a value computed when a module loads —
// `const NAMES = { side: S.mode.side }` at the top of a file freezes the pack that happened to be current at import, and
// the interface stays half in the old language after a switch. The rule was a comment; this holds the sources to it: no
// read of `S`, `O` or `R` runs at module load. A read inside a function, a component or an instance member runs when it
// is called. The sources are the extension's, the package's own, and those of every package that may import it (the
// reader's, PACKAGES in scripts/check-boundary.mjs).
//
// Parsed with @babel/parser: the TypeScript package this project builds with (7, the native port) ships no parser
// for JavaScript to call.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parse } from '@babel/parser'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node script, deliberately dependency-free and untyped
import { PACKAGES } from '../../scripts/check-boundary.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const SRC = join(ROOT, 'src')
const UI = join(ROOT, 'packages/ui/src')
/** the module that makes the bindings, and the package's entry that hands them out */
const STRINGS = join(UI, 'strings')
const ENTRY = join(UI, 'index')
const LIVE = new Set(['S', 'O', 'R'])
/** the sources that may read them: the extension's, the package's, and every package's that PACKAGES lets import it */
const ROOTS = [SRC, UI, ...Object.entries(PACKAGES as Record<string, string[]>).filter(([, deps]) => deps.includes('ui')).map(([name]) => join(ROOT, 'packages', name, 'src'))].filter(dir => existsSync(dir))

type Node = { type: string; loc?: { start: { line: number } }; [key: string]: unknown }
const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && typeof (value as Node).type === 'string'

/** Does this import specifier name the catalogue's bindings, from a file in `dir`: the package by its name, or, inside it,
 *  its strings module or its entry by a relative path */
function namesStrings(specifier: string, dir: string): boolean {
  if (specifier === '@readarxiv/ui') return true
  // `./strings.ts` and `./strings` are one module
  const bare = specifier.replace(/\.(ts|tsx|js|jsx)$/, '')
  return bare.startsWith('.') && [STRINGS, ENTRY].includes(resolve(dir, bare))
}

/** What puts off a read until something is called: a function of any kind, an instance member of a class */
function defers(node: Node): boolean {
  if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ObjectMethod|ClassMethod|ClassPrivateMethod|TSDeclareFunction)$/.test(node.type)) return true
  // A static member is initialised when the class is, which for a top-level class is module load
  return /^Class(Private)?Property$/.test(node.type) && node.static !== true
}

/**
 * The lines of `source` where a live binding imported from the catalogue is read as the module loads; null when the
 * file imports none — told apart from "imports them and is clean", so the scan can count the files it really guards
 */
function moduleLoadReads(source: string, file = join(SRC, 'ui/Example.tsx')): number[] | null {
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }) as unknown as { program: Node & { body: Node[] } }
  const names = new Set<string>()
  for (const statement of ast.program.body) {
    if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue
    if (!namesStrings((statement.source as { value: string }).value, dirname(file))) continue
    for (const specifier of statement.specifiers as Node[]) {
      if (specifier.type !== 'ImportSpecifier' || specifier.importKind === 'type') continue
      const imported = specifier.imported as { name?: string; value?: string }
      if (LIVE.has(imported.name ?? imported.value ?? '')) names.add((specifier.local as { name: string }).name)
    }
  }
  if (names.size === 0) return null
  const lines: number[] = []
  const visit = (node: Node, parent: Node | null, key: string, deferred: boolean): void => {
    // A type reads nothing at run time; an import declares the binding and reads nothing either
    if (node.type === 'ImportDeclaration' || (node.type.startsWith('TS') && !/^TS(AsExpression|SatisfiesExpression|NonNullExpression|TypeAssertion)$/.test(node.type))) return
    // An export's list names bindings, the module's own or another's (`from`), and hands them on live: it reads none. What
    // it declares (`export const x = S.y`) is read as any declaration is
    if (node.type === 'ExportAllDeclaration') return
    if (node.type === 'ExportNamedDeclaration') {
      if (isNode(node.declaration)) visit(node.declaration, node, 'declaration', deferred)
      return
    }
    if (!deferred && node.type === 'Identifier' && names.has(node.name as string)) {
      // `x.S` and `{ S: 1 }` name a property, not the binding
      const property = parent !== null && !parent.computed && ((parent.type === 'MemberExpression' && key === 'property') || (parent.type === 'ObjectProperty' && key === 'key' && parent.shorthand !== true))
      if (!property && node.loc) lines.push(node.loc.start.line)
    }
    const inside = deferred || defers(node)
    for (const [childKey, value] of Object.entries(node)) {
      if (childKey === 'loc' || childKey.endsWith('Comments')) continue
      // `[S.x]() {}`: the member's body waits for a call, its computed key does not — it is evaluated as the class or
      // the object is, which at the top of a file is module load (Devin on #268)
      const state = childKey === 'key' && node.computed === true ? deferred : inside
      if (Array.isArray(value)) { for (const child of value) if (isNode(child)) visit(child, node, childKey, state) }
      else if (isNode(value)) visit(value, node, childKey, state)
    }
  }
  visit(ast.program, null, '', false)
  return [...new Set(lines)].sort((a, b) => a - b)
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [path] : []
  })
}

describe('the live bindings S, O and R', () => {
  it('are read nowhere as a module loads', () => {
    expect(ROOTS).toContain(join(ROOT, 'packages/reader/src'))
    const files = ROOTS.flatMap(sources).filter(file => file !== `${STRINGS}.ts`)
    const guarded: string[] = []
    const reads: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      // Only to save parsing what cannot import it. Deliberately loose — the word, not a way of writing the import:
      // nothing here enforces a quote style or forbids an extension, and a stricter filter would skip such a file
      // while the count below stayed green (Devin on #268)
      if (!source.includes('strings') && !source.includes('@readarxiv/ui')) continue
      const lines = moduleLoadReads(source, file)
      if (lines === null) continue
      guarded.push(relative(ROOT, file))
      reads.push(...lines.map(line => `${relative(ROOT, file)}:${line}`))
    }
    // Finds its subjects, or it guards nothing: counted by what the detector recognised as importing S, O or R — the
    // popup, the settings page, the reader and the shared components all do
    expect(guarded.length).toBeGreaterThan(10)
    // the reader's chrome among them, in its place in the reader's package: its toolbar, its menus, its capsule's states
    const chrome = guarded.filter(f => f.startsWith('packages/reader/src/chrome/'))
    expect(chrome).toEqual(expect.arrayContaining(['packages/reader/src/chrome/Toolbar.tsx', 'packages/reader/src/chrome/Menus.tsx', 'packages/reader/src/chrome/status.ts']))
    expect(chrome.length).toBeGreaterThan(10)
    expect(reads, 'a value built from S, O or R at module load freezes the pack current at import (packages/ui/src/strings.ts)').toEqual([])
  })

  describe('the detector', () => {
    const IMPORT = "import { O, S, LOCALES } from '@readarxiv/ui'\n"

    it('reports a table built at the top of a file, a static member, an alias and a JSX constant', () => {
      expect(moduleLoadReads(`${IMPORT}const NAMES = { side: S.mode.side }\n`)).toEqual([2])
      expect(moduleLoadReads(`${IMPORT}class Panel {\n  static title = O.nav.services\n}\n`)).toEqual([3])
      expect(moduleLoadReads(`${IMPORT}const pack = S\n`)).toEqual([2])
      expect(moduleLoadReads(`${IMPORT}const LABEL = <span>{S.primary.translate}</span>\n`)).toEqual([2])
    })

    it('lets through what runs when called: a component, a callback, a method, an instance member', () => {
      expect(moduleLoadReads(`${IMPORT}export function Row() { return <p>{S.rows.mode}</p> }\n`)).toEqual([])
      expect(moduleLoadReads(`${IMPORT}const label = () => O.nav.services\nconst tools = { name() { return S.primary.translate } }\n`)).toEqual([])
      expect(moduleLoadReads(`${IMPORT}class Panel {\n  title = S.primary.translate\n  words() { return O.nav.services }\n}\n`)).toEqual([])
    })

    it('lets through a binding handed on, from the module or from the catalogue, and reads what an export declares', () => {
      // (ui/strings hands the website the lookup it exported before the catalogue moved: the bindings, live)
      expect(moduleLoadReads(`${IMPORT}export { O, S, setLocale } from '@readarxiv/ui'\n`)).toEqual([])
      expect(moduleLoadReads(`${IMPORT}export { S, O as words }\nexport * from '@readarxiv/ui'\n`)).toEqual([])
      expect(moduleLoadReads(`${IMPORT}export const TITLE = S.primary.translate\n`)).toEqual([2])
      expect(moduleLoadReads(`${IMPORT}export function title() { return S.primary.translate }\n`)).toEqual([])
    })

    it('is not misled by a property of the same name, a type, or another export of the module', () => {
      expect(moduleLoadReads(`${IMPORT}const size = { S: 1, O: 2 }\nconst small = size.S\n`)).toEqual([])
      expect(moduleLoadReads(`${IMPORT}type Words = typeof S\nconst codes = Object.keys(LOCALES)\n`)).toEqual([])
      // Neither of these imports a live binding at all: not "clean", not counted as guarded
      expect(moduleLoadReads("import type { S } from '@readarxiv/ui'\nconst x = 1\n")).toBeNull()
      expect(moduleLoadReads("import { LOCALES } from '@readarxiv/ui'\nconst codes = Object.keys(LOCALES)\n")).toBeNull()
      // nor does the extension's own module of helpers, which holds none of them
      expect(moduleLoadReads("import { languageName } from '@/ui/strings'\nconst name = languageName('cmn')\n")).toBeNull()
    })

    it('a computed key is read where the class or the object is made, though the member\'s body waits for a call (Devin on #268)', () => {
      expect(moduleLoadReads(`${IMPORT}class Panel {\n  [S.primary.translate]() { return 1 }\n}\n`)).toEqual([3])
      expect(moduleLoadReads(`${IMPORT}class Panel {\n  [O.nav.services] = 1\n}\n`)).toEqual([3])
      expect(moduleLoadReads(`${IMPORT}const tools = {\n  [S.primary.translate]() { return 1 },\n}\n`)).toEqual([3])
      // The same members inside a function are made when it is called
      expect(moduleLoadReads(`${IMPORT}function make() {\n  return { [S.primary.translate]() { return 1 } }\n}\n`)).toEqual([])
      // A key that is not computed names a member, and its body still waits
      expect(moduleLoadReads(`${IMPORT}class Panel {\n  S() { return S.primary.translate }\n}\n`)).toEqual([])
    })

    it('however the import is written: double quotes, an extension (Devin on #268)', () => {
      expect(moduleLoadReads('import { S } from "@readarxiv/ui"\nconst title = S.primary.translate\n')).toEqual([2])
      expect(moduleLoadReads("import { S } from '../strings.ts'\nconst title = S.primary.translate\n", join(UI, 'controls/Button.tsx'))).toEqual([2])
    })

    it('follows the binding under another name, and a relative path to the same module or the entry', () => {
      expect(moduleLoadReads("import { R as words } from '@readarxiv/ui'\nconst title = words.zoom.value\n")).toEqual([2])
      expect(moduleLoadReads("import { S } from '../strings'\nconst title = S.primary.translate\n", join(UI, 'controls/Button.tsx'))).toEqual([2])
      expect(moduleLoadReads("import { O } from '../index.ts'\nconst title = O.nav.services\n", join(UI, 'controls/Button.tsx'))).toEqual([2])
      // Another module that happens to be called strings is not this one: nothing of ours is imported there
      expect(moduleLoadReads("import { S } from './strings'\nconst title = S.retry\n", join(SRC, 'core/Example.ts'))).toBeNull()
    })
  })
})
