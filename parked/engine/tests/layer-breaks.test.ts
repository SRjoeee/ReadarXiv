import { describe, expect, it } from 'vitest'
import { layerRulesFor } from '@/pdf-reader/engine/rules/layer-rules.mjs'
import { type Broken, breakLines, CJK_JUST_MAX, placeLines, SPACE_MIN } from '@/pdf-reader/engine/layer/breaks.mjs'
import { type Hyphenator, loadHyphenator } from '@/pdf-reader/engine/layer/hyphen.mjs'
import { STYLE } from '@/pdf-reader/engine/layer/pieces.mjs'
import { NO_END, NO_START, type Token } from '@/pdf-reader/engine/layer/tokens.mjs'
import { contextOf, slotsOf, tokenize } from './helpers/layer-fixtures'

// Tokens into lines, greedily, and the lines' items placed: kinsoku, compression, autospace, Korean's spaces, hyphenation,
// the cut of a word longer than its line, justification and the kept blocks. The measure is a Latin character 50, a CJK one
// 100 and a space 25 at 100 px, so at a size of 100 every width is its own number. The CJK of the inputs is written as
// unicode escapes (a four-character Chinese phrase is four of them)

type Compress = 0 | 1 | 2
const state = (compress: Compress = 0, track = 0, letter = 0) => ({ track, letter, compress })
const SIZE = 100
const lay = (tokens: Token[], widths: number[], target: string, st = state(), hyphen: Hyphenator | null = null) => breakLines(tokens, slotsOf(widths), SIZE, st, contextOf(target, hyphen))
/** a line as text: spaces as a space, a placeholder as its k */
const text = (line: Broken['lines'][number]) => line.items.map(it => (it.t.kind === 'space' ? ' ' : (it.t.s ?? `[${it.t.ph}]`))).join('')
const texts = (b: Broken) => b.lines.map(text)

describe('the exact values', () => {
  it('the shrink of a space and the stretch of a CJK gap', () => {
    expect(SPACE_MIN).toBe(0.8)
    expect(CJK_JUST_MAX).toBe(0.25)
  })
})

describe('kinsoku', () => {
  it('\u3002 never begins a line and \uff08 never ends one, over 50 random cut widths', () => {
    // a seeded generator: the same text and the same 50 widths on every run
    let seed = 20261006
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
    const HAN = [...'\u6a21\u578b\u4f7f\u7528\u6211\u4eec\u5b66\u4e60\u6570\u636e\u8bad\u7ec3\u7f51\u7edc']
    let source = HAN[0]!
    while ([...source].length < 160) {
      const r = rnd()
      source += r < 0.14 ? '\u3002' : r < 0.28 ? '\uff08' : HAN[Math.floor(rnd() * HAN.length)]!
    }
    source += HAN[1]
    const tokens = tokenize(source, 'zh')
    let marks = 0
    for (let n = 0; n < 50; n++) {
      const width = 800 + Math.floor(rnd() * 700)
      const b = lay(tokens, Array(60).fill(width), 'zh')
      expect(b.rest, `width ${width}`).toBe(0)
      expect(b.lines.reduce((sum, l) => sum + l.items.length, 0)).toBe(tokens.length)
      for (const line of b.lines) {
        const first = line.items[0]!.t.s!, last = line.items.at(-1)!.t.s!
        expect(NO_START.includes(first[0]!), `${text(line)} begins with ${first}`).toBe(false)
        expect(NO_END.includes(last.at(-1)!), `${text(line)} ends with ${last}`).toBe(false)
        marks += line.items.filter(it => it.t.s === '\u3002' || it.t.s === '\uff08').length
      }
    }
    expect(marks).toBeGreaterThan(500)
  })

  it('a mark that may not begin a line takes the character before it to the next line', () => {
    // three characters, a full stop and one more, in lines of three: the full stop would begin the second line, so the character before it goes down with it
    const b = lay(tokenize('\u6a21\u578b\u4f7f\u3002\u7528', 'zh'), [300, 300], 'zh')
    expect(texts(b)).toEqual(['\u6a21\u578b', '\u4f7f\u3002\u7528'])
    // an opening mark goes down with the character it opens
    expect(texts(lay(tokenize('\u6a21\u578b\uff08\u4f7f\u7528', 'zh'), [300, 300], 'zh'))).toEqual(['\u6a21\u578b', '\uff08\u4f7f\u7528'])
  })

  it('holds across a space: no line ends on an opening mark, none begins with a closing one', () => {
    // aa ( bb in lines of 200: the opening bracket goes down with the word it opens
    expect(texts(lay(tokenize('aa ( bb', 'en'), [200, 200], 'en'))).toEqual(['aa', '( bb'])
    // aa bb ) cc: the closing one stays with the word it closes
    expect(texts(lay(tokenize('aa bb ) cc', 'en'), [200, 200, 200], 'en'))).toEqual(['aa', 'bb )', 'cc'])
    // a formula after the bracket, too
    const ph = { 5: { kind: 'math', segs: [1, 100, 700, 130, 710, 698] } }
    expect(texts(lay(tokenize([[0, 'aa ( '], [1, 5]], 'en', { unit: { ph } }), [250, 400], 'en'))).toEqual(['aa', '( [5]'])
  })

  it('a chain longer than its line is cut where it must be, never lost', () => {
    const tokens = tokenize('\u6a21\u3002\u3002\u3002\u3002\u3002', 'zh')
    const b = lay(tokens, [250, 250, 250, 250], 'zh')
    expect(b.rest).toBe(0)
    expect(b.lines.reduce((sum, l) => sum + l.items.length, 0)).toBe(6)
  })
})

