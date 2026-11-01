import * as PL from '@cantoo/pdf-lib'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lex } from '@/pdf-reader/engine/layout/remove.mjs'
import { lexDifference, outcomeOf, streamsOf } from './helpers/lex-compare'
import { lexReference } from './helpers/lex-reference.mjs'

// The remover's lexer (layout/remove.mjs `lex`) reads a number from its bytes and a short keyword with no string made of it; it
// is held to the lexer before that change (helpers/lex-reference.ts), value for value: the same operators, operands (numbers by
// Object.is, -0 too), offsets, `bytes` and LexLimit refusals, on number edge cases, on generated and random streams, on every
// stream of the repository's PDFs, and, with AXT_LEX_PDFS (directories or PDFs, ':'-separated), on every stream of each PDF
// under them: the corpus run of 2026-10-31 is in the pull request that made the change.

const enc = (s: string) => new TextEncoder().encode(s)
/** what the old lexer holds of a stream read whole (a stream it refuses: 1000), a limit to refuse it at part way */
const heldOf = (b: Uint8Array) => { const o = outcomeOf(() => lexReference(b)); return 'bytes' in o ? o.bytes : 1000 }
/** a seeded generator (mulberry32): the same streams on every run */
function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

describe('a number read from its bytes is the number Number reads from its text', () => {
  const tokens = [
    '0', '-0', '+0', '-0.0', '-.0', '+.0', '0.', '-0.', '.0', '00', '007', '-007.50', '5.', '.5', '-.5', '+.5', '1.5', '0.1', '0.2', '0.3', '-0.1',
    '3.14159', '612', '792.000', '-1.0e5', '1e5', '1.5e', 'e5', '1.2.3', '..5', '5..', '--1', '+-1', '-+1', '1-', '1+', '+', '-', '.', '+.', '-.',
    '123456789012345', '999999999999999', '-999999999999999', '0.12345678901234', '12345678.9012345', '.000000000000001', '-.000000000000001',
    '1234567890123456', '9007199254740993', '9007199254740992.5', '0.0000000000000001', '3.14159265358979323846', '123456789012345678901234567890',
    '0000000000000001.5', '000000000000000000000', '1'.repeat(255), `${'1'.repeat(254)}.`, '1'.repeat(256), `-${'9'.repeat(254)}`, '0x10', '1_000', '½',
  ]
  it('in each edge case, a token alone and before an operator, Object.is the old lexer\'s, -0 its own', () => {
    for (const t of tokens) for (const s of [t, `${t} m`, `[${t} ${t}]`, `${t}\n${t} ${t} re`]) expect(lexDifference(enc(s), [0, 16, 100]), s).toBeNull()
    const neg = lex(enc('-0 -.0 -0.000 g'))[0]!.args
    expect(neg.every(v => Object.is(v, -0))).toBe(true)
  })
  it('in a token of at most 15 digits, equals Number of its text over every count of fraction digits', () => {
    const next = rng(7)
    for (let n = 0; n < 20000; n++) {
      const digits = 1 + Math.floor(next() * 15), at = Math.floor(next() * (digits + 1))
      let t = ''
      for (let k = 0; k < digits; k++) t += String(Math.floor(next() * 10))
      t = `${next() < 0.3 ? '-' : next() < 0.1 ? '+' : ''}${t.slice(0, at)}${at < digits || next() < 0.3 ? '.' : ''}${t.slice(at)}`
      const got = lex(enc(`${t} w`))[0]!.args[0]
      expect(Object.is(got, Number(t)), t).toBe(true)
    }
  })
})

