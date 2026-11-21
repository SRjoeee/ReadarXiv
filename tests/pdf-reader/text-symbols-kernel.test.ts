// @vitest-environment node
// packages/engine/src/source/text-symbols.ts TEXT_SYMBOLS held to its definition: each command's character is one LaTeX's own kernel
// gives it in each pinned TeX Live (lab/pdf/compile-images.json), read in its local image offline (`--pull never`; an image
// not on the machine, as on GitHub's runners, skips its year). The characters the kernel
// gives a command are the code points the encodings' UTF-8 declarations name it for (\DeclareUnicodeCharacter in t1enc.dfu,
// ts1enc.dfu, ot1enc.dfu, omsenc.dfu, utf8enc.dfu) and, for a symbol of printable ASCII, its slot in T1 or TS1
// (\DeclareTextSymbol in t1enc.def, ts1enc.def); a command neither names is read through latex.ltx's own definition of it: a
// \chardef, a \let, or a definition whose text branch (\else … \fi, or its whole body) is another command, a UTF-8
// declaration's body, or a character. A declaration maps a character to a command, many to one: where the kernel gives a command
// more than one, the table holds the one the command is named for, and the test names those commands.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileImageRef } from '../../lab/pdf/spikes/compile-image.mjs'
import { TEXT_SYMBOLS } from '../../packages/engine/src/source/text-symbols.ts'

const YEARS = Object.keys(JSON.parse(readFileSync(new URL('../../lab/pdf/compile-images.json', import.meta.url), 'utf8')).images)
/** a year's pinned image, the pins' alone (not COMPILE_IMAGE's), and whether it is on this machine */
const imageOf = (year: string) => {
  const ref = compileImageRef({}, year)
  return { ref, here: spawnSync('docker', ['image', 'inspect', ref], { stdio: 'ignore' }).status === 0 }
}
const FILES = ['latex.ltx', 't1enc.def', 'ts1enc.def', 't1enc.dfu', 'ts1enc.dfu', 'ot1enc.dfu', 'omsenc.dfu', 'utf8enc.dfu']
/** the line set before each file's text (no `%`: printf's format holds it) */
const MARK = '@@AXT-FILE '

/** the text of a braced group of `s` that opens at `at` (`{`), its braces balanced */
function group(s: string, at: number): string | null {
  if (s[at] !== '{') return null
  let depth = 0
  for (let i = at; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue }
    if (s[i] === '{') depth++
    else if (s[i] === '}' && --depth === 0) return s.slice(at + 1, i)
  }
  return null
}
/** a TeX body as one line: its `%` comments and line ends out, its spaces one */
const flat = (body: string) => body.replace(/(?<!\\)%[^\n]*\n?/g, '').replace(/\s+/g, ' ').trim()
const esc = (cmd: string) => cmd.replace(/[\\{}$_^.*+?()|[\]]/g, '\\$&')

