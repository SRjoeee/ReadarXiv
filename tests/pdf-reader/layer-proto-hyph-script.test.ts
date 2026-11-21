import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// The hyphenation a word of a translation is given (layer2.mjs tokensOf2): by its letters' script, the target's rules'
// latinPatterns or cyrillicPatterns (rules/layout.mjs, schema 9). Laid in a canvas that measures nothing the test reads

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
/** each word of `s` laid into `to`, and the patterns its token is hyphenated by (null: none) */
function hyphOf(to: string, s: string): Record<string, string | null> {
  const tokens = L2.tokensOf2({ kind: 'para', pieces: [{ t: 'text', tr: true, s }] } as never, new Map() as never, to, BASE as never, DESIGNS, resolveRules(BUILTIN_RULES, to).params as never, null, undefined, true) as unknown as { s?: string; space?: boolean; hyph?: string }[]
  return Object.fromEntries(tokens.filter(t => !t.space && t.s).map(t => [t.s!, t.hyph ?? null]))
}

describe('the hyphenation a word is given, by its script and the target\'s rules', () => {
  it('a Cyrillic word takes the target\'s cyrillicPatterns (Russian\'s rules, Ukrainian\'s or Bulgarian\'s own), a Latin word its latinPatterns', () => {
    expect(hyphOf('uk', 'інформація представлення network')).toEqual({ 'інформація': 'uk', 'представлення': 'uk', network: 'en' })
    expect(hyphOf('bg', 'България алгоритъм')).toEqual({ 'България': 'bg', 'алгоритъм': 'bg' })
    expect(hyphOf('ru', 'представление network')).toEqual({ 'представление': 'ru', network: 'en' })
    // (a word that is no word of letters alone is none's: the apostrophe Ukrainian writes in комп'ютер)
    expect(hyphOf('uk', "комп'ютер")).toEqual({ "комп'ютер": null })
    expect(hyphOf('tr', 'İstatistiksel Işıklandırma')).toEqual({ 'İstatistiksel': 'tr', 'Işıklandırma': 'tr' })
    expect(hyphOf('ms', 'pembelajaran')).toEqual({ pembelajaran: 'id' })
    expect(hyphOf('de', 'Aufmerksamkeit')).toEqual({ Aufmerksamkeit: 'de' })
  })
})
