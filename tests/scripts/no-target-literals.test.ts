import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// After the rules-as-data migration no drawing module names a target: every value that differs by target is a field of the
// layout rule set, read from the run's parameters. A branch on a language's tag puts a typographic choice back in code, where
// a maintainer cannot see it, set it or version it (plan §2.4). Today's drawing modules (layer-proto/, with the one exception
// of its prototype's faces between their marked comments) went at the cut-over; the rule holds what moved into the package.

/** a comparison of a target with a string literal, on either side; `typeof target !== 'string'` compares a type, not a target */
const COMPARES = /(?<!typeof\s+)\b(?:to|target)\s*[!=]==?\s*['"`]|['"`]\s*[!=]==?\s*(?:to|target)\b/
/** the helpers that told a target's script or its CJK-ness by its name */
const BY_NAME = /\bCJK_TARGETS\b|\bscriptOfTarget\b|\bCJK_FAMILY\b|\bcjkFacesOf\b|\bcaptionNames\b|\bdefaultParams\b|\bPARAM_KEYS\b/
const BEGIN = '// target-literals: begin'
const END = '// target-literals: end'

/** the lines of a module that are code, one per line number: comments blanked, and the marked region of the prototype's faces */
function codeLines(text: string): string[] {
  let marked = false
  let inBlock = false
  return text.split('\n').map(line => {
    if (line.trim().startsWith(BEGIN)) { marked = true; return '' }
    if (line.trim().startsWith(END)) { marked = false; return '' }
    if (marked) return ''
    let out = ''
    for (let i = 0; i < line.length; i++) {
      if (inBlock) { if (line.startsWith('*/', i)) { inBlock = false; i++ } continue }
      if (line.startsWith('/*', i)) { inBlock = true; i++; continue }
      if (line.startsWith('//', i) && (i === 0 || /\s/.test(line[i - 1]!))) break
      out += line[i]
    }
    return out
  })
}
const violations = (file: string, text: string) => codeLines(text).flatMap((line, i) => (COMPARES.test(line) || BY_NAME.test(line) ? [`${file}:${i + 1}: ${line.trim().slice(0, 120)}`] : []))

/** the role table and the TeX patterns' reading as they moved into the engine package from today's rules/font-roles.mjs and
 *  layer-proto/hyph.mjs (deleted at the cut-over with the rest of layer-proto/): held by the same rule where they are */
const MOVED = ['packages/engine/src/fonts/font-roles.ts', 'packages/engine/src/fonts/hyph.ts']

describe('no drawing module names a target', () => {
  it('layer-proto/ and rules/font-roles.mjs compare no target with a string literal and tell no script or CJK-ness by a language\'s name', () => {
    const found = MOVED.flatMap(m => violations(m, readFileSync(m, 'utf8')))
    expect(found).toEqual([])
  })

  it('catches what it is written to catch, and lets a pattern language or a script pass', () => {
    const bad = (code: string) => violations('x.mjs', code).length
    expect(bad("const ko = to === 'ko'")).toBe(1)
    expect(bad("if (target !== 'zh-TW') f()")).toBe(1)
    expect(bad('const c = to == "ja"')).toBe(1)
    expect(bad("x = 'de' === to")).toBe(1)
    expect(bad('const cjk = CJK_TARGETS.has(to)')).toBe(1)
    expect(bad('const p = defaultParams(to)')).toBe(1)
    expect(bad("// to === 'ko' in a comment\n/* target === 'de' */\n/**\n * to === 'ru'\n */\nconst a = 1")).toBe(0)
    expect(bad("if (typeof target !== 'string') throw new TypeError('x')")).toBe(0)
    expect(bad("const url = 'https://x'; const a = 1 // to === 'ko'")).toBe(0)
    // (a pattern language and a script are no target: Khmelev's rules for Russian, the table's Cyrillic column)
    expect(bad("out = lang === 'ru' ? russian(word) : liang(word)")).toBe(0)
    expect(bad("const cyr = script === 'Cyrl' ? 1 : 0")).toBe(0)
  })
})