describe.each(YEARS)('the kernel\'s text symbols in TeX Live %s (packages/engine/src/source/text-symbols.ts TEXT_SYMBOLS)', (year) => {
  const { ref: IMAGE, here } = imageOf(year)
  const files = new Map<string, string>()
  beforeAll(() => {
    if (!here) return
    const script = FILES.map((f) => `printf '\\n${MARK}%s\\n' ${f}; cat "$(kpsewhich ${f})"`).join('; ')
    const out = execFileSync('docker', ['run', '--rm', '--pull', 'never', '--network', 'none', IMAGE, 'sh', '-c', script], { maxBuffer: 1 << 28, timeout: 300_000 }).toString('latin1')
    for (const part of out.split(`\n${MARK}`).slice(1)) {
      const nl = part.indexOf('\n')
      files.set(part.slice(0, nl), part.slice(nl + 1))
    }
  }, 300_000)

  it.skipIf(!here)('is each command\'s character as the kernel defines it', () => {
    for (const f of FILES) expect(files.get(f)?.length ?? 0, f).toBeGreaterThan(100)
    // the UTF-8 declarations: a command's (or a body's) code points
    const unicode = new Map<string, Set<string>>()
    for (const f of FILES.filter((f) => f.endsWith('.dfu')))
      for (const m of files.get(f)!.matchAll(/\\DeclareUnicodeCharacter\{([0-9A-F]{4,6})\}/g)) {
        const body = group(files.get(f)!, m.index! + m[0].length)
        if (body === null) continue
        const key = flat(body)
        unicode.set(key, (unicode.get(key) ?? new Set()).add(String.fromCodePoint(Number.parseInt(m[1]!, 16))))
      }
    // the ASCII range's text symbols by their slot in T1 and TS1
    const slot = new Map<string, string>()
    for (const f of ['t1enc.def', 'ts1enc.def'])
      for (const m of files.get(f)!.matchAll(/\\DeclareTextSymbol\{(\\[A-Za-z]+)\}\{(?:T1|TS1)\}\{(?:`\\(.)|(\d+))\}/g)) {
        // (a slot below 32 or above 126 is the encoding's own glyph, not the character of that number)
        const ch = m[2] ?? (Number(m[3]) >= 32 && Number(m[3]) <= 126 ? String.fromCharCode(Number(m[3])) : null)
        if (ch && !slot.has(m[1]!)) slot.set(m[1]!, ch)
      }
    const ltx = files.get('latex.ltx')!
    /** latex.ltx's definition of `cmd`, read as a character or as another command, a body to look up */
    const definition = (cmd: string): { ch: string } | { as: string } | null => {
      const chardef = new RegExp(`\\\\chardef${esc(cmd)}=\`\\\\(.)`).exec(ltx)
      if (chardef) return { ch: chardef[1]! }
      const lets = new RegExp(`\\\\let\\s*${esc(cmd)}\\s*=?\\s*(\\\\[A-Za-z]+)`).exec(ltx)
      if (lets) return { as: lets[1]! }
      const head = new RegExp(`\\\\(?:DeclareRobustCommand|DeclareTextCommandDefault)\\*?\\{${esc(cmd)}\\}|\\\\def\\s*${esc(cmd)}(?![A-Za-z])\\s*`).exec(ltx)
      if (!head) return null
      const body = group(ltx, head.index + head[0].length)
      if (body === null) return null
      const text = flat(/\\else(.*)\\fi\s*$/s.exec(body)?.[1] ?? body).replace(/\\(?:expandafter|relax|protect)(?![A-Za-z])\s*/g, '').trim()
      if (/^\\[A-Za-z]+$/.test(text)) return { as: text }
      if (unicode.has(text)) return { as: text }
      if (text && text[0] !== '\\') return { ch: text[0]! }
      return null
    }
    /** the characters the kernel gives `cmd` */
    const kernel = (cmd: string, depth = 0): Set<string> => {
      const out = new Set(unicode.get(cmd) ?? [])
      const s = slot.get(cmd)
      if (s) out.add(s)
      if (out.size || depth > 5) return out
      const d = definition(cmd)
      return d === null ? out : 'ch' in d ? new Set([d.ch]) : kernel(d.as, depth + 1)
    }
    const apart: string[] = []
    const several: string[] = []
    for (const [cmd, ch] of Object.entries(TEXT_SYMBOLS)) {
      const chars = kernel(cmd)
      if (!chars.has(ch)) apart.push(`${cmd}: the table's ${JSON.stringify(ch)}, the kernel's ${JSON.stringify([...chars])}`)
      if (chars.size > 1) several.push(`${cmd} ${[...chars].sort().join(' ')}: ${ch}`)
    }
    expect(apart).toEqual([])
    expect(Object.keys(TEXT_SYMBOLS).length).toBe(53)
    // the ASCII tilde and circumflex beside the spacing modifiers, the en and em dash beside the figure dash and the bar: the table
    // holds the ASCII character and the dash of the command's name
    expect(several.sort()).toEqual(['\\textasciicircum ^ ˆ: ^', '\\textasciitilde ~ ˜: ~', '\\textemdash — ―: —', '\\textendash ‒ –: –'])
  })
})