describe('compression', () => {
  const widths = (source: string, compress: Compress, target = 'zh', slots = [2000]) =>
    lay(tokenize(source, target), slots, target, state(compress)).lines.map(l => l.items.map(it => [it.w, it.shift]))

  it('at 1 and 2', () => {
    // \u6a21\uff08\u578b\uff09\u3002\u6a21
    const source = '\u6a21\uff08\u578b\uff09\u3002\u6a21'
    expect(widths(source, 0)).toEqual([[[100, 0], [100, 0], [100, 0], [100, 0], [100, 0], [100, 0]]])
    // 1: two closing marks together lose 50, the first its trailing half; the opening mark inside the line keeps its 100
    expect(widths(source, 1)).toEqual([[[100, 0], [100, 0], [100, 0], [50, 0], [100, 0], [100, 0]]])
    // 2: every mark is 50 wide; an opening mark is drawn half an em back, its blank half before the line's text
    expect(widths(source, 2)).toEqual([[[100, 0], [50, -50], [100, 0], [50, 0], [50, 0], [100, 0]]])
  })

  it('an opening mark at a line\'s start loses 50 of its 100, at the first line and after a wrap', () => {
    expect(widths('\uff08\u6a21\u578b', 1)).toEqual([[[50, -50], [100, 0], [100, 0]]])
    expect(widths('\uff08\u6a21\u578b', 0)).toEqual([[[100, 0], [100, 0], [100, 0]]])
    expect(widths(`${'\u6a21'.repeat(5)}\uff08\u6a21`, 1, 'zh', [500, 500])).toEqual([Array(5).fill([100, 0]), [[50, -50], [100, 0]]])
  })

  it('an opening mark after another mark loses its blank half, and a closing mark before an opening one its trailing half', () => {
    expect(widths('\u6a21\uff08\uff08\u578b', 1)).toEqual([[[100, 0], [100, 0], [50, -50], [100, 0]]])
    expect(widths('\u6a21\uff09\uff08\u578b', 1)).toEqual([[[100, 0], [50, 0], [100, 0], [100, 0]]])
  })

  it('a closing mark at a line\'s end hangs its blank half in the margin, below 2', () => {
    // \u6a21\u578b\u4f7f\u3002\u7528 in lines of 350: the full stop fits by hanging half of itself past the margin
    for (const compress of [0, 1] as const) {
      const b = lay(tokenize('\u6a21\u578b\u4f7f\u3002\u7528', 'zh'), [350, 350], 'zh', state(compress))
      expect(texts(b), `compress ${compress}`).toEqual(['\u6a21\u578b\u4f7f\u3002', '\u7528'])
      expect(b.lines[0]!.items.map(it => it.w)).toEqual([100, 100, 100, 50])
    }
    // one unit less and it does not fit even so
    expect(texts(lay(tokenize('\u6a21\u578b\u4f7f\u3002\u7528', 'zh'), [349, 350], 'zh'))).toEqual(['\u6a21\u578b', '\u4f7f\u3002\u7528'])
    // at 2 the mark is already 50: nothing more to hang, and no mark of another script hangs
    const two = lay(tokenize('\u6a21\u578b\u4f7f\u3002\u7528', 'zh'), [350, 350], 'zh', state(2))
    expect(texts(two)).toEqual(['\u6a21\u578b\u4f7f\u3002', '\u7528'])
    expect(two.lines[0]!.items.map(it => it.w)).toEqual([100, 100, 100, 50])
    // Traditional Chinese centres its marks: they have no half to hang, and no token is a mark
    expect(texts(lay(tokenize('\u6a21\u578b\u4f7f\u3002\u7528', 'zh-Hant'), [350, 350], 'zh-Hant'))).toEqual(['\u6a21\u578b', '\u4f7f\u3002\u7528'])
  })

  it('a centred block keeps its closing mark whole', () => {
    const b = breakLines(tokenize('\u6a21\u578b\u4f7f\u3002', 'zh'), slotsOf([1000], s => { s.centred = true }), SIZE, state(), contextOf('zh'))
    expect(b.lines[0]!.items.map(it => it.w)).toEqual([100, 100, 100, 100])
  })

  it('tracking and letter spacing are in ems of the size, per character', () => {
    const zh = lay(tokenize('\u6a21\u578b', 'zh'), [2000], 'zh', state(0, -0.05))
    expect(zh.lines[0]!.items.map(it => it.w)).toEqual([95, 95])
    const en = lay(tokenize('aa bb', 'en'), [2000], 'en', state(0, 0, -0.01))
    expect(en.lines[0]!.items.map(it => it.w)).toEqual([98, 25, 98])
  })
})

