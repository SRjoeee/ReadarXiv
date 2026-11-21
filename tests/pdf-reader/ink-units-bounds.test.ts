// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { latin1 } from '../../packages/engine/src/bounded-reads.ts'
import { claimInk, inkUnitsOf, keptUnitsOf } from '../../packages/engine/src/locate/ink-units.ts'
import { ledgerOf } from '../../packages/engine/src/locate/ledger.ts'
import {
  claimInk as claimInkBefore,
  inkUnitsOf as inkUnitsOfBefore,
  keptUnitsOf as keptUnitsOfBefore,
} from './helpers/ink-units-before.mjs'

// The ink units' maker (packages/engine/src/locate/ink-units.ts) reads a placeholder's source bytes through the engine's
// one latin1 (bounded-reads.ts: Reflect.apply over slices of 8192 bytes), where its sourceView called String.fromCharCode.apply
// over slices of 0x8000 (which TypeScript does not take over a typed array: lane t2-locate, the ruled form of lane t1's latin1).
// Held here to the one before: the old function verbatim but its types against the new expression, at every slice's edge and on
// seeded texts of every UTF-8 width; and the maker before the change (helpers/ink-units-before.mjs, 0a3585fd0 verbatim but its
// imports and three lint notes) against the maker now, unit for unit, on pages of formulas and addresses of every length.

/** a seeded generator (mulberry32): the same texts on every run */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ENCODER = new TextEncoder()
/** ink-units.mjs sourceView at 0a3585fd0, verbatim but its types */
function sourceViewBefore(s: string) {
  const b = ENCODER.encode(s)
  let out = ''
  for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000) as unknown as number[])
  return out
}
/** what sourceView is now */
const sourceViewNow = (s: string) => latin1(ENCODER.encode(s))

describe("sourceView: a source's UTF-8 bytes read latin-1 through the engine's one latin1", () => {
  it('reads every width, a lone surrogate, and each slice edge of both readers as the one before', () => {
    const cases = ['', 'a', 'abc', '\u0000', 'é', '€', '😀', '\ud800', 'x\udc00y', '$\\{x\\}$', '\\url{https://example.org/a_b}']
    // (8192 bytes, 8192 + 1, a 3- and a 4-byte character across the edge, 0x8000 bytes, past it)
    for (const n of [4095, 4096, 4097, 16383, 16384, 16385]) cases.push('é'.repeat(n))
    for (const n of [2730, 2731, 10922, 10923]) cases.push('€'.repeat(n), `a${'€'.repeat(n)}`, `ab${'€'.repeat(n)}`)
    for (const n of [2047, 2048, 2049, 8191, 8192, 8193]) cases.push('😀'.repeat(n), `a${'😀'.repeat(n)}`)
    for (const s of cases) expect(sourceViewNow(s), JSON.stringify(s.slice(0, 20))).toBe(sourceViewBefore(s))
  })

  it('reads 300 seeded texts of up to 40,000 code units as the one before', () => {
    const next = rng(20261114)
    const alphabet = ['a', 'Z', '0', ' ', '\\', '$', '{', '}', '_', 'é', 'ß', 'α', '€', 'ॐ', '😀', '𝑥', '\ud800', '\udfff', '\u0000', '\u00ff']
    for (let n = 0; n < 300; n++) {
      const len = Math.floor(next() * 40_000)
      let s = ''
      for (let i = 0; i < len; i++) s += alphabet[Math.floor(next() * alphabet.length)]
      expect(sourceViewNow(s)).toBe(sourceViewBefore(s))
    }
  })
})

type Part = { s: string; font?: string }
/** a page of lines of glyphs, each set left to right (a glyph half its size wide, a space a quarter), no marks: its lines the
 *  page's own text, no unit's */
