#!/usr/bin/env node
// The platform boundary (ADR-0008): the core of the extension — `src/core`, `src/providers`, `src/cache` — is pure
// DOM, fetch and IndexedDB, so another host (a web reader, a test harness) can run it. It must not import the
// extension's platform layer: WXT / chrome.* wrappers, the entry points, the UI, the locale packs, the WXT-backed
// configuration store, or the runtime-messaging modules. Type-only imports are allowed (they compile away).
//
// **Every specifier is resolved before it is judged.** The first version matched `@/…` spellings only, and the
// adversarial review of 2026-09-13 put the deleted dependency back as `../../ui/strings` for a clean run: an alias
// (`@/`, `~/`, `@@/`, `~~/` — the four .wxt/tsconfig.json configures), a relative path and a bare module now all
// reach the same destination test, so a forbidden module cannot come back by being spelled differently.
//
// No parser: TypeScript 7 exposes none publicly, and a transitive Babel is not a dependency this repository declares.
// Comments and literals are removed by a small scanner, the import forms are matched tolerantly (compact syntax,
// re-exports, dynamic imports, require), and `tests/scripts/boundary.test.ts` pins every one of those forms.
// Erring strict: named imports that are all `type`-marked individually still count, because writing
// `import type { … }` says the same thing and reads better.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

/** The directories whose files must stay platform-free */
export const CORE = [/^src\/core\//, /^src\/providers\//, /^src\/cache\//]

/** Resolved destinations the core may not import: repo-relative module paths, and bare module names */
export const FORBIDDEN = [
  { under: 'src/config/storage', why: 'the WXT-backed configuration store' },
  { under: 'src/shared/messages', why: 'runtime messaging' },
  { under: 'src/shared/transport', why: 'runtime messaging' },
  { under: 'src/entrypoints', why: 'an entry point' },
  { under: 'src/ui', why: 'the UI layer' },
  { under: 'src/locales', why: 'the locale packs' },
  { under: 'wxt', why: 'WXT' },
  { under: 'webextension-polyfill', why: 'the extension API polyfill' },
]

/** The aliases .wxt/tsconfig.json configures, all pointing into the repository */
const ALIASES = [['@/', 'src/'], ['~/', 'src/'], ['@@/', ''], ['~~/', '']]
const EXACT = new Map([['@', 'src'], ['~', 'src'], ['@@', '.'], ['~~', '.']])

const dropExtension = p => p.replace(/\.(m|c)?[jt]sx?$/, '').replace(/\/index$/, '')

/** A specifier as the compiler resolves it: a repo-relative module path inside the repository, the bare name otherwise */
export function resolveSpecifier(fromFile, spec) {
  if (EXACT.has(spec)) return EXACT.get(spec)
  for (const [prefix, to] of ALIASES) {
    if (spec.startsWith(prefix)) return dropExtension(`${to}${spec.slice(prefix.length)}`)
  }
  if (spec.startsWith('./') || spec.startsWith('../')) {
    return dropExtension(relative('.', resolve(dirname(fromFile), spec)).split('\\').join('/'))
  }
  return dropExtension(spec)
}

/** The source with comments blanked out, so a specifier mentioned in prose is not read as an import */
export function withoutComments(text) {
  let out = ''
  let i = 0
  while (i < text.length) {
    const two = text.slice(i, i + 2)
    if (two === '//') {
      const end = text.indexOf('\n', i)
      i = end === -1 ? text.length : end
    } else if (two === '/*') {
      const end = text.indexOf('*/', i + 2)
      const skipped = text.slice(i, end === -1 ? text.length : end + 2)
      out += skipped.replace(/[^\n]/g, ' ')
      i = end === -1 ? text.length : end + 2
    } else {
      const ch = text[i]
      if (ch === '"' || ch === "'" || ch === '`') {
        // Copy the literal whole: a `//` or `/*` inside it starts no comment
        let j = i + 1
        while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1
        out += text.slice(i, Math.min(j + 1, text.length))
        i = j + 1
      } else {
        out += ch
        i += 1
      }
    }
  }
  return out
}

const STATIC = /(?:^|[\n;}])\s*(import|export)\b([\s\S]*?)from\s*(['"])([^'"]+)\3/g
const BARE_IMPORT = /(?:^|[\n;}])\s*import\s*(['"])([^'"]+)\1/g
const CALLED = /(?:\bimport|\brequire)\s*\(\s*(['"])([^'"]+)\1\s*\)/g

/** Every module a file imports for its **values**; type-only imports and exports are exempt */
export function valueImportsOf(text) {
  const src = withoutComments(text)
  const found = []
  for (const m of src.matchAll(STATIC)) {
    const clause = m[2]
    if (/^\s*type\b/.test(clause)) continue // `import type … from`, `export type … from`
    found.push(m[4])
  }
  for (const m of src.matchAll(BARE_IMPORT)) found.push(m[2])
  for (const m of src.matchAll(CALLED)) found.push(m[2])
  return found
}

/** The platform modules this core file reaches for; empty when it is clean */
export function platformImportsOf(file, text) {
  const out = []
  for (const spec of valueImportsOf(text)) {
    const target = resolveSpecifier(file, spec)
    const hit = FORBIDDEN.find(f => target === f.under || target.startsWith(`${f.under}/`))
    if (hit) out.push({ spec, target, why: hit.why })
  }
  return out
}

export const coreFiles = () => execFileSync('git', ['ls-files', '-z', 'src'], { encoding: 'utf8' })
  .split('\0')
  .filter(f => f && /\.(m|c)?tsx?$/.test(f) && CORE.some(re => re.test(f)))

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = coreFiles()
  const problems = files.flatMap(file => platformImportsOf(file, readFileSync(file, 'utf8')).map(({ spec, why }) => `${file}: imports ${spec} (${why})`))
  if (problems.length > 0) {
    console.error('The core imports the platform layer (ADR-0008 forbids it; inject the dependency instead):')
    for (const p of problems) console.error(`  ${p}`)
    process.exit(1)
  }
  console.log(`boundary check: ${files.length} core files import no platform module`)
}