describe('autospace', () => {
  const gaps = (source: string, target = 'zh') => lay(tokenize(source, target), [3000], target).lines[0]!.items.map(it => it.asp)

  it('0.2 em between CJK and a Latin word, none beside a CJK mark', () => {
    // \u6a21BERT\u578b: a fifth of an em before the word and again before the character after it
    expect(gaps('\u6a21BERT\u578b')).toEqual([0, 20, 20])
    expect(gaps('\u7b2c3\u7ae0')).toEqual([0, 20, 20])
    expect(gaps('\uff08BERT\uff09')).toEqual([0, 0, 0])
    expect(gaps('\u6a21\uff0cBERT')).toEqual([0, 0, 0])
    // Japanese too; Korean and the alphabets have none of their own
    expect(gaps('\u6a21BERT', 'ja')).toEqual([0, 20])
    expect(gaps('\ud55c\uad6dBERT\ub97c', 'ko')).toEqual([0, 0, 0])
    // the gap is part of the line's width: 100 + 20 + 200 + 20 + 100
    const b = lay(tokenize('\u6a21BERT\u578b', 'zh'), [3000], 'zh')
    expect(b.lines[0]!.items.map(it => it.x)).toEqual([0, 120, 340])
  })

  it('and none at the start of a line, where there is nothing to stand away from', () => {
    const b = lay(tokenize('\u6a21\u578b\u4f7fBERT', 'zh'), [300, 300], 'zh')
    expect(texts(b)).toEqual(['\u6a21\u578b\u4f7f', 'BERT'])
    expect(b.lines[1]!.items[0]!.asp).toBe(0)
  })
})

describe('Korean and the alphabets', () => {
  it('Korean breaks at spaces only; a word longer than its line is cut by characters', () => {
    const source = '\ud55c\uad6d\uc5b4 \ubb38\uc7a5 \ud14c\uc2a4\ud2b8'
    const tokens = tokenize(source, 'ko')
    const b = lay(tokens, [600, 600], 'ko')
    expect(texts(b)).toEqual(['\ud55c\uad6d\uc5b4 \ubb38\uc7a5', '\ud14c\uc2a4\ud2b8'])
    // every word whole: each text item is one of the tokens, not a piece of one
    for (const line of b.lines) for (const it of line.items) expect(tokens).toContain(it.t)
    // one word of six characters in lines of 250: two characters a line
    const word = tokenize('\ud55c\uad6d\uc5b4\ubb38\uc7a5\ud14c', 'ko')
    const cut = lay(word, [250, 250, 250, 250], 'ko')
    expect(texts(cut)).toEqual(['\ud55c\uad6d', '\uc5b4\ubb38', '\uc7a5\ud14c'])
    expect(cut.lines.map(l => [l.items[0]!.t.at, l.items[0]!.t.len])).toEqual([[0, 2], [2, 2], [4, 2]])
    expect(cut.rest).toBe(0)
    // a Hangul particle stays with the Latin word before it
    expect(texts(lay(tokenize('BERT\ub97c BERT\ub97c', 'ko'), [300, 300], 'ko'))).toEqual(['BERT\ub97c', 'BERT\ub97c'])
  })

  it('a word longer than its line is cut by characters, after the words before it have a line of their own, with a hyphen at each cut', () => {
    const b = lay(tokenize('ab abcdefghij', 'en'), [200, 200, 200, 200], 'en')
    expect(texts(b)).toEqual(['ab', 'abc-', 'def-', 'ghij'])
    // the hyphen is drawn, not in the text: each piece's offsets are its letters'
    expect(b.lines.slice(1).map(l => [l.items[0]!.t.at, l.items[0]!.t.len])).toEqual([[3, 3], [6, 3], [9, 4]])
    // the pieces are tokens of the result, the whole word is not
    expect(b.tokens.map(t => t.s ?? ' ')).toEqual(['ab', ' ', 'abc-', 'def-', 'ghij'])
    expect(b.tokens.slice(2).map(t => t.w)).toEqual([2, 2, 2])
    expect(b.rest).toBe(0)
    expect(b.overflow).toBe(0)
  })

  it('a URL, a typewriter run and a CJK word are cut without a hyphen', () => {
    // the first piece of a URL fits a line of its own; the second, 26 letters, is cut in sixes
    expect(texts(lay(tokenize('http://abcdefghijklmnopqrstuvwxyz', 'en'), [400, 300, 300, 300, 300, 300], 'en'))).toEqual(['http://', 'abcdef', 'ghijkl', 'mnopqr', 'stuvwx', 'yz'])
    const mono = tokenize([[2, 1, STYLE.MONO], [0, 'abcdefghijklmnop'], [3, 2]], 'en')
    expect(texts(lay(mono, [300, 300, 300], 'en'))).toEqual(['abcdef', 'ghijkl', 'mnop'])
  })

  it('a Latin word breaks after its own hyphen, and a URL after its separators', () => {
    expect(texts(lay(tokenize('state-of-the-art', 'en'), [500, 500], 'en'))).toEqual(['state-of-', 'the-art'])
    expect(texts(lay(tokenize('http://example.com/a', 'en'), [800, 800], 'en'))).toEqual(['http://example.', 'com/a'])
  })
})

