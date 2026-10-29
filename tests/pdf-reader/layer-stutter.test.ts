import { beforeAll, describe, expect, it } from 'vitest'
import { addUnitWords, newWords, plainOfPieces, wordIndexer } from '@/pdf-reader/engine/layer-proto/words.mjs'
import { sourceRepeats, STUTTER_MIN, stutterCuts } from '@/pdf-reader/engine/layer-proto/stutter.mjs'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// A translator's stutter drawn once (stutter.mjs; the M1 survey of 2608.16117, "konformen konformen" in the German abstract,
// Microsoft's own): a word of STUTTER_MIN letters or more of a script that sets words apart by spaces, written twice in a
// row where the unit's source sets no word twice, is drawn once (tokensOf2); the row keeps it, and the word table keeps each
// drawn word's place in the translation, so that the sentence offsets the row carries still fall on their words

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  // layer2.mjs measures with a canvas made when it loads; these measure a character as half an em
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
const text = (s: string) => ({ t: 'text', tr: true, s })
/** what a text is drawn as, its stutters left out */
const drawn = (s: string) => { let out = '', at = 0; for (const [a, z] of stutterCuts(s)) { out += s.slice(at, a); at = z } return out + s.slice(at) }
/** a unit's tokens as tokensOf2 tags them, laid in one block of `lines` lines 400 wide, and its word table on page 1 */
function lay(pieces: object[], src: string, to = 'de', lines = 3) {
  const unit = { kind: 'para', src, pieces }
  const params = resolveRules(BUILTIN_RULES, to).params
  const tokens = L2.tokensOf2(unit as never, new Map() as never, to, BASE as never, DESIGNS, params as never, null, undefined, true)
  const B = Array.from({ length: lines }, (_, k) => 500 - 12 * k)
  const blk = { page: 1, rects: B.map(b => [1, 0, b - 2, 400, b + 8]), x0: 0, x1: 400, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after: 0, centred: false }
  const layout = L2.layoutUnit2(tokens, [blk] as never, 10, params as never)
  const W = newWords()
  addUnitWords(W, layout, 1, 7, wordIndexer(plainOfPieces(pieces as never)))
  return { words: tokens.filter(t => typeof t.s === 'string').map(t => t.s), index: Array.from(W.word.slice(0, W.n)) }
}

describe('a stutter', () => {
  it("is the second of two equal words, case aside, with white space alone between them: it goes with the white space before it", () => {
    expect(drawn('aus den hergestellten konformen konformen Metastrukturen')).toBe('aus den hergestellten konformen Metastrukturen')
    expect(drawn('Konformen  konformen, und')).toBe('Konformen, und')
    expect(drawn('del Wall Street Street Journal (WSJ)')).toBe('del Wall Street Journal (WSJ)')
    expect(drawn('un BiLSTM biLSTM de 768')).toBe('un BiLSTM de 768')
    // (a third time, and a word written twice twice)
    expect(drawn('Modell Modell Modell und Daten Daten')).toBe('Modell und Daten')
    expect(drawn('Modelle Modelle und Netzwerk\nNetzwerk')).toBe('Modelle und Netzwerk')
    // (Cyrillic and Greek: alphabetic scripts that set words apart by spaces)
    expect(drawn('модели модели сети')).toBe('модели сети')
    expect(drawn('μοντέλο μοντέλο')).toBe('μοντέλο')
  })

  it("is none under STUTTER_MIN letters, across anything but white space, in a script that does not set words apart by spaces, or in a TeX command's name", () => {
    expect(STUTTER_MIN).toBe(5)
    // (a short word's repeat is often the language's own: "die die", "nous nous", "en en")
    for (const s of ['Paare, die die richtige Antwort', 'Nous nous sommes', 'que que', 'very very', 'Daten Datenbank', 'Daten, Daten', 'Daten-Daten', 'Modell2 Modell2', 'Modell Modell2']) expect(stutterCuts(s), s).toEqual([])
    // (CJK and Hangul: no spaces between words, or words of their own kind)
    for (const s of ['36\u4ebf\u6b21\u6d6e\u70b9\u6d6e\u70b9', '\u6d6e\u70b9\u8fd0\u7b97 \u6d6e\u70b9\u8fd0\u7b97', '\ud3c9\uac00\uc6a9\uc73c\ub85c \ud3c9\uac00\uc6a9\uc73c\ub85c', '\u30a2\u30a4\u30c7\u30f3\u30c6\u30a3\u30c6\u30a3 \u30a2\u30a4\u30c7\u30f3\u30c6\u30a3\u30c6\u30a3']) expect(stutterCuts(s), s).toEqual([])
    // (a TeX command's name beside the same word: \textbackslash{} is a translation's escape)
    expect(stutterCuts('\\lambda lambda und \\emph{x}')).toEqual([])
  })

  it("is left where the unit's source sets a word twice in a row itself: its translation's repeat may be that one", () => {
    expect(sourceRepeats('the Walla Walla river')).toBe(true)
    expect(sourceRepeats('it had had its effect')).toBe(true)
    expect(sourceRepeats('very very large')).toBe(true)
    expect(sourceRepeats('Wall Street Journal')).toBe(false)
    expect(sourceRepeats('a a typo of one letter')).toBe(false)
    expect(sourceRepeats(undefined)).toBe(false)
    const unit = [text('der Fluss Walla Walla')]
    expect(lay(unit, 'the Walla Walla river').words).toEqual(['der', 'Fluss', 'Walla', 'Walla'])
    expect(lay(unit, 'the Walla river').words).toEqual(['der', 'Fluss', 'Walla'])
  })
})

