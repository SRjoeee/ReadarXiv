import { beforeAll, describe, expect, it } from 'vitest'
import { plainTranslated } from '@/pdf-reader/engine/translate/mt.mjs'
import { tokens as wordsIn } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { addUnitWords, copyWords, freezeWords, newWords, plainOfPieces, plainTracker, transformMap, wordIndexer } from '@/pdf-reader/engine/layer-proto/words.mjs'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// 1b-E: the page's word table (words.mjs; the 1b design §4). W1: a text token's box lies within its drawn run and its baseline is
// its line's; W2: the copies a word is cut into (a hyphen, a cut by characters) keep its word; W3 and W4 are at the door, below

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
type Piece = { t: string; s?: string; tr?: boolean; src?: string }
const text = (s: string): Piece => ({ t: 'text', tr: true, s })
/** n lines `step` apart down from 500, `width` wide, at size 10 (the step-3 tests' block) */
const block = (n: number, width = 100, step = 12) => {
  const B = Array.from({ length: n }, (_, k) => 500 - step * k)
  return { page: 1, rects: B.map(b => [1, 0, b - 2, width, b + 8]), x0: 0, x1: width, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: step, free: 0, indent: 0, after: 0, centred: false }
}
/** a unit laid: its tokens as tokensOf2 tags them and its layout in one block */
function lay(pieces: Piece[], to: string, blk: ReturnType<typeof block>, P: Record<string, unknown> = {}) {
  const unit = { kind: 'para', pieces }
  const params = { ...resolveRules(BUILTIN_RULES, to).params, ...P }
  const tokens = L2.tokensOf2(unit as never, new Map() as never, to, BASE as never, DESIGNS, params as never, null, undefined, true)
  const layout = L2.layoutUnit2(tokens, [blk] as never, 10, params as never)
  return { unit, tokens, layout, plain: plainOfPieces(pieces as never) }
}
/** the table of a laid unit on page 1, with the word index of its plain text */
function tableOf(l: ReturnType<typeof lay>, id = 7) {
  const W = newWords()
  addUnitWords(W, l.layout, 1, id, wordIndexer(l.plain))
  return W
}

describe('the plain text a token is placed in', () => {
  it("is plainTranslated's: the offsets count what plainTranslated(pieces) has, a non-text piece a space, white space collapsed, trimmed", () => {
    const pieces: Piece[] = [text('  Alpha   beta'), { t: 'ph', src: '$x$' }, text('gamma\n\ndelta  '), { t: 'open', src: '\\textbf{' }, text('  eps'), { t: 'close' }, text(' ')]
    const plain = plainTranslated(pieces as never)
    expect(plainOfPieces(pieces as never)).toBe(plain)
    const tracker = plainTracker()
    const offsets: [string, number][] = []
    for (const p of pieces) {
      if (p.t !== 'text') { tracker.gap(); continue }
      const at = tracker.text(p.s!)
      for (const m of p.s!.matchAll(/\S+/g)) offsets.push([m[0], at[m.index!]!])
    }
    expect(offsets.length).toBe(5)
    for (const [word, at] of offsets) expect(plain.slice(at, at + word.length), word).toBe(word)
  })

  it('is followed through the transformed text: a dash, a quote, a line feed', () => {
    const s = 'a--b---c ``q\'\' d\ne'
    const out = s.replace(/\n/g, ' ').replace(/---/g, '—').replace(/--/g, '–').replace(/``/g, '“').replace(/''/g, '”')
    const m = transformMap(s, out)!
    expect(m).not.toBeNull()
    expect(m.from.length).toBe(out.length)
    // every transformed character starts where its source does
    out.split('').forEach((ch, j) => { if (ch === '–') expect(s.slice(m.from[j], m.from[j]! + 2)).toBe('--'); if (ch === '—') expect(s.slice(m.from[j], m.from[j]! + 3)).toBe('---') })
    expect(transformMap(s, 'something else')).toBeNull()
  })
})

