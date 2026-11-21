// @vitest-environment node
// The kind a unit's or a member's reading option is decided by has one owner: format's toggleKind (the block its source ties it
// to, `of`, else its kind: a note of the author block follows the names option, the owner's ruling of 2026-11-13). Every site
// that tells whether the toggles show a unit or a member (the typesetter's `leave`, the reader's kindShown) reads a kind through
// it, so that a site written later cannot read a member's own kind for its class and leave a note of the block translated.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toggleKind } from '../../packages/format/src/index.ts'

const ROOT = resolve(__dirname, '../..')
/** the source files of the packages and the lab that lay a page or tell its classes, tests aside */
const sources = (): string[] => {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'tests' || e.name === 'dist') continue
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) walk(p)
      else if (/\.(?:ts|tsx|mts|mjs)$/.test(e.name) && !/\.d\.mts$/.test(e.name)) out.push(p)
    }
  }
  for (const d of ['packages/typeset/src', 'packages/reader/src', 'packages/reader/e2e', 'packages/engine/src/bundle', 'lab/typeset']) walk(d)
  return out
}
/** the calls `name(` in a file and their first argument's opening text */
const callsOf = (s: string, name: RegExp) => [...s.matchAll(name)].map((m) => s.slice((m.index as number) + m[0].length, (m.index as number) + m[0].length + 40))
/** the sites that read a kind that is a toggle kind already, each with why: a Person's kind slot, which the bundle states as its
 *  anchor member's toggleKind (bundle/names.ts); the composer's map of each row's toggleKind, written by toggleKind alone */
const ALLOWED: Record<string, RegExp> = {
  'packages/typeset/src/lay/named.ts': /^person\[1\]\)/,
  'packages/reader/src/compose/composer.ts': /^k, classes\)/,
}

describe('the kind the reading options read: toggleKind', () => {
  it('is the block a unit’s source ties it to, else its own kind', () => {
    expect(toggleKind({ kind: 'footnote', of: 'author' })).toBe('author')
    expect(toggleKind({ kind: 'footnote' })).toBe('footnote')
    expect(toggleKind({ kind: 'inknames' })).toBe('inknames')
  })
  it('is how every site that tells a toggle reads a unit’s or a member’s kind: `leave.has(`, `kindShown(`', () => {
    const astray: string[] = []
    for (const file of sources()) {
      const s = readFileSync(join(ROOT, file), 'utf8')
      const rel = relative(ROOT, join(ROOT, file))
      for (const arg of [...callsOf(s, /\bleave\.has\(/g), ...callsOf(s, /\bkindShown\(/g)]) {
        if (arg.startsWith('toggleKind(') || ALLOWED[rel]?.test(arg)) continue
        // (classes.ts defines kindShown, whose parameter is a toggle kind, and lists the kinds the toggles leave by it)
        if (rel === 'packages/reader/src/compose/classes.ts' && /^kind[,):]/.test(arg)) continue
        astray.push(`${rel}: ${arg}`)
      }
      // (and no site writes the rule out itself)
      if (/\bof\s*\?\?\s*[\w.]*kind\b/.test(s)) astray.push(`${rel}: writes \`of ?? kind\` out`)
    }
    expect(astray).toEqual([])
  })
  it('fills the composer’s map of toggle kinds by toggleKind alone', () => {
    const s = readFileSync(join(ROOT, 'packages/reader/src/compose/composer.ts'), 'utf8')
    const sets = callsOf(s, /\btoggleOf\.set\(/g)
    expect(sets.length).toBeGreaterThan(0)
    for (const arg of sets) expect(arg).toMatch(/^[\w.]+, toggleKind\(/)
  })
  it('states a person’s kind by toggleKind in the bundle', () => {
    const s = readFileSync(join(ROOT, 'packages/engine/src/bundle/names.ts'), 'utf8')
    expect(callsOf(s, /\bout\.persons\.push\(\[/g).every((a) => /^u\.id, toggleKind\(m\), k\]/.test(a))).toBe(true)
  })
})