describe('hyphenation', () => {
  // a fake pattern set: where a word may break, in letters from its start
  const german: Hyphenator = { lang: 'de', left: 2, right: 2, points: word => (word === 'Donaudampfschiff' ? [5, 9] : word === 'Maschinenbau' ? [1, 6] : []) }
  const source = 'ein Donaudampfschiff fuhr'

  it('draws a hyphen at the last point that fits, and the rest begins the next line', () => {
    const tokens = tokenize(source, 'de', { hyphen: german })
    const b = lay(tokens, [600, 1000, 1000], 'de', state(), german)
    expect(texts(b)).toEqual(['ein Donau-', 'dampfschiff fuhr'])
    // the first piece takes the offsets of its letters and no more: its hyphen is drawn, not in the text
    const [head, tail] = [b.lines[0]!.items[2]!.t, b.lines[1]!.items[0]!.t]
    expect([head.s, head.at, head.len, head.w]).toEqual(['Donau-', 4, 5, 3])
    expect([tail.s, tail.at, tail.len, tail.w]).toEqual(['dampfschiff', 9, 11, 5.5])
    expect(b.tokens).toHaveLength(tokens.length + 1)
    expect(b.rest).toBe(0)
    // the head carries no mark of a word to hyphenate, the tail still does
    expect(head.hyph).toBeUndefined()
    // the last point that fits: a wider line takes the later one, a narrower one the earlier, and one narrower than both none
    expect(texts(lay(tokens, [700, 1000, 1000], 'de', state(), german))[0]).toBe('ein Donaudamp-')
    expect(texts(lay(tokens, [480, 1000, 1000], 'de', state(), german))[0]).toBe('ein Donau-')
    expect(texts(lay(tokens, [360, 1000, 1000], 'de', state(), german))[0]).toBe('ein')
  })

  it('keeps the fewest letters of the language on each side of a break', () => {
    const fussy: Hyphenator = { ...german, left: 6, right: 2 }
    const tokens = tokenize(source, 'de', { hyphen: fussy })
    // the point 5 leaves five letters before it, and the language asks for six
    expect(texts(lay(tokens, [600, 1000, 1000], 'de', state(), fussy))[0]).toBe('ein')
  })

  it('a heading does not hyphenate, nor a word the tokens do not mark', () => {
    const heading = tokenize(source, 'de', { hyphen: german, unit: { kind: 'heading' } })
    const b = lay(heading, [600, 1000, 1000], 'de', state(), german)
    expect(texts(b)).toEqual(['ein', 'Donaudampfschiff', 'fuhr'])
    expect(b.tokens).toHaveLength(heading.length)
    for (const line of b.lines) for (const it of line.items) expect(it.t.s ?? '').not.toContain('-')
    // a word with no `hyph` of its own is never given one by the breaker
    const marked = tokenize(source, 'de', { hyphen: null })
    expect(texts(lay(marked, [600, 1000, 1000], 'de', state(), german))[0]).toBe('ein')
  })

  it('a first word wider than an empty line is hyphenated by its patterns before it is cut by characters', () => {
    // 480 wide: the patterns' last point that fits, then the long rest, which they have no point for, cut with its hyphen
    expect(texts(lay(tokenize('Donaudampfschiff', 'de', { hyphen: german }), [480, 480, 480], 'de', state(), german))).toEqual(['Donau-', 'dampfsch-', 'iff'])
    // with no patterns it is cut by characters alone, the hyphen still drawn
    expect(texts(lay(tokenize('Donaudampfschiff', 'de'), [480, 480, 480], 'de'))).toEqual(['Donaudam-', 'pfschiff'])
  })

  it('keeps the fewest letters of the language after a break, too', () => {
    // right 8: the point 9 leaves seven letters, so the line takes the earlier point though the later one fits
    const strict: Hyphenator = { ...german, right: 8 }
    expect(texts(lay(tokenize(source, 'de', { hyphen: strict }), [700, 1000, 1000], 'de', state(), strict))[0]).toBe('ein Donau-')
    expect(texts(lay(tokenize(source, 'de', { hyphen: german }), [700, 1000, 1000], 'de', state(), german))[0]).toBe('ein Donaudamp-')
  })

  it('without a hyphenator nothing hyphenates', () => {
    expect(texts(lay(tokenize(source, 'de'), [600, 1000, 1000], 'de'))[0]).toBe('ein')
  })

  it.skip('German hyphenates with its patterns and draws a hyphen; a heading does not hyphenate (Slice 2: loadHyphenator holds no patterns before then)', async () => {
    const patterns = await loadHyphenator('de')
    expect(patterns).not.toBeNull()
    const tokens = tokenize('Donaudampfschifffahrtsgesellschaft', 'de', { hyphen: patterns })
    const b = lay(tokens, [900, 900, 900, 900], 'de', state(), patterns)
    expect(b.lines.some(l => text(l).endsWith('-'))).toBe(true)
    const heading = tokenize('Donaudampfschifffahrtsgesellschaft', 'de', { hyphen: patterns, unit: { kind: 'heading' } })
    expect(lay(heading, [900, 900, 900, 900], 'de', state(), patterns).lines.some(l => text(l).endsWith('-'))).toBe(false)
  })
})

