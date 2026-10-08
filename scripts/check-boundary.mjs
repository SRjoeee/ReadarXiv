#!/usr/bin/env node
// The platform boundary (DESIGN §4.2): the core of the extension — `src/core`, `src/providers`, `src/cache` — is pure
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
import { readFileSync, statSync } from 'node:fs'
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

/** A specifier's path inside the repository, before any extension or index file is read off it: the alias and relative
 *  forms; null for a package, a `node:` module and anything else */
function localPath(fromFile, spec) {
  if (EXACT.has(spec)) return EXACT.get(spec)
  for (const [prefix, to] of ALIASES) {
    if (spec.startsWith(prefix)) return `${to}${spec.slice(prefix.length)}`
  }
  if (spec.startsWith('./') || spec.startsWith('../')) return relative('.', resolve(dirname(fromFile), spec)).split('\\').join('/')
  return null
}

/** A specifier as the compiler resolves it: a repo-relative module path inside the repository, the bare name otherwise */
export function resolveSpecifier(fromFile, spec) {
  return dropExtension(localPath(fromFile, spec) ?? spec)
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

/** The reader's engine (src/pdf-reader/engine) is the contract the web imports. The web's build loads it through its pin, and
 *  a plain browser page loads it as it stands, so an engine file imports the engine, three modules of the core and
 *  nothing else: no package but the layout rules' validator (rules/), no module of the extension. Imports are judged by
 *  their destination, as the core's are: `@/core/sentences` and `../../core/sentences` are one module. `node:` modules and
 *  type-only imports are none of this rule's (the second compile away). */
export const ENGINE = /^src\/pdf-reader\/engine\//

/** The three modules of the core an engine file may import, by their path with no extension or index file (the
 *  placeholder wire's tokens, the sentence splitter, the figure-name test). Nothing deeper in the core: a sibling of one of
 *  them is another module. The closure of each is alias-free (a test holds it), so the web's pin and a plain page
 *  load it as the engine's own files */
export const ENGINE_ALLOW = ['src/core/sentences', 'src/core/protector/tokens', 'src/core/names']

/** The packages an engine file may import, by name and under which directory. The engine imports no PDF library: the
 *  layout maker is handed it (`PL`) */
export const ENGINE_PACKAGES = [{ name: 'zod', under: 'src/pdf-reader/engine/rules/' }]

/** The files of the engine that belong to the extension alone (Stage 5, Task 4b moves them out of the engine) and so still
 *  import what the rule forbids, and the modules outside it that Task 4b moves in; named, so that the lint stays green
 *  until then and the list is the work left. A test holds each entry to still being a violation: 4b empties both */
export const ENGINE_MOVE_OUT = ['src/pdf-reader/engine/session.mjs', 'src/pdf-reader/engine/engine.mjs']
export const ENGINE_MOVE_IN = ['src/cache/pdf-record']

/** Whether a violation is one that Task 4b's moves remove: a file of ENGINE_MOVE_OUT, or an import of ENGINE_MOVE_IN */
export const movesPending = v => ENGINE_MOVE_OUT.includes(v.file) || ENGINE_MOVE_IN.includes(resolveSpecifier(v.file, v.spec))

/** What a file states of its origin, the web's rule for its bundles: the words saying it was taken from a reference
 *  project or a scoped package, followed by the source's path. Matched against the text with its line-leading comment
 *  markers off and every run of white space made one space, so that a statement wrapped across comment lines, set mid-file,
 *  below a directive or with a double space is found too. A false positive is cured by rephrasing the prose */
export const PORT_STATEMENT = /\bported\s+from\s+(?:reference\/|@[a-z0-9][\w.-]*\/)/i
const normalise = text => text.replace(/^[ \t]*(?:\/\/+|\/\*+|\*+\/?)/gm, '').replace(/\s+/g, ' ')
/** Whether this text states that it is ported */
export const statesPort = text => PORT_STATEMENT.test(normalise(text))

/** a bare specifier's package: its first segment, or its first two when it is scoped; null for a relative path, an alias or `node:` */
function packageOf(spec) {
  // (the tolerant import matcher also reads quoted data that follows an `import … from`-shaped stretch of text: only a
  // specifier that is shaped as a package's is one)
  if (!/^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(?:\/[\w.-]+)*$/i.test(spec)) return null
  if (spec.startsWith('.') || spec.startsWith('node:') || ALIASES.some(([prefix]) => spec.startsWith(prefix)) || EXACT.has(spec)) return null
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

/** The packages this engine file imports (for their values) that its directory may not hold; empty when it is clean */
export function enginePackagesOf(file, text) {
  if (!ENGINE.test(file)) return []
  const out = []
  for (const spec of valueImportsOf(text)) {
    const name = packageOf(spec)
    if (name === null) continue
    if (!ENGINE_PACKAGES.some(p => p.name === name && file.startsWith(p.under))) out.push({ spec, name, why: 'a package in the engine, but the layout rules\' validator in rules/' })
  }
  return out
}

/** the `?inline` / `#hash` a bundler reads off a specifier */
const QUERY = /[?#].*$/s
const CODE = /\.(m|c)?[jt]sx?$/
const DECLARATION = /\.d\.(m|c)?ts$/
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.mjs', '.js', '/index.ts', '/index.tsx', '/index.mjs', '/index.js']
const isFile = (root, path) => { try { return statSync(resolve(root, path)).isFile() } catch { return false } }

/** What the engine files among `files` import that the engine may not: a package its directory may not hold, or a module
 *  that is neither in the engine nor one of ENGINE_ALLOW. Every file is read from `root` (the repository, by default) */
export function engineViolations(files, { root = '.' } = {}) {
  const out = []
  for (const file of files) {
    if (!ENGINE.test(file)) continue
    const text = readFileSync(resolve(root, file), 'utf8')
    for (const { spec, why } of enginePackagesOf(file, text)) out.push({ file, spec, why })
    for (const spec of valueImportsOf(text)) {
      const local = localPath(file, spec.replace(QUERY, ''))
      if (local === null) continue
      const target = dropExtension(local)
      if (ENGINE.test(`${target}/`) || ENGINE_ALLOW.includes(target)) continue
      out.push({ file, spec, why: `a module outside the engine, and not one of ${ENGINE_ALLOW.join(', ')}` })
    }
  }
  return out
}

/** The file a repository path names as the compiler finds it: the path itself, an extension added, an index file, a
 *  TypeScript source behind a `.js` name; null where there is none */
function sourceOf(path, root) {
  const bare = path.replace(QUERY, '')
  const twins = /\.m?js$/.test(bare) ? [bare.replace(/\.js$/, '.ts'), bare.replace(/\.js$/, '.tsx'), bare.replace(/\.mjs$/, '.mts')] : []
  return [bare, ...EXTENSIONS.map(e => bare + e), ...twins].find(c => isFile(root, c)) ?? null
}

/** The files `file` imports for their values that the repository holds: aliases and relative paths, no package */
function importsOf(file, root) {
  let text
  try { text = readFileSync(resolve(root, file), 'utf8') } catch { return [] }
  const out = []
  for (const spec of valueImportsOf(text)) {
    const local = localPath(file, spec.replace(QUERY, ''))
    const found = local === null ? null : sourceOf(local, root)
    if (found !== null) out.push(found)
  }
  return out
}

/** The entries and every file their value imports reach, once each. A stylesheet or a data file reached is in the closure
 *  and imports nothing; a package and a `node:` module are not in it. Throws for an entry the repository does not hold */
export function closureOf(entries, { root = '.' } = {}) {
  const seen = new Set()
  const todo = entries.map(entry => {
    const found = sourceOf(entry, root)
    if (found === null) throw new Error(`${entry}: no such file`)
    return found
  })
  while (todo.length > 0) {
    const file = todo.pop()
    if (seen.has(file)) continue
    seen.add(file)
    if (CODE.test(file)) todo.push(...importsOf(file, root))
  }
  return seen
}

/** The files in the closure of the entries that state they are ported (PORT_STATEMENT), sorted: the licence gate of what a
 *  reader's build would carry */
export function portedInClosure(entries, { root = '.' } = {}) {
  return [...closureOf(entries, { root })].filter(file => statesPort(readFileSync(resolve(root, file), 'utf8'))).sort()
}

const OUTSIDE = /^(?:src|tests|scripts|lab)\//
export const trackedFiles = (root = '.') => execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\0').filter(Boolean)

/** The engine's modules (code files, no declaration files) that nothing reaches: neither the closure of the entries, nor
 *  that of the gates, nor that of any file outside the engine, in src/, tests/, scripts/ or lab/, that imports an engine
 *  module (the extension's session, the labs' spikes, the tests). `files` is the repository's files, by default the ones git
 *  tracks. Throws for an entry or a gate the repository does not hold, so that a typo is not everything unreached */
export function unreached(entries, gates, { root = '.', files = trackedFiles(root) } = {}) {
  const modules = files.filter(f => ENGINE.test(f) && CODE.test(f) && !DECLARATION.test(f))
  const importers = files.filter(f => OUTSIDE.test(f) && !ENGINE.test(f) && CODE.test(f) && !DECLARATION.test(f) && importsOf(f, root).some(g => ENGINE.test(g)))
  const reached = closureOf([...entries, ...gates, ...importers], { root })
  return modules.filter(m => !reached.has(m)).sort()
}

export const coreFiles = () => execFileSync('git', ['ls-files', '-z', 'src'], { encoding: 'utf8' })
  .split('\0')
  .filter(f => f && /\.(m|c)?tsx?$/.test(f) && CORE.some(re => re.test(f)))

export const engineFiles = () => execFileSync('git', ['ls-files', '-z', 'src/pdf-reader/engine'], { encoding: 'utf8' })
  .split('\0')
  .filter(f => f && CODE.test(f) && !DECLARATION.test(f))

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = coreFiles()
  const problems = files.flatMap(file => platformImportsOf(file, readFileSync(file, 'utf8')).map(({ spec, why }) => `${file}: imports ${spec} (${why})`))
  if (problems.length > 0) {
    console.error('The core imports the platform layer (DESIGN §4.2 forbids it; inject the dependency instead):')
    for (const p of problems) console.error(`  ${p}`)
    process.exit(1)
  }
  console.log(`boundary check: ${files.length} core files import no platform module`)
  const engine = engineFiles()
  const found = engineViolations(engine)
  const unexpected = found.filter(v => !movesPending(v))
  if (unexpected.length > 0) {
    console.error(`The engine imports what it may not (an engine file imports the engine, ${ENGINE_ALLOW.join(', ')}, node: modules and, in rules/, the layout rules' validator):`)
    for (const v of unexpected) console.error(`  ${v.file}: imports ${v.spec} (${v.why})`)
    process.exit(1)
  }
  console.log(`boundary check: ${engine.length} engine files import only the engine, ${ENGINE_ALLOW.length} core modules and the layout rules' validator (${found.length} imports tolerated until Task 4b moves ${ENGINE_MOVE_OUT.map(f => f.split('/').pop()).join(', ')} out of the engine and ${ENGINE_MOVE_IN.join(', ')} into it)`)
}
