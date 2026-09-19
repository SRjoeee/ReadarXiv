// `S` and `O` are live bindings (src/ui/strings.ts): `setLocale` swaps them, and an importer sees the swap because ES
// modules bind by reference. What does not see it is a value computed when a module loads — `const NAMES = { side:
// S.mode.side }` at the top of a file freezes the pack that happened to be current at import, and the interface stays
// half in the old language after a switch. The rule was a comment; this holds the sources to it: no read of `S` or
// `O` runs at module load. A read inside a function, a component or an instance member runs when it is called.
//
// Parsed with @babel/parser: the TypeScript package this project builds with (7, the native port) ships no parser
// for JavaScript to call.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parse } from '@babel/parser'
import { describe, expect, it } from 'vitest'

const SRC = resolve(import.meta.dirname, '../../src')
const STRINGS = join(SRC, 'ui/strings')
const LIVE = new Set(['S', 'O'])

type Node = { type: string; loc?: { start: { line: number } }; [key: string]: unknown }
const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && typeof (value as Node).type === 'string'

/** Does this import specifier name src/ui/strings, from a file in `dir` */
function namesStrings(specifier: string, dir: string): boolean {
  if (specifier.startsWith('@/') || specifier.startsWith('~/')) return join(SRC, specifier.slice(2)) === STRINGS
  return specifier.startsWith('.') && resolve(dir, specifier) === STRINGS
}

/** What puts off a read until something is called: a function of any kind, an instance member of a class */
function defers(node: Node): boolean {
  if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ObjectMethod|ClassMethod|ClassPrivateMethod|TSDeclareFunction)$/.test(node.type)) return true
  // A static member is initialised when the class is, which for a top-level class is module load
  return /^Class(Private)?Property$/.test(node.type) && node.static !== true
}

/** The lines of `source` where a live binding imported from ui/strings is read as the module loads */
function moduleLoadReads(source: string, file = join(SRC, 'ui/Example.tsx')): number[] {
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
  if (names.size === 0) return []
  const lines: number[] = []
  const visit = (node: Node, parent: Node | null, key: string, deferred: boolean): void => {
    // A type reads nothing at run time; an import declares the binding and reads nothing either
    if (node.type === 'ImportDeclaration' || (node.type.startsWith('TS') && !/^TS(AsExpression|SatisfiesExpression|NonNullExpression|TypeAssertion)$/.test(node.type))) return
    if (!deferred && node.type === 'Identifier' && names.has(node.name as string)) {
      // `x.S` and `{ S: 1 }` name a property, not the binding
      const property = parent !== null && !parent.computed && ((parent.type === 'MemberExpression' && key === 'property') || (parent.type === 'ObjectProperty' && key === 'key' && parent.shorthand !== true))
      if (!property && node.loc) lines.push(node.loc.start.line)
    }
    const inside = deferred || defers(node)
    for (const [childKey, value] of Object.entries(node)) {
      if (childKey === 'loc' || childKey.endsWith('Comments')) continue
      if (Array.isArray(value)) { for (const child of value) if (isNode(child)) visit(child, node, childKey, inside) }
      else if (isNode(value)) visit(value, node, childKey, inside)
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

describe('the live bindings S and O', () => {
  it('are read nowhere as a module loads', () => {
    const files = sources(SRC).filter(file => file !== `${STRINGS}.ts`)
    const importers = files.filter(file => /\bstrings'/.test(readFileSync(file, 'utf8')))
    // Finds its subjects, or it guards nothing: the popup, the settings page and the shared components all use them
    expect(importers.length).toBeGreaterThan(10)
    const reads = importers.flatMap(file => moduleLoadReads(readFileSync(file, 'utf8'), file).map(line => `${relative(SRC, file)}:${line}`))
    expect(reads, 'a value built from S or O at module load freezes the pack current at import (src/ui/strings.ts)').toEqual([])
  })

  describe('the detector', () => {
    const IMPORT = "import { O, S, languageName } from '@/ui/strings'\n"

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

    it('is not misled by a property of the same name, a type, or another export of the module', () => {
      expect(moduleLoadReads(`${IMPORT}const size = { S: 1, O: 2 }\nconst small = size.S\n`)).toEqual([])
      expect(moduleLoadReads(`${IMPORT}type Words = typeof S\nconst name = languageName('cmn')\n`)).toEqual([])
      expect(moduleLoadReads("import type { S } from '@/ui/strings'\nconst x = 1\n")).toEqual([])
    })

    it('follows the binding under another name, and a relative path to the same module', () => {
      expect(moduleLoadReads("import { S as words } from '@/ui/strings'\nconst title = words.primary.translate\n")).toEqual([2])
      expect(moduleLoadReads("import { S } from './strings'\nconst title = S.primary.translate\n", join(SRC, 'ui/Button.tsx'))).toEqual([2])
      // Another module that happens to be called strings is not this one
      expect(moduleLoadReads("import { S } from './strings'\nconst title = S.retry\n", join(SRC, 'core/Example.ts'))).toEqual([])
    })
  })
})