describe('justification', () => {
  const placed = (source: string, widths: number[], target: string, slotEdit?: (s: ReturnType<typeof slotsOf>[number], i: number) => void) => {
    const b = breakLines(tokenize(source, target), slotsOf(widths, slotEdit), SIZE, state(), contextOf(target))
    placeLines(b, SIZE, { rules: layerRulesFor(target), target })
    return b
  }

  it('spaces take the slack in alphabets up to spaceMax, then the line is ragged', () => {
    // aa bb cc dd in 490: 15 over three spaces, 5 each, well within 1.2 of a space's 25
    const just = placed('aa bb cc dd ee', [490, 1000], 'en')
    expect(texts(just)).toEqual(['aa bb cc dd', 'ee'])
    expect(just.lines[0]!.mode).toBe('just')
    expect(just.lines[0]!.items.map(it => it.x)).toEqual([0, 100, 130, 230, 260, 360, 390])
    const end = just.lines[0]!.items.at(-1)!
    expect(end.x + end.w).toBe(490)
    // the same words and a long one that does not fit: 125 over three spaces is more than 1.2 of a space each
    const ragged = placed('aa bb cc dd eeeeeeeeee', [600, 1000], 'en')
    expect(texts(ragged)).toEqual(['aa bb cc dd', 'eeeeeeeeee'])
    expect(ragged.lines[0]!.mode).toBe('ragged')
    expect(ragged.lines[0]!.items.map(it => it.x)).toEqual([0, 100, 125, 225, 250, 350, 375])
    // a line of one word has no space to take it
    expect(placed('aaaa bbbbbbbb', [450, 1000], 'en').lines[0]!.mode).toBe('ragged')
    // spaceMax is the extra a space may take: 28 more on each space of 25 is within 1.2 of its width, where a width grown to
    // at most 1.2 of its own would allow 5
    const extra = placed('aa bb cc dd eeeeeeeeee', [559, 1000], 'en')
    expect(extra.lines[0]!.mode).toBe('just')
    expect(extra.lines[0]!.items.map(it => it.x)).toEqual([0, 100, 153, 253, 306, 406, 459])
  })

  it('spaces shrink to SPACE_MIN of their width to fit a line, and no more', () => {
    // aa bb is 225; 220 is the least its space can be shrunk to
    const fit = placed('aa bb', [220], 'en')
    expect(texts(fit)).toEqual(['aa bb'])
    expect(fit.lines[0]!.items.map(it => it.x)).toEqual([0, 100, 120])
    expect(texts(placed('aa bb', [219, 219], 'en'))).toEqual(['aa', 'bb'])
  })

  it('CJK gaps take the slack up to 0.25 em each, then the line is ragged', () => {
    // six characters in 650: 50 over five gaps, 10 each
    const just = placed('\u6a21\u578b\u4f7f\u7528\u6a21\u578b\u4f7f\u7528', [650, 1000], 'zh')
    expect(texts(just)).toEqual(['\u6a21\u578b\u4f7f\u7528\u6a21\u578b', '\u4f7f\u7528'])
    expect(just.lines[0]!.mode).toBe('just')
    expect(just.lines[0]!.items.map(it => it.x)).toEqual([0, 110, 220, 330, 440, 550])
    const end = just.lines[0]!.items.at(-1)!
    expect(end.x + end.w).toBe(650)
    // a full stop that must go down with its character leaves 140 over four gaps: 35 each, more than 25
    const ragged = placed('\u6a21\u578b\u4f7f\u7528\u6a21\u578b\u3002\u6a21', [640, 1000], 'zh')
    expect(texts(ragged)).toEqual(['\u6a21\u578b\u4f7f\u7528\u6a21', '\u578b\u3002\u6a21'])
    expect(ragged.lines[0]!.mode).toBe('ragged')
    expect(ragged.lines[0]!.items.map(it => it.x)).toEqual([0, 100, 200, 300, 400])
  })

  it('the last line and a centred block are left alone', () => {
    const last = placed('aa bb cc', [1000], 'en')
    expect(last.lines).toHaveLength(1)
    expect(last.lines[0]!.mode).toBe('last')
    expect(last.lines[0]!.items.map(it => it.x)).toEqual([0, 100, 125, 225, 250])
    const centred = placed('\u6a21\u578b', [1000], 'zh', s => { s.centred = true })
    expect(centred.lines[0]!.mode).toBe('centred')
    expect(centred.lines[0]!.items.map(it => it.x)).toEqual([400, 500])
    // a centred block's every line, not only its last
    const two = placed('aa bb cc dd ee ff', [300, 300, 300], 'en', s => { s.centred = true })
    expect(two.lines.map(l => l.mode)).toEqual(['centred', 'centred', 'centred'])
    expect(two.lines[0]!.items[0]!.x).toBe(37.5)
  })

  it('the unit\'s last line is the one lines closed by the end, a forced break or a block', () => {
    const b = placed('aa bb cc dd ee', [490, 1000], 'en')
    expect(b.lines.map(l => l.mode)).toEqual(['just', 'last'])
  })

  it('places a line again the same way', () => {
    const b = placed('aa bb cc dd ee', [490, 1000], 'en')
    const before = JSON.stringify(b)
    placeLines(b, SIZE, { rules: layerRulesFor('en'), target: 'en' })
    expect(JSON.stringify(b)).toBe(before)
  })
})

