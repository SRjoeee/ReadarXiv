// The licence contract (stage 7, lane L10): nothing the extension bundles or imports carries code ported from a GPL-3.0
// project — proved from the import graph of every extension entry point, and the workspace packages hold no port (they
// import nothing of src/: the boundary gate of `pnpm lint`). The only GPL-3.0 ports left in the repository are the website's
// (KEPT_FOR_WEBSITE: kept at the paths its Worker imports until its cut-over, #613), and the test fails if one more
// appears anywhere or if the extension comes to import one of them. The files of REPLACED were ported from Read Frog and
// KISS Translator and are replaced by code written from the product's own documents (docs/THIRD_PARTY.md). A port is found by the statement its header made of it: the words "ported from" followed by a GPL project's
// snapshot path or Read Frog's package, or the GPL-3.0 licence named in parentheses, in a comment that opens a line (a
// string in a test that spells such a header out, as tests/scripts/engine-boundary.test.ts does, is not a header).
//
// The language table is held to the codes it held when it was ported: `languages.json` was taken once, on 2026-11-07
// before the table was replaced, through the module's exports alone (`LANG_CODES` in order, `toBcp47` of each,
// `RTL_LANGUAGES`, `DEFAULT_LANG_CODE`):
//   pnpm -s tsx -e "import { LANG_CODES, RTL_LANGUAGES, DEFAULT_LANG_CODE, toBcp47 } from './src/config/languages'; …"
// The set of target languages is a product decision, kept; their names are read from Unicode CLDR
// (scripts/languages.ts).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node script, deliberately dependency-free and untyped (as tests/pdf-reader/engine-contract.test.ts reads it)
import { namedModulesOf, stylesheetModulesOf } from '../../scripts/check-boundary.mjs'
import { DEFAULT_LANG_CODE, LANG_CODES, RTL_LANGUAGES, toBcp47 } from '@/config/languages'
import TAKEN from './languages.json'

/** the files that were ported from a GPL-3.0 project (docs/THIRD_PARTY.md at rebuild/v2, da0059087) */
const REPLACED = [
  'src/providers/request/cancellation.ts',
  'tests/providers/request/cancellation.test.ts',
  'src/providers/thinking.ts',
  'src/core/renderer/skeleton.ts',
  'src/core/scheduler/title.ts',
  'src/core/scheduler/session.ts',
  'src/providers/prompt-file.ts',
  'src/providers/prompt-library.ts',
  'src/core/scheduler/lazy.ts',
  'src/styles/presets.css',
  'src/config/languages.ts',
  'src/core/floating/button.ts',
]

/**
 * Kept, unchanged and under their GPL-3.0 headers, at the paths the website's Worker (readarxiv-web, through its pin)
 * imports them from, each headed "Kept at this path for the website's Worker … until its cut-over; nothing in the extension
 * imports it" (#613). They are deleted at the website's cut-over to the packages, and this list with them; until then the
 * repository holds them under GPL-3.0. `gpl`: the file states a GPL-3.0 port (the other three are kept with them, frozen
 * copies of the same cut-over, docs/THIRD_PARTY.md "Kept for the website's Worker")
 */
const KEPT_FOR_WEBSITE: readonly { file: string; gpl: boolean }[] = [
  { file: 'src/providers/google-web.ts', gpl: true },
  { file: 'src/providers/request/retry-policy.ts', gpl: true },
  { file: 'src/providers/compat/microsoft.ts', gpl: true },
  { file: 'src/providers/http-errors.ts', gpl: false },
  { file: 'src/providers/compat/alignment.ts', gpl: false },
  { file: 'src/providers/compat/types.ts', gpl: false },
]
const KEPT_HEADER = /Kept at this path for the website's Worker[\s\S]{0,400}?until its cut-over/

/** the GPL-3.0 projects' snapshots and package, as a port statement names them */
const GPL_SOURCE = String.raw`(?:reference\/(?:kiss-translator|read-frog|fluent-?read)\b|@read-frog\/)`
const PORT = new RegExp(String.raw`\bported\b.{0,240}?${GPL_SOURCE}|\(GPL-3\.0\)`, 'i')
const CODE = /\.(?:[cm]?[jt]sx?|css|html?)$/

/** a file's comments that open a line (a `//` line, or a block comment from a line that opens with it to its end), markers
 *  off, joined into one line: a statement wrapped over lines reads whole */
