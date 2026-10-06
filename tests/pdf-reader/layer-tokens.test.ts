import { describe, expect, it } from 'vitest'
import { rolesFor } from '@/pdf-reader/engine/font-roles.mjs'
import { layerRulesFor } from '@/pdf-reader/engine/layer-rules.mjs'
import type { Hyphenator } from '@/pdf-reader/engine/layer/hyphen.mjs'
import { STYLE, type TrPiece, trText } from '@/pdf-reader/engine/layer/pieces.mjs'
import { COMPRESS_CLOSE, COMPRESS_OPEN, hyphenCore, NO_END, NO_START, type TextIn, type Token, tokensOf } from '@/pdf-reader/engine/layer/tokens.mjs'
import { PH_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { fileOf, measure, type PhSpec, type UnitSpec, unitOf } from './helpers/layer-fixtures'

// A unit's translation as the tokens the line breaker places (spec §4.5): its style from the original's font and the
// translation's groups, its placeholders by k, its characters by class, and every token's offsets in trText. The CJK of
// the inputs is written as unicode escapes

const REGULAR = 'NimbusRomNo9L-Regu'
const ITALIC = 'NimbusRomNo9L-ReguItal'
const MEDIUM = 'NimbusRomNo9L-Medi'

interface Opts { target: string; fonts: string[]; unit: Partial<UnitSpec>; textIn: TextIn; hyphen: Hyphenator | null; classOf: (k: number) => string | null }
const run = (pieces: TrPiece[], o: Partial<Opts> = {}) => {
  const target = o.target ?? 'en'
  return tokensOf(pieces, {
    unit: unitOf(o.unit), file: fileOf(o.fonts ?? [REGULAR]), target, rules: layerRulesFor(target), roles: rolesFor(target, 'times'),
    measure, hyphen: o.hyphen ?? null, textIn: o.textIn, classOf: o.classOf,
  })
}
const need = (pieces: TrPiece[], o: Partial<Opts> = {}): Token[] => {
  const tokens = run(pieces, o)
  expect(tokens).not.toBeNull()
  return tokens!
}
const texts = (tokens: Token[]) => tokens.filter(t => t.kind === 'text')
const faces = (tokens: Token[]) => texts(tokens).map(t => [t.s, t.face])
const ph = (kind: string, flags = 0, segs?: number[]): PhSpec => ({ kind, flags, segs })

describe('the exact values', () => {
  it('the kinsoku sets are the brief\'s, character for character', () => {
    expect(NO_START).toBe('\u3001\u3002\uff0c\uff0e,.\uff01\uff1f!?\uff09)]\u300d\u300f\u3011\u3015\u3009\u300b\u3019\u3017\u201d\u2019\uff1a:\uff1b;\u30fb\u30fc\u301c\u2026\u3005\u309d\u309e\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308e\u30a1\u30a3\u30a5\u30a7\u30a9\u30c3\u30e3\u30e5\u30e7\u30ee\u30f5\u30f6%\uff05')
    expect(NO_END).toBe('\uff08([\u300c\u300e\u3010\u3014\u3008\u300a\u3018\u3016\u201c\u2018')
    expect(COMPRESS_CLOSE).toBe('\u3001\u3002\uff0c\uff0e\uff1a\uff1b\uff01\uff1f\uff09\u300d\u300f\u3011\u3015\u3009\u300b\u3019\u3017\u201d\u2019')
    expect(COMPRESS_OPEN).toBe('\uff08\u300c\u300e\u3010\u3014\u3008\u300a\u3018\u3016\u201c\u2018')
  })

  it('a word\'s letters are what the hyphenator is asked about', () => {
    expect(hyphenCore('translation,')).toEqual({ lead: 0, core: 'translation' })
    expect(hyphenCore('(international)')).toEqual({ lead: 1, core: 'international' })
    expect(hyphenCore('\u201cquoted\u201d')).toEqual({ lead: 1, core: 'quoted' })
    expect(hyphenCore('\u00fcbersetzung.')).toEqual({ lead: 0, core: '\u00fcbersetzung' })
    // fewer than five letters, a digit or a mark inside, no letter at all
    for (const word of ['text', 'ab-cdef', 'a1bcde', "don't", '12345', '', '...']) expect(hyphenCore(word), word).toBeNull()
  })
})

describe('the style of a run', () => {
  it("the base style is the lines' font, groups on top, emph toggles", () => {
    // an italic original: a word in \emph is upright, the rest stays italic
    const emph = need([[0, 'the '], [2, 1, STYLE.EMPH], [0, 'word'], [3, 2], [0, ' rest']], { fonts: [ITALIC] })
    expect(faces(emph)).toEqual([['the', 'termes-italic'], ['word', 'termes-regular'], ['rest', 'termes-italic']])
    // an upright original: \emph is italic, and a group of \textbf is bold
    const upright = need([[0, 'a '], [2, 1, STYLE.EMPH], [0, 'b'], [3, 2], [0, ' '], [2, 3, STYLE.BOLD], [0, 'c'], [3, 4]])
    expect(faces(upright)).toEqual([['a', 'termes-regular'], ['b', 'termes-italic'], ['c', 'termes-bold']])
    // \emph in \emph is upright again, and \textnormal undoes everything the lines had
    const twice = need([[2, 1, STYLE.EMPH], [0, 'a '], [2, 2, STYLE.EMPH], [0, 'b'], [3, 3], [3, 4]])
    expect(faces(twice)).toEqual([['a', 'termes-italic'], ['b', 'termes-regular']])
    const normal = need([[2, 1, STYLE.NORMAL], [0, 'plain'], [3, 2]], { fonts: [MEDIUM] })
    expect(faces(normal)).toEqual([['plain', 'termes-regular']])
    expect(faces(need([[0, 'heavy']], { fonts: [MEDIUM] }))).toEqual([['heavy', 'termes-bold']])
  })

  it('the font of most of the lines is the base', () => {
    const file = [REGULAR, ITALIC]
    expect(faces(need([[0, 'x']], { fonts: file, unit: { lineFonts: [1, 1, 0] } }))).toEqual([['x', 'termes-italic']])
    expect(faces(need([[0, 'x']], { fonts: file, unit: { lineFonts: [0, 1, 0] } }))).toEqual([['x', 'termes-regular']])
    // a tie goes to the font the lines meet first
    expect(faces(need([[0, 'x']], { fonts: file, unit: { lineFonts: [1, 0] } }))).toEqual([['x', 'termes-italic']])
  })

  it('where the groups hold half the text and set a style, the base does not', () => {
    // the lines are italic because the \textit group is most of the unit: the words outside it are upright
    const pieces: TrPiece[] = [[0, 'a '], [2, 1, STYLE.ITALIC], [0, 'quite a long italic passage here'], [3, 2], [0, ' b']]
    expect(faces(need(pieces, { fonts: [ITALIC] }))).toEqual([['a', 'termes-regular'], ['quite', 'termes-italic'], ['a', 'termes-italic'], ['long', 'termes-italic'], ['italic', 'termes-italic'], ['passage', 'termes-italic'], ['here', 'termes-italic'], ['b', 'termes-regular']])
    // a small group leaves the base alone
    const small = need([[0, 'a long run of ordinary words '], [2, 1, STYLE.ITALIC], [0, 'x'], [3, 2]], { fonts: [ITALIC] })
    expect(faces(small).at(0)).toEqual(['a', 'termes-italic'])
    // bold and italic are judged apart: bold groups do not make an italic base upright
    const bold = need([[2, 1, STYLE.BOLD], [0, 'a long bold passage of the unit'], [3, 2], [0, ' tail']], { fonts: ['NimbusRomNo9L-MediItal'] })
    expect(faces(bold).at(-1)).toEqual(['tail', 'termes-italic'])
    expect(faces(bold).at(0)).toEqual(['a', 'termes-bolditalic'])
  })

  it("a switch holds to its group's end", () => {
    // inside a group: \bfseries holds to the group's close
    const grouped = need([[0, 'x '], [2, 1, 0], [0, 'a '], [2, 2, STYLE.BOLD | STYLE.SWITCH], [0, 'b '], [3, 3], [0, 'c']])
    expect(faces(grouped)).toEqual([['x', 'termes-regular'], ['a', 'termes-regular'], ['b', 'termes-bold'], ['c', 'termes-regular']])
    // at the top: to the unit's end, through the groups opened after it
    const top = need([[0, 'p '], [2, 1, STYLE.BOLD | STYLE.SWITCH], [0, 'q '], [2, 2, 0], [0, 'n'], [3, 3], [0, ' m']])
    expect(faces(top)).toEqual([['p', 'termes-regular'], ['q', 'termes-bold'], ['n', 'termes-bold'], ['m', 'termes-bold']])
  })

  it('a monospaced group takes the paper\'s mono design, and a colour is the group\'s', () => {
    const mono = need([[2, 1, STYLE.MONO], [0, 'xy'], [3, 2]], { fonts: [REGULAR, 'NimbusMonL-Regu'], unit: { lineFonts: [0, 0, 1] } })
    expect(faces(mono)).toEqual([['xy', 'cursor-regular']])
    // no mono font in the paper: Latin Modern's typewriter
    expect(faces(need([[2, 1, STYLE.MONO], [0, 'x'], [3, 2]]))).toEqual([['x', 'lm-mono-regular']])
    const red = need([[0, 'a '], [2, 1, 3 << 11], [0, 'b'], [3, 2], [0, ' c']])
    expect(texts(red).map(t => t.colour)).toEqual([0, 3, 0])
  })
})

describe('placeholders', () => {
  const rows: Record<number, PhSpec> = { 2: ph('math', 0, [1, 100, 700, 130, 710, 698]), 3: ph('cite', 0, [1, 200, 700, 220, 710, 698]), 4: ph('display', PH_FLAG.NUMBERED, [1, 72, 600, 540, 620, 590]) }

  it('a display is a block; a citation with page text is page-text with its brackets dropped inside the translation\'s brackets; a formula is a crop glued to the word before', () => {
    const seen: number[][] = []
    const textIn: TextIn = (...a) => { seen.push(a); return '[12]' }
    const tokens = need([[0, 'where'], [1, 2], [0, ' see ('], [1, 3], [0, ') and '], [1, 4], [0, 'then']], { unit: { ph: rows }, textIn })
    expect(tokens.map(t => [t.kind, t.s ?? null, t.mode ?? null, Boolean(t.glue)])).toEqual([
      ['text', 'where', null, false], ['ph', null, 'crop', true], ['space', null, null, false], ['text', 'see', null, false], ['space', null, null, false],
      ['text', '(', null, false], ['ph', '12', 'page-text', true], ['text', ')', null, true], ['space', null, null, false], ['text', 'and', null, false],
      ['block', null, 'kept', false], ['text', 'then', null, false],
    ])
    // the formula's width is its segments' width in ems of the unit's size (30 over 10), a crop of the original's ink
    const crop = tokens.find(t => t.mode === 'crop')!
    expect(crop).toMatchObject({ ph: 2, w: 3, colour: 0 })
    expect(tokens.find(t => t.kind === 'block')).toMatchObject({ ph: 4, w: 0 })
    // the page text is asked for by its segment's rectangle: page, x0, bottom, x1, top
    expect(seen).toEqual([[1, 200, 698, 220, 710]])
    // the page text is drawn in the run's face, at its measure
    const page = tokens.find(t => t.mode === 'page-text')!
    expect(page).toMatchObject({ face: 'termes-regular', script: 'latin', w: 1, ph: 3 })
  })

  it('a formula after a space is not glued, and one before CJK text is not either', () => {
    const spaced = need([[0, 'where '], [1, 2]], { unit: { ph: rows } })
    expect(spaced.map(t => Boolean(t.glue))).toEqual([false, false, false])
    // Chinese breaks between a CJK character and a formula
    const zh = need([[0, '\u6a21\u578b'], [1, 2], [0, '\u6a21']], { unit: { ph: rows }, target: 'zh' })
    expect(zh.map(t => Boolean(t.glue))).toEqual([false, false, false, false])
    // but a formula keeps the punctuation that follows it
    expect(need([[1, 2], [0, ',']], { unit: { ph: rows } }).map(t => Boolean(t.glue))).toEqual([false, true])
  })

  it('page text keeps its own brackets where the translation does not bracket it, or the source does', () => {
    const textIn: TextIn = () => '[12]'
    const own = (pieces: TrPiece[], spec: PhSpec = rows[3]!, target = 'en') => need(pieces, { unit: { ph: { 3: spec } }, textIn, target }).find(t => t.mode === 'page-text')?.s
    expect(own([[0, 'see '], [1, 3]])).toBe('[12]')
    expect(own([[0, 'see ('], [1, 3], [0, ')']])).toBe('12')
    expect(own([[0, 'see ['], [1, 3], [0, ']']])).toBe('12')
    // full-width brackets in the translation, ASCII on the page
    expect(own([[0, '\u6a21\uff08'], [1, 3], [0, '\uff09']], undefined, 'zh')).toBe('12')
    // an opening bracket and no closing one, or a space between: not bracketed
    expect(own([[0, 'see ('], [1, 3], [0, ' x']])).toBe('[12]')
    expect(own([[0, 'see ( '], [1, 3], [0, ')']])).toBe('[12]')
    // the source's own brackets: nothing dropped
    expect(own([[0, 'see ('], [1, 3], [0, ')']], ph('cite', PH_FLAG.SOURCE_BRACKETS, [1, 200, 700, 220, 710, 698]))).toBe('[12]')
    // page text with parentheses of its own, and one whose brackets are not a pair
    const author = (text: string) => need([[0, '('], [1, 3], [0, ')']], { unit: { ph: { 3: rows[3]! } }, textIn: () => text }).find(t => t.mode === 'page-text')?.s
    expect(author('(Smith, 2020)')).toBe('Smith, 2020')
    expect(author('Smith (2020)')).toBe('Smith (2020)')
    expect(author('[1)')).toBe('[1)')
  })

  it('without page text, a citation is a crop, and so is any other visible placeholder', () => {
    expect(need([[0, 'see '], [1, 3]], { unit: { ph: rows } }).at(-1)?.mode).toBe('crop')
    expect(need([[0, 'see '], [1, 3]], { unit: { ph: rows }, textIn: () => null }).at(-1)?.mode).toBe('crop')
    expect(need([[0, 'see '], [1, 3]], { unit: { ph: rows }, textIn: () => '  ' }).at(-1)?.mode).toBe('crop')
    // a character no face holds in the page text: the crop of its ink
    expect(need([[0, 'see '], [1, 3]], { unit: { ph: rows }, textIn: () => '[\ue000]' }).at(-1)?.mode).toBe('crop')
    for (const kind of ['math', 'footnote', 'macro', 'url', 'code', 'other', 'ref', 'eqref']) {
      expect(need([[0, 'a '], [1, 5]], { unit: { ph: { 5: ph(kind) } }, textIn: kind === 'ref' || kind === 'eqref' ? () => '3' : undefined }).at(-1)?.mode, kind).toBe(kind === 'ref' || kind === 'eqref' ? 'page-text' : 'crop')
    }
    // a placeholder of two segments is one crop, as wide as both
    const wrapped = need([[0, 'a '], [1, 5]], { unit: { ph: { 5: ph('math', 0, [1, 100, 700, 130, 710, 698, 1, 72, 688, 92, 698, 686]) } } }).at(-1)!
    expect(wrapped.w).toBeCloseTo(5, 10)
  })

  it('a raised placeholder is raised, glued and a crop of its ink', () => {
    const tokens = need([[0, 'word '], [1, 5]], { unit: { ph: { 5: ph('footnote', PH_FLAG.RAISED) } } })
    expect(tokens.at(-1)).toMatchObject({ kind: 'ph', mode: 'crop', raised: true, glue: true })
    expect(need([[0, 'word'], [1, 5]], { unit: { ph: { 5: ph('cite', PH_FLAG.RAISED) } }, textIn: () => '1' }).at(-1)).toMatchObject({ mode: 'crop', raised: true, glue: true })
    expect(Object.hasOwn(need([[0, 'a'], [1, 5]], { unit: { ph: { 5: ph('math') } } }).at(-1)!, 'raised')).toBe(false)
  })

  it('a LOST placeholder, or a missing math placeholder, makes the unit undrawable: null', () => {
    expect(run([[0, 'a '], [1, 2]], { unit: { ph: { 2: ph('math', PH_FLAG.LOST, []) } } })).toBeNull()
    expect(run([[0, 'a '], [1, 2]], { unit: { ph: { 2: ph('display', PH_FLAG.LOST, []) } } })).toBeNull()
    // no row, and the unit's source says the piece is of a class that has ink
    for (const cls of ['math', 'cite', 'ref', 'eqref', 'code', 'url', 'footnote']) expect(run([[0, 'a '], [1, 2]], { classOf: () => cls }), cls).toBeNull()
  })

  it('a missing row draws nothing, and where the unit\'s source says it has ink, the unit stays the original\'s', () => {
    // the layout maker writes a row for every visible placeholder, found or LOST: a piece with none is an invisible one
    expect(need([[0, 'a '], [1, 9], [0, ' b']]).map(t => t.kind)).toEqual(['text', 'space', 'text'])
    // classOf, given, is a defence: a class with ink for a k with no row is no invisible piece
    const asked: number[] = []
    for (const cls of ['math', 'cite', 'ref', 'eqref', 'code', 'url', 'footnote']) {
      expect(run([[0, 'a '], [1, 9]], { classOf: k => { asked.push(k); return cls } }), cls).toBeNull()
    }
    expect(new Set(asked)).toEqual(new Set([9]))
    // a class with no ink, or none known, leaves the piece invisible
    for (const classOf of [() => null, () => 'macro', () => 'other']) expect(run([[0, 'a '], [1, 9]], { classOf })).not.toBeNull()
    // a k that has a row is read from its row, whatever classOf says
    const rows = { 2: ph('math', 0, [1, 100, 700, 130, 710, 698]) }
    expect(need([[0, 'a '], [1, 2]], { unit: { ph: rows }, classOf: () => 'macro' }).at(-1)?.mode).toBe('crop')
    expect(need([[0, 'a '], [1, 2]], { unit: { ph: rows }, classOf: () => 'math' }).at(-1)?.mode).toBe('crop')
  })

  it('every kind of token has its width in ems: at a size f it is w times f', () => {
    const tokens = need([[0, 'ab '], [1, 2], [0, ' ('], [1, 3], [0, ')']], { unit: { ph: { 2: ph('math', 0, [1, 100, 700, 130, 710, 698]), 3: ph('cite', 0, [1, 200, 700, 220, 710, 698]) } }, textIn: () => '[1]' })
    // a text of two Latin characters (the fake measure's 100 at 100 px) is 1 em, a space a quarter, a formula of 30 units
    // in a unit of size 10 is 3, page text of one character 0.5 em after its brackets are dropped
    expect(tokens.map(t => [t.kind, t.mode ?? null, t.w])).toEqual([
      ['text', null, 1], ['space', null, 0.25], ['ph', 'crop', 3], ['space', null, 0.25], ['text', null, 0.5], ['ph', 'page-text', 0.5], ['text', null, 0.5],
    ])
  })

  it('an invisible placeholder draws nothing', () => {
    // a placeholder with no row, whose class has no ink, or whose class nothing says
    for (const classOf of [undefined, () => null, () => 'macro']) {
      const tokens = need([[0, 'a'], [1, 9], [0, 'b']], { classOf })
      expect(tokens.map(t => [t.kind, t.s]), String(classOf)).toEqual([['text', 'a'], ['text', 'b']])
    }
    // a row marked EMPTY: found, with no ink
    expect(need([[0, 'a '], [1, 2], [0, ' b']], { unit: { ph: { 2: ph('math', PH_FLAG.EMPTY, []) } } }).map(t => t.kind)).toEqual(['text', 'space', 'text'])
    // and the white space around it is one space, as trText has it
    expect(need([[0, 'a '], [1, 9], [0, ' b']]).map(t => t.kind)).toEqual(['text', 'space', 'text'])
  })
})

describe('the characters', () => {
  it('a character no face holds makes the unit undrawable: null', () => {
    expect(run([[0, 'a\ue000b']])).toBeNull()
    expect(run([[0, 'a \u{1f600}']])).toBeNull()
    expect(run([[0, 'plain text']])).not.toBeNull()
    // a CJK character in a target with no CJK roles is set as Latin, and no Latin face holds it
    expect(run([[0, 'a \u6a21\u578b']], { target: 'en' })).toBeNull()
    expect(run([[0, 'a \u6a21\u578b']], { target: 'zh' })).not.toBeNull()
  })

  it('Chinese breaks between CJK characters, and its Latin words stay whole', () => {
    const tokens = need([[0, '\u6211\u4eec\u4f7f\u7528BERT\u6a21\u578b\uff0c\u201cok\u201d.']], { target: 'zh' })
    expect(tokens.map(t => [t.s, t.script])).toEqual([
      ['\u6211', 'cjk'], ['\u4eec', 'cjk'], ['\u4f7f', 'cjk'], ['\u7528', 'cjk'], ['BERT', 'latin'], ['\u6a21', 'cjk'], ['\u578b', 'cjk'], ['\uff0c', 'cjk'],
      ['\u201c', 'cjk'], ['ok', 'latin'], ['\u201d', 'cjk'], ['.', 'latin'],
    ])
    // each CJK character is measured by itself, a Latin word whole, every width in ems: the fake measure's 100 px is 1
    expect(tokens.map(t => t.w)).toEqual([1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 0.5])
    // curly quotes are CJK in Chinese and Japanese only
    expect(texts(need([[0, '\u201cok\u201d']], { target: 'ja' })).map(t => t.script)).toEqual(['cjk', 'latin', 'cjk'])
    expect(texts(need([[0, '\u201cok\u201d']], { target: 'ko' })).map(t => t.script)).toEqual(['latin'])
  })

  it('kinsoku, as no break before a character that may not begin a line or after one that may not end it', () => {
    const tokens = need([[0, '\u6a21\uff08\u578b\uff09\u3002\u6a21']], { target: 'zh' })
    expect(tokens.map(t => [t.s, Boolean(t.glue)])).toEqual([['\u6a21', false], ['\uff08', false], ['\u578b', true], ['\uff09', true], ['\u3002', true], ['\u6a21', false]])
  })

  it('kinsoku holds across a space: no break after an opening mark, none before a closing one', () => {
    const rows = need([[0, 'aa ( bb ) cc']])
    expect(rows.map(t => [t.s ?? ' ', Boolean(t.glue)])).toEqual([
      ['aa', false], [' ', false], ['(', false], [' ', true], ['bb', true], [' ', true], [')', true], [' ', false], ['cc', false],
    ])
    // not for a space between two CJK characters, which is none in Chinese
    expect(need([[0, '\u6a21 \uff09']], { target: 'zh' }).map(t => [t.kind, Boolean(t.glue)])).toEqual([['text', false], ['text', true]])
  })

  it('full-width marks are compressible, and not those of Traditional Chinese, which centres them', () => {
    const pieces: TrPiece[] = [[0, '\u6a21\uff08\u578b\uff09\u3002.']]
    expect(need(pieces, { target: 'zh' }).map(t => t.punct ?? null)).toEqual([null, 'open', null, 'close', 'close', null])
    expect(need(pieces, { target: 'ja' }).map(t => t.punct ?? null)).toEqual([null, 'open', null, 'close', 'close', null])
    expect(need(pieces, { target: 'zh-Hant' }).map(t => t.punct ?? null)).toEqual([null, null, null, null, null, null])
  })

  it('autospace goes between a CJK character and a Latin letter or digit, and never beside a CJK mark', () => {
    const asp = (text: string, target = 'zh') => need([[0, text]], { target }).map(t => [t.s, Boolean(t.asp)])
    expect(asp('\u6a21BERT\u578b')).toEqual([['\u6a21', false], ['BERT', true], ['\u578b', true]])
    expect(asp('\u7b2c3\u7ae0')).toEqual([['\u7b2c', false], ['3', true], ['\u7ae0', true]])
    expect(asp('\uff08BERT\uff09')).toEqual([['\uff08', false], ['BERT', false], ['\uff09', false]])
    expect(asp('\u6a21\uff0cBERT')).toEqual([['\u6a21', false], ['\uff0c', false], ['BERT', false]])
    // a Latin mark is no letter or digit; a space is the space; Korean has no autospace of its own
    expect(asp('\u6a21(BERT)')).toEqual([['\u6a21', false], ['(BERT)', false]])
    expect(need([[0, '\u6a21 BERT']], { target: 'zh' }).map(t => Boolean(t.asp))).toEqual([false, false, false])
    expect(need([[0, 'BERT\ub97c']], { target: 'ko' }).map(t => Boolean(t.asp))).toEqual([false, false])
    expect(asp('\u6a21BERT', 'ja')[1]).toEqual(['BERT', true])
    // the long vowel mark and the small kana are letters, and take the gap; a Japanese full stop does not
    expect(asp('\u30b3\u30fcBERT', 'ja')).toEqual([['\u30b3', false], ['\u30fc', false], ['BERT', true]])
    expect(asp('\u30fcBERT', 'ja')[1]).toEqual(['BERT', true])
  })

  it('Korean words stay whole, and a Latin word and its Hangul particle stand together', () => {
    const tokens = need([[0, '\ud55c\uad6d\uc5b4 BERT\ub97c \ubb38\uc7a5']], { target: 'ko' })
    expect(tokens.map(t => [t.kind, t.s ?? null, t.script ?? null, Boolean(t.glue)])).toEqual([
      ['text', '\ud55c\uad6d\uc5b4', 'cjk', false], ['space', null, null, false], ['text', 'BERT', 'latin', false], ['text', '\ub97c', 'cjk', true],
      ['space', null, null, false], ['text', '\ubb38\uc7a5', 'cjk', false],
    ])
    // Hangul is set in the Korean role: Un Batang
    expect(texts(tokens)[0]!.face).toBe('unbatang')
    expect(tokens.find(t => t.kind === 'space')?.face).toBe('unbatang')
  })

  it('a Latin word is cut after its own hyphen or slash, a URL or a mono run after its separators', () => {
    const parts = (pieces: TrPiece[]) => texts(need(pieces)).map(t => [t.s, Boolean(t.glue)])
    expect(parts([[0, 'state-of-the-art']])).toEqual([['state-', false], ['of-', false], ['the-', false], ['art', false]])
    expect(parts([[0, 'and/or']])).toEqual([['and/', false], ['or', false]])
    expect(parts([[0, 'x-1 -3 4-5']])).toEqual([['x-1', false], ['-3', false], ['4-5', false]])
    expect(parts([[0, 'https://example.com/a-b?x=1']])).toEqual([['https://', false], ['example.', false], ['com/', false], ['a-', false], ['b?', false], ['x=', false], ['1', false]])
    expect(parts([[2, 1, STYLE.MONO], [0, 'src/main_v2.py'], [3, 2]])).toEqual([['src/', false], ['main_', false], ['v2.', false], ['py', false]])
    // the chunks of one word stay one word to the line: a break between them is the line's to take, none after a plain letter run
    const joined = texts(need([[0, 'un'], [2, 1, STYLE.BOLD], [0, 'believ'], [3, 2], [0, 'able']]))
    expect(joined.map(t => [t.s, Boolean(t.glue)])).toEqual([['un', false], ['believ', true], ['able', true]])
  })

  it('a ligature is one character that spans its characters', () => {
    const tokens = need([[0, 'a---b c--d ``q\'\' e']])
    expect(tokens.map(t => [t.s ?? ' ', t.at, t.len])).toEqual([
      ['a', 0, 1], ['\u2014', 1, 3], ['b', 4, 1], [' ', 5, 1], ['c', 6, 1], ['\u2013', 7, 2], ['d', 9, 1], [' ', 10, 1],
      ['\u201c', 11, 2], ['q', 13, 1], ['\u201d', 14, 2], [' ', 16, 1], ['e', 17, 1],
    ])
    // not in a typewriter font: two hyphens stay two
    expect(texts(need([[2, 1, STYLE.MONO], [0, 'a--b'], [3, 2]])).map(t => t.s)).toEqual(['a--', 'b'])
  })
})

describe('hyphenation', () => {
  const hyphen: Hyphenator = { lang: 'de', left: 2, right: 3, points: () => [] }
  const hyph = (pieces: TrPiece[], o: Partial<Opts> = {}) => need(pieces, { hyphen, target: 'de', ...o }).filter(t => t.kind === 'text').map(t => [t.s, t.hyph ?? null])

  it('a word of five letters or more takes the language of its hyphenator, and only when there is one', () => {
    expect(hyph([[0, 'Donau of translation, (international) 12345 a1b2c3']])).toEqual([['Donau', 'de'], ['of', null], ['translation,', 'de'], ['(international)', 'de'], ['12345', null], ['a1b2c3', null]])
    expect(need([[0, 'translation']], { target: 'de' })[0]).not.toHaveProperty('hyph')
  })

  it('not in a heading or a title, not in mono, not in a URL', () => {
    expect(hyph([[0, 'translation']], { unit: { kind: 'heading' } })).toEqual([['translation', null]])
    expect(hyph([[0, 'translation']], { unit: { title: true } })).toEqual([['translation', null]])
    expect(hyph([[0, 'translation']], { unit: { kind: 'caption' } })).toEqual([['translation', 'de']])
    expect(hyph([[2, 1, STYLE.MONO], [0, 'translation'], [3, 2]])).toEqual([['translation', null]])
    expect(hyph([[0, 'https://translation.org']])).toEqual([['https://', null], ['translation.', null], ['org', null]])
    expect(hyph([[0, 'translation']], { fonts: ['CMTT10'] })).toEqual([['translation', null]])
  })

  it('Latin words of a CJK target hyphenate in the target\'s hyphenator too', () => {
    expect(need([[0, '\u6a21 translation']], { target: 'zh', hyphen: { ...hyphen, lang: 'en' } }).filter(t => t.hyph).map(t => [t.s, t.hyph])).toEqual([['translation', 'en']])
  })
})

describe('offsets', () => {
  it("every token's at and len index trText, and a ligature spans its characters", () => {
    const pieces: TrPiece[] = [[0, ' Foo  bar '], [2, 1, STYLE.BOLD], [0, 'a---b'], [3, 2], [0, " c--d ``q'' end "], [1, 7], [0, ' x\u00a0y\n']]
    const trt = trText(pieces)
    const tokens = need(pieces, { unit: { ph: { 7: ph('math') } } })
    const LIGATURES: Record<string, string> = { '\u2014': '---', '\u2013': '--', '\u201c': '``', '\u201d': "''" }
    let at = 0
    for (const t of tokens) {
      expect(t.at, JSON.stringify(t)).toBeGreaterThanOrEqual(at)
      expect(t.at + t.len).toBeLessThanOrEqual(trt.length)
      at = t.at
      if (t.kind === 'text') expect(trt.slice(t.at, t.at + t.len), t.s).toBe(LIGATURES[t.s!] ?? t.s)
      if (t.kind === 'space') expect(trt.slice(t.at, t.at + t.len)).toBe(t.len === 1 ? ' ' : '')
    }
    expect(tokens.filter(t => t.s && LIGATURES[t.s]).map(t => [t.s, t.len])).toEqual([['\u2014', 3], ['\u2013', 2], ['\u201c', 2], ['\u201d', 2]])
    // the words are all there, in order, at the offsets trText has them
    expect(texts(tokens).filter(t => /^[A-Za-z]{3,}$/.test(t.s!)).map(t => [t.s, t.at])).toEqual([['Foo', 0], ['bar', 4], ['end', 25]])
    // a placeholder is the one space trText has for it: its offset is that space's
    const crop = tokens.find(t => t.mode === 'crop')!
    expect(trt[crop.at]).toBe(' ')
    // the last word ends at the end of trText, whose trailing white space is trimmed
    expect(tokens.at(-1)).toMatchObject({ s: 'y' })
    expect(trt.length).toBe(tokens.at(-1)!.at + 1)
  })

  it('white space that trText collapses is a space token of no length, and the leading and trailing are no token', () => {
    const tokens = need([[0, '  a  '], [1, 7], [0, '  b  ']], { unit: { ph: { 7: ph('math') } } })
    expect(tokens.map(t => t.kind)).toEqual(['text', 'space', 'ph', 'space', 'text'])
    // trText's one space is the first space's; the placeholder and the second space stand on it with a length of 0
    expect(tokens.map(t => [t.at, t.len])).toEqual([[0, 1], [1, 1], [1, 0], [1, 0], [2, 1]])
  })

  it('a forced break is a token that ends the line, with the white space around it dropped', () => {
    const tokens = need([[0, 'a '], [0, '\n'], [0, ' b']])
    expect(tokens.map(t => t.kind)).toEqual(['text', 'break', 'text'])
    expect(tokens[1]).toMatchObject({ w: 0 })
    expect(Boolean(tokens[2]!.glue)).toBe(false)
  })

  it('a unit with no lines, or a piece that is none, is not drawn', () => {
    expect(run([[0, 'a']], { unit: { lineFonts: [] } })).toBeNull()
    expect(run([[0, 'a'], [9, 1] as unknown as TrPiece])).toBeNull()
    expect(run([[0, 5] as unknown as TrPiece])).toBeNull()
    expect(run('x' as unknown as TrPiece[])).toBeNull()
    expect(need([])).toEqual([])
  })
})