describe('breaks and blocks', () => {
  it('a break token ends the line', () => {
    const b = lay(tokenize([[0, 'aa bb'], [0, '\n'], [0, 'cc']], 'en'), [1000, 1000, 1000], 'en')
    expect(texts(b)).toEqual(['aa bb', 'cc'])
    expect(b.lines[0]!.mode).toBe('last')
    // a break with nothing before it, and one with nothing after it, leave no empty line
    expect(texts(lay(tokenize([[0, '\n'], [0, 'aa']], 'en'), [1000, 1000], 'en'))).toEqual(['aa'])
    expect(texts(lay(tokenize([[0, 'aa'], [0, '\n']], 'en'), [1000, 1000], 'en'))).toEqual(['aa'])
  })

  it('a block sends what follows below the display', () => {
    const display = { 4: { kind: 'display', segs: [1, 72, 600, 540, 620, 590] } }
    const tokens = tokenize([[0, 'aa '], [1, 4], [0, 'bb cc']], 'en', { unit: { ph: display } })
    const slots = slotsOf([1000, 1000, 1000, 1000], (s, i) => { s.after = i >= 2 ? 1 : 0 })
    const b = breakLines(tokens, slots, SIZE, state(), contextOf('en'))
    expect(texts(b)).toEqual(['aa', 'bb cc'])
    // the line before it is the paragraph's last, and the text after it goes to the first slot below it, past the one beside it
    expect(b.lines[0]!.mode).toBe('last')
    expect(b.lines[1]!.slot).toBe(slots[2])
    expect(b.rest).toBe(0)
    // a display at the start: the text begins below it
    const first = breakLines(tokenize([[1, 4], [0, 'bb']], 'en', { unit: { ph: display } }), slots, SIZE, state(), contextOf('en'))
    expect(first.lines[0]!.slot).toBe(slots[2])
  })

  it('text does not run on below a display it has not reached; it is left over', () => {
    const slots = slotsOf([200, 200, 200], (s, i) => { s.after = i >= 1 ? 1 : 0 })
    const b = breakLines(tokenize('aa bb cc dd', 'en'), slots, SIZE, state(), contextOf('en'))
    expect(texts(b)).toEqual(['aa'])
    expect(b.rest).toBe(3)
  })

  it('text that does not fit its slots is counted, not dropped', () => {
    const b = lay(tokenize('aa bb cc dd', 'en'), [100, 100], 'en')
    expect(texts(b)).toEqual(['aa', 'bb'])
    expect(b.rest).toBe(2)
    const none = lay(tokenize('aa', 'en'), [], 'en')
    expect(none.lines).toEqual([])
    expect(none.rest).toBe(1)
  })

  it('a display after the last text needs no slot', () => {
    const display = { 4: { kind: 'display', segs: [1, 72, 600, 540, 620, 590] } }
    const b = lay(tokenize([[0, 'aa '], [1, 4]], 'en', { unit: { ph: display } }), [1000], 'en')
    expect(texts(b)).toEqual(['aa'])
    expect(b.rest).toBe(0)
  })

  it('a slot of no width holds nothing', () => {
    expect(texts(lay(tokenize('aa bb', 'en'), [0, 1000], 'en'))).toEqual(['aa bb'])
  })
})

describe('overflow', () => {
  const ph = { 5: { kind: 'math', segs: [1, 100, 700, 700, 710, 698] } }

  it('is 0 where every line fits: a hung closing mark and a shifted opening mark are not overflow', () => {
    // the full stop hangs half of itself past the margin of 350
    expect(lay(tokenize('\u6a21\u578b\u4f7f\u3002\u7528', 'zh'), [350, 350], 'zh').overflow).toBe(0)
    // the opening mark is 50 wide and drawn back over its blank half: 50 + 100 + 100 in 250
    const opening = lay(tokenize('\uff08\u6a21\u578b', 'zh'), [250], 'zh', state(1))
    expect(opening.lines[0]!.items[0]).toMatchObject({ w: 50, shift: -50 })
    expect(opening.overflow).toBe(0)
    // spaces at their shortest
    expect(lay(tokenize('aa bb', 'en'), [220], 'en').overflow).toBe(0)
    expect(lay(tokenize('', 'en'), [220], 'en').overflow).toBe(0)
  })

  it('is how far the widest line runs past its slot, in ems of the size, while rest is 0', () => {
    // a formula of 60 ems in a slot of 3: placed alone, nothing left over, and 57 ems too wide
    const tokens = tokenize([[0, 'aa '], [1, 5]], 'en', { unit: { ph } })
    const b = lay(tokens, [300, 300], 'en')
    expect(b.rest).toBe(0)
    expect(b.overflow).toBeCloseTo(57, 10)
    // the same in ems at another size
    expect(breakLines(tokens, slotsOf([30, 30]), 10, state(), contextOf('en')).overflow).toBeCloseTo(57, 10)
    // a word of 26 letters that no character of fits a slot of 10: placed whole
    const word = lay(tokenize('abcdefghijklmnopqrstuvwxyz', 'en'), [10, 10], 'en')
    expect(word.rest).toBe(0)
    expect(word.overflow).toBeCloseTo(12.9, 10)
  })

  it('is the widest of the lines', () => {
    const tokens = tokenize([[0, 'aa '], [1, 5], [0, ' bb ']], 'en', { unit: { ph } })
    // the formula's line is 6000 in 4000: 20 ems; the word is no problem
    expect(lay(tokens, [1000, 4000, 1000], 'en').overflow).toBeCloseTo(20, 10)
    expect(lay(tokens, [1000, 7000, 1000], 'en').overflow).toBe(0)
  })
})