describe('W1: a token lies within its drawn run, on its line\'s baseline', () => {
  it('has the layout\'s x and width, the baseline of the <text> it is drawn in, and the run\'s place', () => {
    // two hundred 0.5 em words of three letters on lines 100 wide: justified lines, several runs a line (a face change)
    const pieces: Piece[] = [text('Aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk '), { t: 'open', src: '\\textbf{' }, text('lll mmm nnn ooo ppp'), { t: 'close' }, text(' qqq rrr sss ttt uuu vvv www.')]
    const l = lay(pieces, 'de', block(4), { hyphen: 0 })
    expect(l.layout.clipped).toBe(false)
    const W = tableOf(l)
    // the drawn markup: one <text> a line, a <tspan> a run
    const H = 1000
    const html = L2.svgOfUnit(l.layout, 1, (x: number, y: number) => [x, H - y], 1, 7)
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${html}</svg>`, 'image/svg+xml')
    const lines = [...doc.querySelectorAll('text')]
    const items = l.layout.lines.map(line => line.items.filter(it => !it.t.space))
    expect(lines.length).toBe(l.layout.lines.length)
    let n = 0
    lines.forEach((el, li) => {
      const spans = [...el.querySelectorAll('tspan')].map(sp => ({ x: Number(sp.getAttribute('x')), y: Number(sp.getAttribute('y')) }))
      expect(Number(el.getAttribute('y'))).toBeCloseTo(H - l.layout.lines[li]!.baseline, 1)
      for (const it of items[li]!) {
        // the token is the next of the table: the layout's own x and x + width, on the line's baseline
        expect(W.l[n]).toBeCloseTo(it.x, 3)
        expect(W.r[n]).toBeCloseTo(it.x + it.w, 3)
        expect(W.y[n]).toBeCloseTo(l.layout.lines[li]!.baseline, 3)
        // its run: the last tspan that starts at or before it, which ends at or after its right edge (the next starts after)
        const k = spans.reduce((a, sp, i) => (sp.x <= W.l[n]! + 0.01 ? i : a), -1)
        expect(k, `token ${n}`).toBeGreaterThanOrEqual(0)
        expect(H - spans[k]!.y).toBeCloseTo(W.y[n]!, 1)
        if (k + 1 < spans.length) expect(W.r[n]!).toBeLessThanOrEqual(spans[k + 1]!.x + 0.01)
        n++
      }
    })
    expect(W.n).toBe(n)
    expect(n).toBeGreaterThan(20)
    // the size drawn, and the face's ascent and descent around the baseline
    for (let i = 0; i < W.n; i++) {
      expect(W.h[i]).toBeCloseTo(l.layout.f, 3)
      expect(W.top[i]! - W.y[i]!).toBeCloseTo(0.75 * W.h[i]!, 2)
      expect(W.y[i]! - W.bottom[i]!).toBeCloseTo(0.22 * W.h[i]!, 2)
    }
  })

  it('gives each word the index of its word in the translation: a word with a mark before it is its word, a mark alone has none', () => {
    const l = lay([text('(Alpha) beta, [gamma] -- delta')], 'de', block(2), { hyphen: 0 })
    const W = tableOf(l)
    const words = wordsIn(l.plain)
    expect(words.map(w => w.t)).toEqual(['alpha', 'beta', 'gamma', 'delta'])
    const drawn = l.layout.lines.flatMap(line => line.items.filter(it => !it.t.space)).map(it => it.t.s)
    expect(drawn).toEqual(['(Alpha)', 'beta,', '[gamma]', '–', 'delta'])
    expect([...W.word.slice(0, W.n)]).toEqual([0, 1, 2, -1, 3])
  })

  it('has the characters of a Chinese unit one word each, a mark between them none', () => {
    const l = lay([text('\u6a21\u578b\uff0c\u6570\u636e\u3002AI \u7684 5% \u589e\u957f')], 'zh', block(1, 300))
    const W = tableOf(l)
    const drawn = l.layout.lines.flatMap(line => line.items.filter(it => !it.t.space)).map(it => it.t.s)
    const words = wordsIn(l.plain).map(w => w.t)
    expect(words).toEqual(['\u6a21', '\u578b', '\u6570', '\u636e', 'ai', '\u7684', '5', '\u589e', '\u957f'])
    // every drawn token is a character, a mark or a Latin word: its word is the entry that starts at it
    const index = [...W.word.slice(0, W.n)]
    expect(drawn.length).toBe(index.length)
    let next = 0
    drawn.forEach((s, i) => {
      if (/^[\u3001-\u303f\uff00-\uffef]+$/.test(s!)) expect(index[i], s).toBe(-1)
      else expect(index[i], s).toBe(next++)
    })
    expect(next).toBe(words.length)
  })

  it('draws a placeholder\'s rendering, a lead and a label as tokens with no word, and tags no piece it cannot place', () => {
    // a translated piece and a source piece whose shown text is not what is drawn (a TeX escape): the escaped one is tagged with none
    const l = lay([text('Alpha beta'), { t: 'text', tr: true, s: 'gamma \\# delta' }], 'de', block(2), { hyphen: 0 })
    const tagged = l.tokens.filter(t => t.s).map(t => [t.s, t.at, t.end])
    expect(tagged.slice(0, 2)).toEqual([['Alpha', 0, 5], ['beta', 6, 10]])
    expect(tagged.slice(2).every(([, at]) => at === undefined)).toBe(true)
  })
})

describe('W2: the copies a word is cut into keep its word', () => {
  it('shares the word index between a hyphenated word\'s head and tail', () => {
    // patterns for one word, and a line that does not hold it: it is broken with a hyphen
    L2.setHyphenData('de', { pats: new Map(), exceptions: new Map([['typesetting', 'type-set-ting']]), maxLen: 2 } as never)
    const pieces: Piece[] = [text('Aaa bbb typesetting ccc')]
    const l = lay(pieces, 'de', block(3, 75), { hyphen: 1 })
    const heads = l.layout.lines.flatMap(line => line.items).filter(it => it.t.hyphenated)
    expect(heads.length, 'a hyphenated word').toBeGreaterThan(0)
    const W = tableOf(l)
    const toks = l.layout.lines.flatMap(line => line.items.filter(it => !it.t.space).map(it => it.t))
    const idx = [...W.word.slice(0, W.n)]
    const pieceIdx = toks.map((t, i) => [t.s, idx[i]] as const).filter(([s]) => /^(type|set|ting|typeset|setting|typesetting)/.test(s!) || /-$/.test(s!))
    // every copy of the word (head with its hyphen, tail) is word 2: Aaa 0, bbb 1, typesetting 2, ccc 3
    expect(pieceIdx.length).toBeGreaterThanOrEqual(2)
    for (const [, w] of pieceIdx) expect(w).toBe(2)
    expect(idx[toks.length - 1]).toBe(3)
  })

  it('shares it between the parts of a word cut by characters (nothing on the line yet, longer than it)', () => {
    const pieces: Piece[] = [text('see abcdefghijklmnopqrstuvwxyz end')]
    const l = lay(pieces, 'de', block(8, 40), { hyphen: 0 })
    const toks = l.layout.lines.flatMap(line => line.items.filter(it => !it.t.space).map(it => it.t))
    const W = tableOf(l)
    const idx = [...W.word.slice(0, W.n)]
    const cut = toks.map((t, i) => [t.s, idx[i]] as const).filter(([s]) => /^[a-z]{2,}$/.test(s!) && s !== 'see' && s !== 'end')
    expect(cut.length).toBeGreaterThan(1)
    for (const [, w] of cut) expect(w).toBe(1)
    expect(toks.at(-1)!.s).toBe('end')
    expect(idx.at(-1)).toBe(2)
  })
})

describe('the word index', () => {
  it('is the entry that covers a range, or the first that starts inside it', () => {
    const w = wordIndexer('one two,  three')
    expect(w(0, 3)).toBe(0)
    expect(w(1, 3)).toBe(0)
    expect(w(4, 8)).toBe(1)
    // the comma alone
    expect(w(7, 8)).toBe(-1)
    expect(w(9, 14)).toBe(2)
    // a mark before a word
    expect(wordIndexer('x (one)')(2, 7)).toBe(1)
  })

  it('counts in the folded text where NFKC spells characters out: an ellipsis, a ligature', () => {
    const plain = 'a… b ﬁx c'
    expect(plain.normalize('NFKC').length).not.toBe(plain.length)
    const w = wordIndexer(plain)
    const at = (s: string) => plain.indexOf(s)
    expect(wordsIn(plain).map(x => x.t)).toEqual(['a', 'b', 'fix', 'c'])
    expect(w(at('b'), at('b') + 1)).toBe(1)
    expect(w(at('ﬁx'), at('ﬁx') + 2)).toBe(2)
    expect(w(at('c'), at('c') + 1)).toBe(3)
  })
})

describe('the record', () => {
  it('is frozen to the tokens, a copy shares no array with it, and a page with none painted has an empty table', () => {
    const l = lay([text('Aaa bbb ccc')], 'de', block(1), { hyphen: 0 })
    const W = tableOf(l, 3)
    const rec = freezeWords(W, new Set([9, 4]))
    expect(rec.tokens.n).toBe(3)
    expect(rec.tokens.l.length).toBe(3)
    expect(rec.word.length).toBe(3)
    expect(rec.spans).toEqual([[3, [0, 3]]])
    expect(rec.original).toEqual([4, 9])
    const copy = copyWords(rec)
    expect(copy).toEqual(rec)
    for (const k of ['l', 'r', 'y', 'h', 'top', 'bottom'] as const) expect(copy.tokens[k]).not.toBe(rec.tokens[k])
    expect(copy.word).not.toBe(rec.word)
    expect(copy.spans[0]![1]).not.toBe(rec.spans[0]![1])
    const empty = freezeWords(null, [])
    expect(empty).toEqual({ tokens: { n: 0, l: new Float32Array(0), r: new Float32Array(0), y: new Float32Array(0), h: new Float32Array(0), top: new Float32Array(0), bottom: new Float32Array(0) }, word: new Int32Array(0), spans: [], original: [] })
  })
})