function commentText(text: string) {
  const out: string[] = []
  let inBlock = false
  for (const line of text.split('\n')) {
    if (inBlock) {
      out.push(line.replace(/^\s*\*+(?!\/)/, ''))
      if (line.includes('*/')) inBlock = false
    } else if (/^\s*\/\//.test(line)) out.push(line.replace(/^\s*\/\/+/, ''))
    else if (/^\s*\/\*/.test(line)) {
      out.push(line.replace(/^\s*\/\*+/, ''))
      inBlock = !line.slice(line.indexOf('/*') + 2).includes('*/')
    }
  }
  return out.join(' ').replaceAll('*/', ' ').replace(/\s+/g, ' ')
}

/** whether a file states that it is ported from a GPL-3.0 project */
const carriesGplPort = (text: string) => PORT.test(commentText(text))

/** The aliases the build resolves (wxt's: `@/` and `~/` the source, `@@/` and `~~/` the root), and a stylesheet's root-relative URL, which is the package's (public/) */
const ALIASES: [string, string][] = [['@/', 'src/'], ['~/', 'src/'], ['@@/', ''], ['~~/', '']]
const RESOLVE = ['', '.ts', '.tsx', '.mts', '.mjs', '.js', '.css', '.json', '/index.ts', '/index.tsx', '/index.mjs', '/index.js']
const isFile = (path: string) => existsSync(path) && statSync(path).isFile()
/** A specifier's file in the repository; null for a package (bare name, `#imports`, a scheme) */
function placeOf(from: string, spec: string, css: boolean): string | null | undefined {
  const bare = spec.replace(/[?#].*$/s, '')
  if (bare === '' || /^[a-z][a-z0-9+.-]*:/i.test(bare)) return null
  const alias = ALIASES.find(([prefix]) => bare.startsWith(prefix))
  const local = alias ? alias[1] + bare.slice(alias[0].length)
    : bare.startsWith('./') || bare.startsWith('../') ? normalize(join(dirname(from), bare))
    : css && bare.startsWith('/') ? `public${bare}` : null
  if (local === null) return null
  const twins = /\.m?js$/.test(local) ? [local.replace(/\.js$/, '.ts'), local.replace(/\.js$/, '.tsx'), local.replace(/\.mjs$/, '.mts')] : []
  const found = [...RESOLVE.map(ext => local + ext), ...twins].find(isFile)
  if (found !== undefined) return found
  // a stylesheet's bare `@import "tailwindcss"` (read as ./tailwindcss) is the package of that name when no file is beside it
  const name = css && bare.startsWith('./') ? /^\.\/((?:@[\w.-]+\/)?[\w.-]+)/.exec(bare)?.[1] : undefined
  return name && existsSync(join('node_modules', name)) ? null : undefined
}
/**
 * Every file the entries reach: a code file by every module it names (static, dynamic, type, `new URL`), a stylesheet by
 * its `@import`s and `url()`s; packages are not followed (the workspace packages import nothing of src/, the boundary
 * gate). What it cannot place — a computed specifier, a path to no file — is returned, for the test to fail on
 */
function reach(entries: string[]) {
  const seen = new Set<string>()
  const unplaced: string[] = []
  const todo = [...entries]
  while (todo.length > 0) {
    const file = todo.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    const css = file.endsWith('.css')
    if (!css && !/\.(?:[cm]?[jt]sx?)$/.test(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const { spec, display } of (css ? stylesheetModulesOf(text) : namedModulesOf(text)) as { spec: string | null; display?: string }[]) {
      if (spec === null) { unplaced.push(`${file}: ${display}`); continue }
      const found = placeOf(file, spec, css)
      if (found === undefined) unplaced.push(`${file}: ${spec}`)
      else if (found !== null) todo.push(found)
    }
  }
  return { files: [...seen], unplaced }
}

const tracked = execFileSync('git', ['ls-files', '-z', 'src', 'packages', 'tests'], { encoding: 'utf8' }).split('\0').filter(Boolean)

describe('no code ported from a GPL-3.0 project', () => {
  it('is how a port statement is found: in a comment, wrapped or not, and not in a string that spells one out', () => {
    expect(carriesGplPort('// Ported from reference/read-frog/src/a.ts@9b44f82 (GPL-3.0), 2026-09-05, modified\nexport const a = 1\n')).toBe(true)
    expect(carriesGplPort('/**\n * The rules below are ported from\n * reference/kiss-translator/src/a.js@c95bd46\n */\n.a { color: red }\n')).toBe(true)
    expect(carriesGplPort('// Ported from @read-frog/definitions@0.4.4: the tables\nexport const t = 1\n')).toBe(true)
    expect(carriesGplPort('/* A sheet.\n\n   Its rules are ported from\n   reference/kiss-translator/src/a.js@c95bd46 */\n.a { color: red }\n')).toBe(true)
    expect(carriesGplPort("    expect(states('// Ported from reference/read-frog/src/a.ts@9b44f82 (GPL-3.0)')).toBe(true)\n")).toBe(false)
    expect(carriesGplPort('// The CMYK conversion is ported from pdfjs-dist 6.3.289 (Mozilla, Apache-2.0)\n')).toBe(false)
    expect(carriesGplPort(' * - GNU FreeMono: GPL-3.0-or-later with the FSF font exception\n')).toBe(false)
  })

  it.each(REPLACED)('%s is not a port any more', file => {
    if (existsSync(file)) expect(carriesGplPort(readFileSync(file, 'utf8'))).toBe(false)
  })

  it('holds for every file of src/, packages/ and tests/ but the website\'s kept ones, and no other port appears', () => {
    const ported = tracked.filter(file => CODE.test(file) && existsSync(file) && carriesGplPort(readFileSync(file, 'utf8')))
    expect(ported.sort()).toEqual(KEPT_FOR_WEBSITE.filter(k => k.gpl && existsSync(k.file)).map(k => k.file).sort())
  })

  it('the walk places a stylesheet\'s imports: a file beside it, a package, and nothing it cannot place (#614)', () => {
    expect(placeOf('src/styles/ui.css', './modes.css', true)).toBe('src/styles/modes.css')
    expect(placeOf('src/styles/ui.css', '/icon/16.png', true)).toBe(isFile('public/icon/16.png') ? 'public/icon/16.png' : undefined)
    expect(placeOf('src/styles/ui.css', './tailwindcss', true)).toBeNull()
    expect(placeOf('src/styles/ui.css', './no-such-sheet.css', true)).toBeUndefined()
    expect(placeOf('src/core/a.ts', '@/core/scheduler/lazy', false)).toBe('src/core/scheduler/lazy.ts')
    expect(placeOf('src/core/a.ts', './no-such-module', false)).toBeUndefined()
    expect(reach(['src/styles/ui.css']).unplaced).toEqual([])
  })

  it('the website\'s kept files say what they are kept for and until when, in their header', () => {
    for (const { file } of KEPT_FOR_WEBSITE.filter(k => existsSync(k.file))) expect([file, KEPT_HEADER.test(readFileSync(file, 'utf8'))]).toEqual([file, true])
  })

  it('nothing the extension bundles or imports is one of them, or any other port: the import graph of every entry point', () => {
    // every code file under src/entrypoints is an entry WXT builds or is reached from one; the closure follows the aliases
    // and relative imports (scripts/check-boundary.mjs); the workspace packages it reaches by name import nothing of src/
    const entries = tracked.filter(file => file.startsWith('src/entrypoints/') && /\.(?:[cm]?[jt]sx?)$/.test(file) && !/\.d\.ts$/.test(file) && existsSync(file))
    expect(entries.length).toBeGreaterThan(20)
    const { files: closure, unplaced } = reach(entries)
    expect(closure.length).toBeGreaterThan(200)
    // a module the walk cannot place could be anything: none
    expect(unplaced).toEqual([])
    // stylesheets are read and followed too (#614): the walk reaches them
    expect(closure.some(file => file.endsWith('.css'))).toBe(true)
    const kept = new Set(KEPT_FOR_WEBSITE.map(k => k.file))
    expect(closure.filter(file => kept.has(file))).toEqual([])
    expect(closure.filter(file => CODE.test(file) && carriesGplPort(readFileSync(file, 'utf8')))).toEqual([])
    // the packages: no port in any of them
    expect(tracked.filter(file => file.startsWith('packages/') && CODE.test(file) && existsSync(file) && carriesGplPort(readFileSync(file, 'utf8')))).toEqual([])
  })

  it("is what docs/THIRD_PARTY.md says: no GPL-3.0 source among the extension's ported files, the website's kept ones apart", () => {
    const doc = readFileSync('docs/THIRD_PARTY.md', 'utf8')
    const sectionOf = (heading: string) => {
      const start = doc.indexOf(`\n## ${heading}`)
      expect(start, heading).toBeGreaterThan(0)
      const end = doc.indexOf('\n## ', start + 1)
      return doc.slice(start, end < 0 ? undefined : end)
    }
    expect(sectionOf('Ported files').match(new RegExp(`${GPL_SOURCE}|GPL-3\\.0`, 'gi')) ?? []).toEqual([])
    const kept = sectionOf("Kept for the website's Worker until its cut-over")
    expect(kept).toContain('the extension ships no GPL-3.0 code')
    for (const { file } of KEPT_FOR_WEBSITE.filter(k => existsSync(k.file))) expect([file, kept.includes(`\`${file}\``)]).toEqual([file, true])
  })
})

describe('the language table holds the codes it held', () => {
  it('the same target languages, in the same order', () => {
    expect([...LANG_CODES]).toEqual(TAKEN.codes)
  })
  it('each code the same BCP 47 tag', () => {
    expect(Object.fromEntries(LANG_CODES.map(code => [code, toBcp47(code)]))).toEqual(TAKEN.bcp47)
  })
  it('the same languages written right to left, and the same default', () => {
    expect(LANG_CODES.filter(code => RTL_LANGUAGES.has(code))).toEqual(TAKEN.rtl)
    expect(DEFAULT_LANG_CODE).toBe(TAKEN.default)
  })
})