describe('crops and page text', () => {
  const ph = { 5: { kind: 'math', segs: [1, 100, 700, 160, 710, 698] } }
  it('a crop is as wide as its ems times the size, and stays with the word before it', () => {
    // 60 over the unit's size of 10: six ems, 600 at a size of 100
    const tokens = tokenize([[0, 'aa'], [1, 5], [0, ' bb']], 'en', { unit: { ph } })
    const b = lay(tokens, [1000], 'en')
    expect(b.lines[0]!.items.map(it => it.w)).toEqual([100, 600, 25, 100])
    // the word and its formula are one group: they go to the next line together
    expect(texts(lay(tokenize([[0, 'xx aa'], [1, 5], [0, ' bb']], 'en', { unit: { ph } }), [700, 1000], 'en'))).toEqual(['xx', 'aa[5] bb'])
  })

  it('a placeholder wider than its line is placed alone and overflows, never lost', () => {
    const b = lay(tokenize([[0, 'aa '], [1, 5]], 'en', { unit: { ph } }), [300, 300], 'en')
    expect(texts(b)).toEqual(['aa', '[5]'])
    expect(b.lines[1]!.items[0]!.w).toBe(600)
    expect(b.rest).toBe(0)
  })

  it('a placeholder of the page\'s own text is never cut by characters: one wider than its line is placed whole and overflows', () => {
    // a citation read from the page, 20 characters (9 ems), in slots of 6 ems: one item on one line, 3 ems over
    const cite: Token = { kind: 'ph', s: '[12, 13, 14, 15, 16]', script: 'latin', face: 'termes-regular', w: 9, ph: 3, mode: 'page-text', colour: 0, at: 8, len: 1 }
    const tokens = [...tokenize('see the ', 'en'), { kind: 'space', face: 'termes-regular', w: 0.25, colour: 0, at: 7, len: 1 } as Token, cite]
    const b = breakLines(tokens, slotsOf([60, 60, 60]), 10, state(), contextOf('en'))
    expect(texts(b)).toEqual(['see the', '[12, 13, 14, 15, 16]'])
    expect(b.lines[1]!.items.map(it => it.t)).toEqual([cite])
    expect(b.rest).toBe(0)
    expect(b.overflow).toBeCloseTo(3, 10)
    expect(b.tokens.filter(t => t.ph === 3)).toEqual([cite])
  })
})