describe('the lexer and the old one read every stream alike', () => {
  const KEYWORDS = ['m', 'l', 'c', 'v', 'y', 'h', 're', 'S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n', 'W', 'W*', 'q', 'Q', 'cm', 'gs', 'Do', 'BT', 'ET', 'Tf', 'Tj', 'TJ', "'", '"', 'Td', 'TD', 'Tm', 'T*', 'Tc', 'Tw', 'Tz', 'TL', 'Tr', 'Ts', 'BDC', 'BMC', 'EMC', 'MP', 'DP', 'sh', 'cs', 'CS', 'sc', 'SC', 'scn', 'SCN', 'g', 'G', 'rg', 'RG', 'k', 'K', 'ri', 'i', 'j', 'J', 'M', 'd', 'w', 'd0', 'd1', 'BX', 'EX', 'true', 'false', 'null', 'ID', 'EI', 'Tx', 'zz', 'abc', 'ABCD', 'é', 'ÿþ', 'qQ', 'BIx', '?']
  const NUMBERS = ['0', '-0', '1', '-1', '0.5', '.5', '-.5', '5.', '12.3456', '-0.000', '1234567890123456789', '0.30000000000000004', '1e5', '1.2.3', '+', '-', '.', '007']
  /** a stream of tokens: numbers, keywords, names, strings, hex strings, arrays, dictionaries, comments, inline images, long tokens */
  function soup(next: () => number, size: number): Uint8Array {
    const pick = <T>(a: readonly T[]) => a[Math.floor(next() * a.length)] as T
    const ws = [' ', ' ', '\n', '\r\n', '\t', '\f', '\0', '']
    const parts: string[] = []
    for (let n = 0; n < size; n++) {
      const r = next()
      if (r < 0.3) parts.push(pick(NUMBERS))
      else if (r < 0.4) { let t = ''; for (let k = 1 + Math.floor(next() * 18); k > 0; k--) t += String(Math.floor(next() * 10)); if (next() < 0.5) { const at = Math.floor(next() * t.length); t = `${t.slice(0, at)}.${t.slice(at)}` } parts.push(next() < 0.3 ? `-${t}` : t) }
      else if (r < 0.6) parts.push(pick(KEYWORDS))
      else if (r < 0.68) parts.push(pick(['/F1', '/OC', '/axt0', '/a#20b', '/#zz', '/', '/Im12', '/abc', '/A#41', `/${'x'.repeat(300)}`]))
      else if (r < 0.74) parts.push(pick(['(Hello)', '(a\\(b\\)c)', '(\\101\\12x)', '(line\\\ncont)', '(\r\n)', '(nested (one) two)', '(unclosed', '(\\', '()']))
      else if (r < 0.78) parts.push(pick(['<48656c6c6f>', '<4 8 6>', '<abc>', '<zz12>', '<', '<>']))
      else if (r < 0.84) parts.push(pick(['[', ']', '<<', '>>', '{', '}', '[1 (a) -2.5 (b)]', '<< /Type /X /N 5 >>']))
      else if (r < 0.87) parts.push(pick(['% a comment\n', '%\r', '%no end']))
      else if (r < 0.9) parts.push(pick(['BI /W 2 /H 2 /BPC 8 ID \u0001\u0002\u0003\u0004 EI', 'BI /W 1 ID xEI EI', 'BI % c\n/W 1 ID ÿEI', 'BI ) ID EI', 'BI ID']))
      else if (r < 0.93) parts.push(next() < 0.5 ? '9'.repeat(200 + Math.floor(next() * 100)) : 'k'.repeat(250 + Math.floor(next() * 10)))
      else parts.push(String.fromCharCode(Math.floor(next() * 256)))
      parts.push(pick(ws))
    }
    return new Uint8Array(Buffer.from(parts.join(''), 'latin1'))
  }
  it('on 4,000 generated streams, whole, as the walk reads them and under limits that refuse them part way', () => {
    const next = rng(42)
    for (let n = 0; n < 4000; n++) {
      const b = soup(next, 1 + Math.floor(next() * 120))
      const whole = heldOf(b)
      const d = lexDifference(b, [Math.floor(whole * next()), whole, whole + 1, Math.floor(next() * 4000)])
      expect(d, Buffer.from(b).toString('latin1')).toBeNull()
    }
  })
  it('on random bytes and on generated streams with bytes changed at random', () => {
    const next = rng(1031)
    for (let n = 0; n < 1500; n++) {
      const b = new Uint8Array(Math.floor(next() * 2000))
      for (let k = 0; k < b.length; k++) b[k] = Math.floor(next() * 256)
      expect(lexDifference(b, [Math.floor(next() * 3000)])).toBeNull()
      const m = soup(next, 60)
      for (let k = Math.floor(next() * 8); k > 0; k--) m[Math.floor(next() * m.length)] = Math.floor(next() * 256)
      expect(lexDifference(m, [Math.floor(next() * 3000)]), Buffer.from(m).toString('latin1')).toBeNull()
    }
  })
  it('on every stream of the repository\'s PDFs', async () => {
    const dir = join(process.cwd(), 'tests/fixtures/pdf')
    const pdfs = readdirSync(dir, { recursive: true }).map(String).filter(f => f.endsWith('.pdf'))
    expect(pdfs.length).toBeGreaterThan(0)
    let streams = 0
    for (const f of pdfs) for (const s of await streamsOf(new Uint8Array(readFileSync(join(dir, f))), PL)) {
      streams++
      expect(lexDifference(s.bytes, [heldOf(s.bytes) >> 1]), `${f}: a ${s.kind} stream`).toBeNull()
    }
    expect(streams).toBeGreaterThan(20)
  })
  const CORPUS = process.env.AXT_LEX_PDFS
  it.skipIf(!CORPUS)('on every stream of each PDF under AXT_LEX_PDFS', async () => {
    const files: string[] = []
    const walk = (p: string) => { if (statSync(p).isDirectory()) for (const f of readdirSync(p)) walk(join(p, f)); else if (p.endsWith('.pdf')) files.push(p) }
    for (const p of CORPUS!.split(':')) walk(p)
    let streams = 0
    for (const f of files) {
      let got: Awaited<ReturnType<typeof streamsOf>> = []
      try { got = await streamsOf(new Uint8Array(readFileSync(f)), PL) } catch { continue }
      for (const s of got) { streams++; expect(lexDifference(s.bytes, [heldOf(s.bytes) >> 1]), `${f}: a ${s.kind} stream`).toBeNull() }
    }
    expect(streams).toBeGreaterThan(0)
  }, 3_600_000)
})