describe('the drawing of a stutter', () => {
  it("sets the word once, each drawn word's place in the word table the translation's own", () => {
    // (the abstract of 2608.16117 in German, unit 5, as Microsoft wrote it)
    const pieces = [text('Wir untersuchen die künstlich hergestellten konformen konformen Metastrukturen. ')]
    const src = 'We study artificially manufactured conformal metastructures.'
    const { words, index } = lay(pieces, src)
    expect(words).toEqual(['Wir', 'untersuchen', 'die', 'künstlich', 'hergestellten', 'konformen', 'Metastrukturen.'])
    // (the plain text's words: 0 Wir, ..., 5 konformen, 6 konformen, 7 metastrukturen; the sixth is not drawn)
    expect(index).toEqual([0, 1, 2, 3, 4, 5, 7])
  })

  it('leaves a placeholder, a source text piece and the text across a placeholder as they are', () => {
    // (two equal words with a placeholder between them are not a stutter; a source piece is drawn as the source has it)
    const across = lay([text('konformen '), { t: 'ph', src: '$x$', k: 1 }, text(' konformen Netze')], 'conformal $x$ nets')
    expect(across.words).toEqual(['konformen', 'konformen', 'Netze'])
    const source = lay([{ t: 'text', s: 'Walla Walla', k: 0 }], 'Walla Walla')
    expect(source.words).toEqual(['Walla', 'Walla'])
    const untranslated = L2.tokensOf2({ kind: 'para', src: 'x', pieces: [{ t: 'text', s: 'Netze Netze', k: 0 }] } as never, new Map() as never, 'de', BASE as never, DESIGNS, resolveRules(BUILTIN_RULES, 'de').params as never)
    expect(untranslated.filter(t => typeof t.s === 'string').map(t => t.s)).toEqual(['Netze', 'Netze'])
  })

  it('keeps the offsets through the TeX escapes and the dashes a piece is drawn through', () => {
    const pieces = [text('Gewinn von 5\\,\\% -- Ergebnisse Ergebnisse --- und mehr')]
    const { words, index } = lay(pieces, 'a gain of 5% -- results --- and more')
    // (the translation's escape drawn undone, `\\%` a percent sign; a TeX command it holds besides, drawn as it is)
    expect(words).toEqual(['Gewinn', 'von', '5\\,%', '–', 'Ergebnisse', '—', 'und', 'mehr'])
    const plain = plainOfPieces(pieces as never)
    const at = wordIndexer(plain)
    // (the drawn "und" is the plain text's own "und", after the second "Ergebnisse")
    expect(index.at(-2)).toBe(at(plain.indexOf('und'), plain.indexOf('und') + 3))
    expect(index).not.toContain(at(plain.lastIndexOf('Ergebnisse'), plain.lastIndexOf('Ergebnisse') + 10))
  })
})