describe('properties over random text', () => {
  // each target's random translations, in random lines: whatever the text and the widths, every token is placed once and in
  // order, no line is wider than its slot but a single item's, the spaces at a line's ends are gone, and a justified line
  // ends at its slot's right edge. Seeded: the same 300 cases on every run
  let seed = 31
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  const pick = <T,>(items: readonly T[]) => items[Math.floor(rnd() * items.length)]!
  const HAN = [...'\u6a21\u578b\u4f7f\u7528\u5b66']
  const MARKS = [...'\u3002\uff0c\uff08\uff09\u201c\u201d']
  const WORDS = ['aa', 'bbb', 'translation', 'state-of-the-art', 'x', 'internationalization', 'ab/cd', 'zz', 'Donaudampfschiff', '(a', 'b)', ',']
  const KOREAN = ['\ud55c\uad6d\uc5b4', '\ubb38\uc7a5', '\ud14c\uc2a4\ud2b8', '\uc548\ub155\ud558\uc138\uc694']
  const fakeHyphens = (lang: string): Hyphenator => ({ lang, left: 2, right: 2, points: word => [...Array(Math.max(0, word.length - 4)).keys()].filter(p => p >= 2 && p % 3 === 0) })
  const source = (target: string) => {
    let out = ''
    for (let i = 0, n = 5 + Math.floor(rnd() * 60); i < n; i++) {
      if (target === 'ko') out += `${pick(KOREAN)} `
      else if (target === 'en' || target === 'de') out += `${pick(WORDS)} `
      else out += rnd() < 0.1 ? pick(MARKS) : rnd() < 0.2 ? ' BERT ' : pick(HAN)
    }
    return out.trim()
  }

  it('every token is placed once and in order, within its line, and a justified line ends at the edge', () => {
    for (let n = 0; n < 300; n++) {
      const target = pick(['zh', 'ja', 'ko', 'en', 'de', 'zh-Hant'])
      const hyphen = target === 'en' || target === 'de' ? fakeHyphens(target) : null
      const text = source(target)
      const tokens = tokenize(text, target, { hyphen })
      const slots = slotsOf(Array.from({ length: 200 }, () => 600 + Math.floor(rnd() * 900)))
      const compress = pick([0, 1, 2] as const)
      const b = breakLines(tokens, slots, SIZE, state(compress, pick([0, -0.03]), pick([0, -0.01])), contextOf(target, hyphen))
      placeLines(b, SIZE, { rules: layerRulesFor(target), target })
      const label = `${target} ${JSON.stringify(text)}`
      expect(b.rest, label).toBe(0)
      expect(b.overflow, label).toBe(0)
      const placed = b.lines.flatMap(l => l.items.map(it => it.t)).filter(t => t.kind !== 'space')
      expect(placed, label).toEqual(b.tokens.filter(t => t.kind === 'text' || t.kind === 'ph'))
      for (const line of b.lines) {
        const { items } = line
        const natural = items.reduce((sum, it) => sum + it.asp + it.w, 0)
        const spaces = items.filter(it => it.t.kind === 'space').reduce((sum, it) => sum + it.w, 0)
        expect(natural - spaces * (1 - SPACE_MIN), label).toBeLessThanOrEqual(line.slot.x1 - line.slot.x0 + 0.02)
        expect(items[0]!.t.kind, label).not.toBe('space')
        expect(items.at(-1)!.t.kind, label).not.toBe('space')
        if (line.mode === 'just') expect(items.at(-1)!.x + items.at(-1)!.w, label).toBeCloseTo(line.slot.x1, 6)
      }
    }
  })

  it('in Chinese and Japanese no line but the last ends on an opening mark, and none but the first begins with a closing one', () => {
    const NO_START = '\u3002\uff0c\uff09\u201d,.'
    for (let n = 0; n < 150; n++) {
      const target = pick(['zh', 'ja'])
      const b = lay(tokenize(source(target), target), Array.from({ length: 200 }, () => 600 + Math.floor(rnd() * 900)), target, state(pick([0, 1, 2] as const)))
      b.lines.forEach((line, i) => {
        if (i > 0) expect(NO_START.includes(line.items[0]!.t.s![0]!)).toBe(false)
        if (i < b.lines.length - 1) expect(NO_END.includes(line.items.at(-1)!.t.s!.at(-1)!)).toBe(false)
      })
    }
  })
})

describe('determinism', () => {
  it('the same input gives the same lines', () => {
    const german: Hyphenator = { lang: 'de', left: 2, right: 2, points: word => (word.length > 8 ? [4] : []) }
    const cases: [string, string, number[]][] = [
      ['en', 'aa bb cc dd eeeeeeeeee ffffffffffff gg', [490, 600, 300, 300, 300]],
      ['zh', '\u6a21\u578b\uff08\u4f7f\u7528\uff09\u3002BERT\u6a21\u578b\u3002\u201c\u6211\u4eec\u201d\u3002', [450, 500, 800]],
      ['ko', '\ud55c\uad6d\uc5b4 \ubb38\uc7a5 \ud14c\uc2a4\ud2b8 \ud55c\uad6d\uc5b4\ubb38\uc7a5', [400, 450, 300, 300]],
      ['de', 'ein Donaudampfschiff fuhr', [600, 1000, 1000]],
    ]
    for (const [target, source, widths] of cases) {
      const run = () => {
        const tokens = tokenize(source, target, { hyphen: target === 'de' ? german : null })
        const frozen = JSON.stringify(tokens)
        const slots = slotsOf(widths)
        const b = breakLines(tokens, slots, SIZE, state(target === 'zh' ? 1 : 0, target === 'zh' ? -0.02 : 0), contextOf(target, target === 'de' ? german : null))
        placeLines(b, SIZE, { rules: layerRulesFor(target), target })
        // the breaker changes neither its tokens nor its slots
        expect(JSON.stringify(tokens)).toBe(frozen)
        expect(slots).toEqual(slotsOf(widths))
        return JSON.stringify(b)
      }
      expect(run(), target).toBe(run())
    }
  })

  it('gives its answer for tokens and slots that nothing may change', () => {
    const tokens = tokenize('aa bb cc dd eeeeeeeeee', 'en')
    for (const t of tokens) Object.freeze(t)
    Object.freeze(tokens)
    const slots = slotsOf([490, 600]).map(s => Object.freeze(s))
    Object.freeze(slots)
    const b = breakLines(tokens, slots, SIZE, state(), contextOf('en'))
    placeLines(b, SIZE, { rules: layerRulesFor('en'), target: 'en' })
    expect(texts(b)).toEqual(['aa bb cc dd', 'eeeeeeeeee'])
  })
})
