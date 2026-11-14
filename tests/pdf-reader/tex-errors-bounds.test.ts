// @vitest-environment node
// A compile's TeX errors and the units they stand in (packages/engine/src/compile/tex-errors.mjs) after the code change of the
// typing lane T6, held to the module before it (helpers/tex-errors-before.mjs, 4ad80aac5 verbatim but its import), value for value:
// the file's bytes read latin-1 by the engine's one latin1 (bounded-reads.ts: slices of 8192 bytes by Reflect.apply) where its own
// copy read them by String.fromCharCode.apply in slices of 32768, which a type checker refuses (a Uint8Array as apply's list). Held
// on logs written here (errors placed by a line of input, wrapped, raised by the output routine or a \write, a letter lost) and
// seeded ones, and on the units of seeded files of Latin-1 and UTF-8 bytes, lines long enough to cross both slices, errors whose
// context stands on their line, on another, or nowhere.
import { describe, expect, it } from 'vitest'
// @ts-expect-error: the module is JavaScript until its typing commit (no declaration in the package)
import { texErrors, unitsAtErrors } from '../../packages/engine/src/compile/tex-errors.mjs'
import { texErrors as texErrorsBefore, unitsAtErrors as unitsAtErrorsBefore } from './helpers/tex-errors-before.mjs'

/** a seeded generator (mulberry32) */
function seeded(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] as T }
}

const LOG_PARTS = [
  '! Undefined control sequence.\nl.12 \\foo\n            bar baz\n',
  '! Missing } inserted.\n<inserted text> \n                }\nl.30 ...the end of a line\n                          after it\n',
  '! LaTeX Error: Unicode character \u4e2d (U+4E2D)\n               not set up for use with LaTeX.\nl.7 Text with \u4e2d\n                 here\n',
  'Missing character: There is no ä (U+00E4) in font cmr10!\n',
  '! Missing character: There is no é (U+00E9) in font ec-lmr10!\nl.3 caf\n        é au lait\n',
  '! Paragraph ended before \\textbf was complete.\n<to be read again> \n                   \\par \nl.44 \n',
  '! Undefined control sequence.\n<output> {\\foo\n               }\nl.88 the page\n',
  '! Undefined control sequence.\n<write> \\bar\nl.9 x\n',
  '! Emergency stop.\n<*> main.tex\n',
  'This is pdfTeX, Version 3.141592653\n(./main.tex\nLaTeX2e <2025-06-01>\n',
  '! A message so long that TeX wraps it at seventy-nine columns and goes on on\nthe next line of the log.\nl.5 wrapped\n',
  'Overfull \\hbox (3.2pt too wide) in paragraph at lines 10--12\n',
]

describe('texErrors', () => {
  it('reads every log as before', () => {
    for (const p of LOG_PARTS) expect(texErrors(p), p).toEqual(texErrorsBefore(p))
    for (const x of [null, undefined, '']) expect(texErrors(x)).toEqual(texErrorsBefore(x))
    const r = seeded(5)
    for (let n = 0; n < 1500; n++) {
      const log = Array.from({ length: 1 + r.int(8) }, () => r.pick(LOG_PARTS)).join(r.pick(['', '\n']))
      expect(texErrors(log), log).toEqual(texErrorsBefore(log))
    }
  })
})

const WORDS = ['alpha', 'beta', 'caf\u00e9', 'na\u00efve', '\u4e2d\u6587', '\\textbf{bold}', '\\foo', 'x_1', '{', '}', '$a+b$', 'end.', '\u00e4\u00f6\u00fc', 'stra\u00dfe']
const latin1Bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)

describe('unitsAtErrors', () => {
  it('reads a line past both slices whole: an error whose context stands 40,000 bytes into its line is placed as before', () => {
    const line = Array.from({ length: 9000 }, (_, k) => `w${k}`).join(' ')
    const bytes = new TextEncoder().encode(`first line\n${line}\nlast line`)
    const at = line.indexOf('w8000 ')
    const errors = [{ message: 'm', line: 2, before: line.slice(at - 12, at), after: line.slice(at, at + 12) }]
    const units = [{ file: 'main.tex', unit: 'para', first: 2, last: 2, from: 11, to: 11 + line.length }, { file: 'main.tex', unit: 'other', first: 1, last: 3 }]
    const now = unitsAtErrors(errors, new Map([['main.tex', bytes]]), units)
    expect(now).toEqual(['para'])
    expect(now).toEqual(unitsAtErrorsBefore(errors, new Map([['main.tex', bytes]]), units))
  })

  it('places the errors on the same units as before, files of either encoding, lines across both slices', () => {
    const r = seeded(17)
    for (let n = 0; n < 600; n++) {
      // (a file of lines, some long enough to cross 8192 and 32768 bytes, in Latin-1 or UTF-8 bytes)
      const lines = Array.from({ length: 1 + r.int(12) }, () => Array.from({ length: 1 + (r.next() < 0.1 ? 4000 + r.int(9000) : r.int(12)) }, () => r.pick(WORDS)).join(' '))
      const text = lines.join('\n')
      const bytes = r.next() < 0.5 ? new TextEncoder().encode(text) : latin1Bytes(text)
      const files = new Map([['main.tex', bytes], ...(r.next() < 0.3 ? [['other.tex', bytes] as [string, Uint8Array]] : [])])
      // (units: a line range each, its byte range where spans give it, some nested in others)
      const units: { file: string; unit: number; first: number; last: number; from?: number; to?: number; post?: number }[] = []
      for (let u = 0; u < 1 + r.int(6); u++) {
        const first = 1 + r.int(lines.length), last = Math.min(lines.length, first + r.int(3))
        const from = r.int(bytes.length + 1), to = Math.min(bytes.length, from + r.int(200000))
        units.push(r.next() < 0.6 ? { file: r.pick(['main.tex', 'other.tex']), unit: u, first, last, from, to, ...(r.next() < 0.3 ? { post: r.int(4) } : {}) } : { file: 'main.tex', unit: u, first, last })
      }
      // (errors: a line, the text before and after a place on it, or on another, or none; a letter lost)
      const errors = Array.from({ length: 1 + r.int(4) }, () => {
        const line = 1 + r.int(lines.length + 1), at = lines[r.int(lines.length)] ?? ''
        const cut = r.int(at.length + 1)
        return { message: 'm', line, before: at.slice(Math.max(0, cut - r.int(20)), cut), after: at.slice(cut, cut + r.int(20)), ...(r.next() < 0.3 ? { char: r.pick([0xe4, 0xe9, 0x4e2d, 0xdf]) } : {}) }
      })
      expect(unitsAtErrors(errors, files, units), `seeded ${n}`).toEqual(unitsAtErrorsBefore(errors, files, units))
    }
  })
})
