// The licence contract (stage 7, lane L10): no file of the extension, of its packages or of its tests carries code ported
// from a GPL-3.0 project, and the record of third-party code names none. The files below were ported from Read Frog and
// KISS Translator and are replaced by code written from the product's own documents (docs/THIRD_PARTY.md says what
// remains). A port is found by the statement its header made of it: the words "ported from" followed by a GPL project's
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
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
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

  it('holds for every file of src/, packages/ and tests/', () => {
    const ported = tracked.filter(file => CODE.test(file) && existsSync(file) && carriesGplPort(readFileSync(file, 'utf8')))
    expect(ported).toEqual([])
  })

  it("is what docs/THIRD_PARTY.md's ported files say: none from a GPL-3.0 source", () => {
    const doc = readFileSync('docs/THIRD_PARTY.md', 'utf8')
    const start = doc.indexOf('\n## Ported files')
    expect(start).toBeGreaterThan(0)
    const end = doc.indexOf('\n## ', start + 1)
    const section = doc.slice(start, end < 0 ? undefined : end)
    expect(section.match(new RegExp(`${GPL_SOURCE}|GPL-3\\.0`, 'gi')) ?? []).toEqual([])
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