function pageOf(lines: { parts: Part[]; y: number; size?: number }[]) {
  const glyphs: { u: string; x0: number; x1: number; ix0: number; ix1: number; y: number; size: number; top: number; bottom: number; font: string; fill: number; n: number; k: number; form: boolean; blank?: boolean }[] = []
  lines.forEach((l, n) => {
    const size = l.size ?? 10
    let x = 72
    for (const part of l.parts)
      for (const u of part.s) {
        const w = u === ' ' ? 0.25 * size : 0.5 * size
        glyphs.push({ u, x0: x, x1: x + w, ix0: x, ix1: x + w, y: l.y, size, top: l.y + 0.7 * size, bottom: l.y - 0.2 * size, font: part.font ?? 'ABCDEF+CMR10', fill: 0, n, k: glyphs.length, form: false, ...(u === ' ' ? { blank: true } : {}) })
        x += w
      }
  })
  return { glyphs, turned: [], boxes: [], paths: [], boxAt: glyphs.map(() => 0), view: [0, 0, 612, 792] as const, points: [], paras: [], paraEnds: [], regions: [], pictures: [], shapes: new Map(), figures: new Map(), unseen: new Set(), cut: new Map() }
}
const MATH = 'ABCDEF+CMMI10', MONO = 'ABCDEF+CMTT10'

/** the maker's units, kept blocks and claims on `pages`, before the change or now */
function make(pages: ReturnType<typeof pageOf>[], before: boolean) {
  const own = () => ({ glyphs: pages.map(pg => pg.glyphs.map((): string | null => null)), boxes: pages.map((): (string | null)[] => []) })
  const units = [{ kind: 'para', pieces: [{ t: 'text', s: 'A paragraph of the source' }] }]
  const ledger = ledgerOf(pages, own(), { units })
  const ink = (before ? inkUnitsOfBefore : inkUnitsOf)(pages, ledger, { units, from: 1 })
  const claimed = own()
  const n = (before ? claimInkBefore : claimInk)(claimed, ink as never[], pages)
  const kept = (before ? keptUnitsOfBefore : keptUnitsOf)(pages, ledger, (p, g) => claimed.glyphs[p - 1]?.[g] ?? null, { from: 1 + ink.length })
  return { ink, n, claimed, kept }
}

describe('the maker: the same units, claims and kept blocks before the change and now', () => {
  it('on lines of formulas, addresses, identifiers, accents and wide characters', () => {
    const pages = [
      pageOf([
        { parts: [{ s: 'Let ' }, { s: 'x', font: MATH }, { s: ' be a value of the set' }], y: 700 },
        { parts: [{ s: 'Mail ' }, { s: 'a.b@example.org', font: MONO }, { s: ' or see llm_equal_human here' }], y: 650 },
        { parts: [{ s: 'Física de los ' }, { s: 'ॐ€', font: 'ABCDEF+NotoSans' }, { s: ' and ' }, { s: '𝑥$\\{}', font: MATH }, { s: ' done' }], y: 600 },
        { parts: [{ s: 'Visit ' }, { s: 'https://example.org/a_b', font: MONO }, { s: ' for the rest of it' }], y: 550 },
      ]),
    ]
    expect(make(pages, false)).toEqual(make(pages, true))
    expect(make(pages, false).ink.length).toBeGreaterThan(2)
  })

  it("on formulas and addresses past each reader's slice (8192 bytes, 0x8000)", () => {
    const pages = [
      pageOf([
        // (four words of text and more: no formula's line, the page's own text; an address in the text's face, \urlstyle{same})
        { parts: [{ s: 'Let the value of ' }, { s: 'α'.repeat(5000), font: MATH }, { s: ' be long enough here' }], y: 700 },
        { parts: [{ s: 'Then the value of ' }, { s: 'β'.repeat(17000), font: MATH }, { s: ' is longer than that' }], y: 600 },
        { parts: [{ s: `See the page https://example.org/${'€'.repeat(3000)} for the rest of it` }], y: 500 },
      ]),
    ]
    const now = make(pages, false)
    expect(now).toEqual(make(pages, true))
    // (each run a placeholder whose source is past 8192 bytes: the slices the two readers cut differ there)
    const srcs = (now.ink as { pieces: { t: string; src?: string }[] }[]).flatMap(u => u.pieces.filter(p => p.t === 'ph').map(p => p.src ?? ''))
    expect(srcs.filter(s => s.length > 8192).length).toBeGreaterThanOrEqual(3)
    expect(srcs.some(s => s.length > 0x8000)).toBe(true)
  })
})
