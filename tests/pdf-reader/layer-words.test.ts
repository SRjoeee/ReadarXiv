import { beforeAll, describe, expect, it } from 'vitest'
import { plainTranslated } from '@/pdf-reader/engine/translate/mt.mjs'
import { tokens as wordsIn } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { addUnitWords, copyWords, escapeMap, freezeWords, newWords, pieceOffsets, plainOfPieces, plainTracker, transformMap, wordIndexer } from '@/pdf-reader/engine/layer-proto/words.mjs'
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

  it('draws a translated piece with TeX\'s escapes undone and maps it through them, and tags a source piece drawn other than shown with none', () => {
    // `\\%` is drawn and shown as `%`; `\\textbackslash{}` drawn as a backslash, shown as a space (2610.30854v1's affiliation:
    // Microsoft's "CAD&CG", escaped for TeX as every translation is, was drawn "CAD\\&CG")
    const l = lay([text('Alpha 50\\% and \\textbackslash{} beta'), { t: 'text', s: ' caf\u00c3\u00a9 gamma' }], 'de', block(2), { hyphen: 0 })
    expect(l.plain).toBe('Alpha 50% and beta caf\u00e9 gamma')
    const toks = l.tokens.filter(t => t.s)
    const at = (s: string) => toks.find(t => t.s === s)
    expect([at('50%')!.at, at('50%')!.end]).toEqual([6, 9])
    expect([at('beta')!.at, at('beta')!.end]).toEqual([l.plain.indexOf('beta'), l.plain.indexOf('beta') + 4])
    // the word of the escaped number is the number (word 1), the rest follow in the translation's order
    const W = tableOf(l)
    const drawn = l.layout.lines.flatMap(line => line.items.filter(it => !it.t.space)).map(it => it.t.s)
    expect(drawn.slice(0, 4)).toEqual(['Alpha', '50%', 'and', '\\'])
    expect(lay([text('\u56fd\u5bb6\u91cd\u70b9\u5b9e\u9a8c\u5ba4 CAD\\&CG')], 'zh', block(2)).tokens.filter(t => t.s).map(t => t.s).join('')).toBe('\u56fd\u5bb6\u91cd\u70b9\u5b9e\u9a8c\u5ba4CAD&CG')
    // (an escape's backslash drawn is no escape again: `\\textbackslash{}\\%` is a backslash and a percent sign)
    expect(lay([text('a \\textbackslash{}\\% b')], 'de', block(2)).tokens.filter(t => t.s).map(t => t.s)).toEqual(['a', '\\%', 'b'])
    expect([...W.word.slice(0, 2)]).toEqual([0, 1])
    // (the source piece's bytes are drawn as they are, which is not what the PDF shows: none of its tokens is tagged)
    expect(toks.filter(t => /caf|gamma/.test(t.s!)).every(t => t.at === undefined)).toBe(true)
    expect(escapeMap('a\\%b', 'a%b')).toEqual(new Int32Array([0, 1, 1, 2]))
    expect(escapeMap('a\\%b', 'a b')).toBeNull()
  })

  it('gives a token of escapes that are shown as white space no place: it is no word, and the next word keeps its own', () => {
    for (const [raw, shown] of [['\\textbackslash{}', ' '], ['\\textasciitilde{}', ' '], ['\\textasciicircum{}', ' ']] as const) {
      const l = lay([text(`end. ${raw} Next`)], 'de', block(2), { hyphen: 0 })
      expect(l.plain, shown).toBe('end. Next')
      const lone = l.tokens.find(t => t.s === { '\\textbackslash{}': '\\', '\\textasciitilde{}': '~', '\\textasciicircum{}': '^' }[raw])!
      expect([lone.at, lone.end]).toEqual([undefined, undefined])
      const W = tableOf(l)
      expect([...W.word.slice(0, W.n)], raw).toEqual([0, -1, 1])
    }
  })

  it('draws a lead, a label and a placeholder\'s rendering as tokens with no word', () => {
    const unit = { kind: 'para', pieces: [text('Alpha beta')] }
    const params = { ...resolveRules(BUILTIN_RULES, 'de').params, hyphen: 0 }
    const lead = { parts: [{ text: 'Proof.', st: {} }], gap: 0.5 }
    const tokens = L2.tokensOf2(unit as never, new Map() as never, 'de', BASE as never, DESIGNS, params as never, lead as never, undefined, true)
    const layout = L2.layoutUnit2(tokens, [block(2)] as never, 10, params as never)
    const W = newWords()
    addUnitWords(W, layout, 1, 7, wordIndexer(plainOfPieces(unit.pieces as never)))
    expect([...W.word.slice(0, W.n)]).toEqual([-1, 0, 1])
    // (the lead has no place of its own in the translation: the text's after it)
    expect([...W.at.slice(0, W.n)]).toEqual([0, 0, 6])
    // the lead's last token is the text alone: not the original's glue after it (0.5 em of the unit's size)
    const items = layout.lines[0]!.items.filter(it => !it.t.space)
    expect(items[0]!.t.kern).toBe(true)
    expect(W.r[0]! - W.l[0]!).toBeCloseTo(items[0]!.w - 0.5 * layout.f, 3)
    expect(W.r[0]! - W.l[0]!).toBeCloseTo(0.5 * 6 * layout.f, 3)
  })
})

describe('W1 extended: the boxes of marks, tracking, superscripts, crops and kept lines', () => {
  it('holds a compressed opening mark in its slot, so that the tokens of a Chinese line tile', () => {
    // an opening mark at the line\'s start loses its blank half, and is drawn half an em left of its slot (into the margin)
    const l = lay([text('\u300c\u6a21\u578b\u300d\u6570\u636e')], 'zh', block(1, 300))
    const items = l.layout.lines[0]!.items.filter(it => !it.t.space)
    expect(items[0]!.t.punct).toBe('open')
    expect((items[0] as { shift?: number }).shift).toBeLessThan(0)
    const W = tableOf(l)
    // the slot starts at the line\'s start, not in the margin before it; the glyph is drawn at it.x
    expect(items[0]!.x).toBeLessThan(0)
    expect(W.l[0]).toBeCloseTo(0, 3)
    expect(W.r[0]).toBeCloseTo(items[0]!.w, 3)
    for (let i = 1; i < W.n; i++) expect(W.l[i]!, `token ${i}`).toBeCloseTo(W.r[i - 1]!, 3)
    // a CJK token has the em box
    expect(W.top[1]! - W.y[1]!).toBeCloseTo(0.88 * W.h[1]!, 3)
    expect(W.y[1]! - W.bottom[1]!).toBeCloseTo(0.12 * W.h[1]!, 3)
  })

  it('has the width the layout gives under tracking', () => {
    const l = lay([text('\u6a21\u578b\u6570\u636e')], 'zh', block(1, 300), { trackStart: -0.04 })
    const W = tableOf(l)
    expect(l.layout.state.track).toBeCloseTo(-0.04, 5)
    // a character is half an em in the test\'s measure, less the tracking
    for (let i = 0; i < W.n; i++) expect(W.r[i]! - W.l[i]!).toBeCloseTo((0.5 - 0.04) * l.layout.f, 3)
  })

  it('draws a superscript on the baseline it is drawn on, at its size', () => {
    const unit = { kind: 'para', pieces: [text('Alpha '), { t: 'ph', src: '$^2$' }, text(' beta')] }
    const params = { ...resolveRules(BUILTIN_RULES, 'de').params, hyphen: 0 }
    const resolved = new Map([[1, { mode: 'orig-text', text: '2', sup: true }]])
    const tokens = L2.tokensOf2(unit as never, resolved as never, 'de', BASE as never, DESIGNS, params as never, null, undefined, true)
    const layout = L2.layoutUnit2(tokens, [block(2)] as never, 10, params as never)
    const W = newWords()
    addUnitWords(W, layout, 1, 7, wordIndexer(plainOfPieces(unit.pieces as never)))
    const by = layout.lines[0]!.baseline
    const sup = layout.lines.flatMap(line => line.items).findIndex(it => it.t.sup)
    expect(sup).toBeGreaterThanOrEqual(0)
    const k = layout.lines.flatMap(line => line.items).slice(0, sup + 1).filter(it => !it.t.space).length - 1
    expect(W.y[k]!).toBeCloseTo(by + 0.36 * layout.f, 3)
    expect(W.h[k]!).toBeCloseTo(0.62 * layout.f, 3)
    expect(W.word[k]).toBe(-1)
  })

  it('draws a crop at its drawn box where it is drawn, and none where its page is not', () => {
    const unit = { kind: 'para', pieces: [text('Alpha '), { t: 'ph', src: '$x$' }, text(' beta')] }
    const params = { ...resolveRules(BUILTIN_RULES, 'de').params, hyphen: 0 }
    const crop = { mode: 'crop', crop: [0, 100, 20, 112], baseline: 102, page: 1, text: 'x' }
    const tokens = L2.tokensOf2(unit as never, new Map([[1, crop]]) as never, 'de', BASE as never, DESIGNS, params as never, null, undefined, true)
    const layout = L2.layoutUnit2(tokens, [block(2)] as never, 10, params as never)
    const line = layout.lines.find(x => x.items.some(it => it.t.crop))!
    const item = line.items.find(it => it.t.crop)!
    const all = newWords()
    addUnitWords(all, layout, 1, 7, wordIndexer('Alpha beta'))
    const none = newWords()
    addUnitWords(none, layout, 1, 7, wordIndexer('Alpha beta'), [], () => false)
    expect(none.n).toBe(all.n - 1)
    const at = layout.lines.flatMap(x => x.items).filter(it => !it.t.space).indexOf(item)
    expect([all.l[at], all.r[at]]).toEqual([Math.fround(item.x), Math.fround(item.x + item.w)])
    expect(all.h[at]!).toBeCloseTo(12 * layout.scale, 3)
    expect(all.top[at]!).toBeCloseTo(line.baseline + (112 - 102) * layout.scale, 3)
    expect(all.top[at]! - all.bottom[at]!).toBeCloseTo(all.h[at]!, 3)
    expect(all.word[at]).toBe(-1)
  })

  it('appends a kept line with no place in the text\'s flow at its original rectangle, after the drawn lines, in its span', () => {
    const l = lay([text('Alpha beta')], 'de', block(1), { hyphen: 0 })
    const W = newWords()
    addUnitWords(W, l.layout, 1, 7, wordIndexer(l.plain), [{ x0: 10, x1: 90, baseline: 300, size: 10, top: 308, bottom: 298 }])
    expect(W.n).toBe(3)
    expect([W.l[2], W.r[2], W.y[2], W.top[2], W.bottom[2], W.word[2]]).toEqual([10, 90, 300, 308, 298, -1])
    expect(W.spans).toEqual([[7, [0, 3]]])
    expect(L2.keptLines([[1, 10, 298, 90, 308], [2, 10, 298, 90, 308]], { keep: ['1|10,298,90,308'], lineInfo: new Map([['1|10,298,90,308', { baseline: 300, size: 10 }]]) } as never, 1)).toEqual([{ x0: 10, x1: 90, baseline: 300, size: 10, top: 308, bottom: 298 }])
  })
})

/** a block of `n` lines from baseline `y0` down, 100 wide at size 10, `after` the unit's kept regions before it */
const blockAt = (y0: number, n: number, after: number) => {
  const B = Array.from({ length: n }, (_, k) => y0 - 12 * k)
  return { page: 1, rects: B.map(b => [1, 0, b - 2, 100, b + 8]), x0: 0, x1: 100, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after, centred: false }
}
/** a displayed formula's kept line at baseline y, and its key */
const keptRect = (y: number) => [1, 20, y - 2, 80, y + 8]
const keyOf = (r: number[]) => `${r[0]}|${r.slice(1).join()}`
/**
 * A unit laid with its displays kept between its blocks, as prepareUnit's finish leaves them: each display a kept placeholder
 * whose region is its kept line's (`regionOf`, `referenced`), the text after it starting below it (tokensOf2's `blockTo`)
 */
function layDisplays(pieces: Piece[], blocks: ReturnType<typeof blockAt>[], displays: { k: number; y: number; region: number }[], P: Record<string, unknown> = {}) {
  const prep = new Map<number, object>(displays.map(d => [d.k, { mode: 'kept', cls: 'display', region: d.region, text: '' }])) as Map<number, object> & Record<string, unknown>
  const rects = displays.map(d => keptRect(d.y))
  Object.assign(prep, {
    keep: rects.map(keyOf), referenced: new Set(displays.map(d => d.region)),
    regionOf: new Map(rects.map((r, i) => [keyOf(r), displays[i]!.region])), lineInfo: new Map(rects.map((r, i) => [keyOf(r), { baseline: displays[i]!.y, size: 10 }])),
  })
  const params = { ...resolveRules(BUILTIN_RULES, 'de').params, hyphen: 0, ...P }
  const unit = { kind: 'para', pieces }
  const tokens = L2.tokensOf2(unit as never, prep as never, 'de', BASE as never, DESIGNS, params as never, null, undefined, true)
  const layout = L2.layoutUnit2(tokens, blocks as never, 10, params as never)
  // the unit's rectangles in its order: each block's lines, a display's kept line where it stands between them
  const all = [...blocks.flatMap(b => b.rects), ...rects].sort((a, b) => b[4]! - a[4]!)
  const W = newWords()
  addUnitWords(W, layout, 1, 7, wordIndexer(plainOfPieces(pieces as never)), L2.keptLines(all, prep as never, 1, blocks), () => true, pieceOffsets(pieces as never))
  const plain = plainOfPieces(pieces as never)
  // each token: its text (a kept line's its baseline), its word and its place
  const drawn = layout.lines.flatMap(line => line.items.filter(it => !it.t.space).map(it => it.t.s as string))
  let d = 0
  const rows = Array.from({ length: W.n }, (_, i) => [W.word[i]! >= 0 || W.y[i]! > 0 && displays.every(x => x.y !== W.y[i]) ? drawn[d++]! : `kept ${W.y[i]}`, W.word[i], W.at[i]] as const)
  return { layout, W, plain, rows }
}

describe('the table in the text\'s order, each token with its place in the translation', () => {
  it('writes a display between the text before it and the text after it: "A. B $$x$$ C. D."', () => {
    const pieces: Piece[] = [text('A. B '), { t: 'ph', src: '$$x$$' }, text(' C. D.')]
    const { layout, plain, rows } = layDisplays(pieces, [blockAt(500, 1, 0), blockAt(456, 1, 1)], [{ k: 1, y: 470, region: 0 }])
    expect(layout.clipped).toBe(false)
    expect(layout.lines.map(l => l.past)).toEqual([0, 1])
    expect(plain).toBe('A. B C. D.')
    // the display's place is the space its piece becomes: in the sentence of the text around it
    expect(rows).toEqual([['A.', 0, 0], ['B', 1, 3], ['kept 470', -1, 4], ['C.', 2, 5], ['D.', 3, 8]])
  })

  it('writes each of several displays where its text passes it', () => {
    const pieces: Piece[] = [text('Aaa '), { t: 'ph', src: '$$x$$' }, text(' bbb. Ccc '), { t: 'ph', src: '$$y$$' }, text(' ddd.')]
    const { rows } = layDisplays(pieces, [blockAt(500, 1, 0), blockAt(456, 1, 1), blockAt(412, 1, 2)], [{ k: 1, y: 470, region: 0 }, { k: 3, y: 426, region: 1 }])
    expect(rows).toEqual([['Aaa', 0, 0], ['kept 470', -1, 3], ['bbb.', 1, 4], ['Ccc', 2, 9], ['kept 426', -1, 12], ['ddd.', 3, 13]])
  })

  it('writes a display the text runs on above (\'flow\') where the walk passed it, not by the slots\' order', () => {
    // three lines above the display, one below it: the text after it does not fit below, and runs on above it
    const pieces: Piece[] = [text('Aaa '), { t: 'ph', src: '$$x$$' }, text(' bbb ccc ddd eee fff ggg hhh iii jjj kkk lll mmm nnn')]
    const { layout, rows } = layDisplays(pieces, [blockAt(500, 3, 0), blockAt(440, 1, 1)], [{ k: 1, y: 464, region: 0 }], { flowPast: true })
    expect(layout.clipped).toBe(false)
    expect(layout.spilled).toBe(true)
    // the lines after the display stand on the slots above it (block 0) and on the one below it (block 1)
    expect(layout.lines.map(l => [l.block, l.past])).toEqual([[0, 0], [0, 1], [0, 1], [1, 1]])
    expect(rows.map(r => r[0]).slice(0, 3)).toEqual(['Aaa', 'kept 464', 'bbb'])
    expect(rows.map(r => r[2])).toEqual([...rows.map(r => r[2])].sort((a, b) => a! - b!))
  })

  it('writes a kept line no placeholder holds before the first line of the block that follows it in the unit\'s lines', () => {
    const blocks = [blockAt(500, 1, 0), blockAt(476, 1, 0)]
    const l = L2.layoutUnit2(L2.tokensOf2({ kind: 'para', pieces: [text('Aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk lll mmm')] } as never, new Map() as never, 'de', BASE as never, DESIGNS, { ...resolveRules(BUILTIN_RULES, 'de').params, hyphen: 0 } as never, null, undefined, true), blocks as never, 10, { ...resolveRules(BUILTIN_RULES, 'de').params, hyphen: 0 } as never)
    expect(l.lines.map(x => x.block)).toEqual([0, 1])
    const own = keptRect(488)
    const rects = [blocks[0]!.rects[0]!, own, blocks[1]!.rects[0]!]
    const kept = L2.keptLines(rects, { keep: [keyOf(own)], lineInfo: new Map([[keyOf(own), { baseline: 488, size: 10 }]]) } as never, 1, blocks)
    expect(kept).toEqual([{ x0: 20, x1: 80, baseline: 488, size: 10, top: 496, bottom: 486, block: 1 }])
    const W = newWords()
    addUnitWords(W, l as never, 1, 7, wordIndexer('Aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk lll mmm'), kept)
    const ys = [...W.y.slice(0, W.n)]
    const first = l.lines[0]!.items.filter(it => !it.t.space).length
    expect(ys[first]).toBe(488)
    // its place: the text's before it (it is no placeholder's)
    expect(W.at[first]).toBe(W.at[first - 1])
  })

  it('gives every part of a formula TeX broke over lines its placeholder\'s place, each part its own token in line order', () => {
    // (the engine lane's E3 shape: one crop token a part, `crop.part`, the same `k`; a laid item's width its own, its kern apart)
    const pieces: Piece[] = [text('Aaa '), { t: 'ph', src: '$a+b+c$' }, text(' bbb')]
    const face = { size: 1 }, st = BASE
    const crop = (part: number, x0: number) => ({ mode: 'crop', k: 1, src: '$a+b+c$', cls: 'inline', page: 1, crop: [x0, 490, x0 + 30, 510], baseline: 500, part, text: part ? '' : 'a+b+c' })
    const L = {
      f: 10, scale: 1,
      lines: [
        { page: 1, block: 0, baseline: 500, past: 0, items: [{ t: { s: 'Aaa', st, face, cls: 'latin', at: 0, end: 3, kernW: 20 }, x: 0, w: 15, kern: 2 }, { t: { space: true }, x: 17, w: 3 }, { t: { crop: crop(0, 70), cw: 30, glue: false, w100: 0 }, x: 20, w: 30 }] },
        { page: 1, block: 0, baseline: 488, past: 0, items: [{ t: { crop: crop(1, 10), cw: 30, glue: false, w100: 0 }, x: 0, w: 30 }, { t: { space: true }, x: 30, w: 3 }, { t: { s: 'bbb', st, face, cls: 'latin', at: 4, end: 7 }, x: 33, w: 15 }] },
      ],
    }
    const W = newWords()
    addUnitWords(W, L as never, 1, 7, wordIndexer(plainOfPieces(pieces as never)), [], () => true, pieceOffsets(pieces as never))
    expect(W.n).toBe(4)
    expect([...W.at.slice(0, 4)]).toEqual([0, 3, 3, 4])
    expect([...W.word.slice(0, 4)]).toEqual([0, -1, -1, 1])
    expect([...W.y.slice(0, 4)]).toEqual([500, 500, 488, 488])
    // a token's slot is its own width: the kern after it is no part of it
    expect([W.l[0], W.r[0]]).toEqual([0, 15])
  })

  it('places each piece in the plain text: a text piece by its first character, any other by the space it becomes', () => {
    const pieces: Piece[] = [{ t: 'ph', src: '$x$' }, text('  Alpha. '), { t: 'ph', src: '\\cite{a}' }, { t: 'open', src: '\\textbf{' }, text('Beta'), { t: 'close' }, text(' '), { t: 'ph', src: '$y$' }]
    const plain = plainOfPieces(pieces as never)
    expect(plain).toBe('Alpha. Beta')
    // (the close and the placeholder after the last word: the space after it, which the plain text trims; a blank piece: where
    // the text goes on)
    expect([...pieceOffsets(pieces as never)]).toEqual([0, 0, 6, 6, 7, 11, 12, 11])
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

  it('counts in the folded text where NFKC spells characters out: an ellipsis, a ligature, combining marks', () => {
    const plain = 'a\u2026 b \ufb01x c e\u0301\u0302 d'
    expect(plain.normalize('NFKC').length).not.toBe(plain.length)
    const w = wordIndexer(plain)
    const at = (s: string) => plain.indexOf(s)
    expect(wordsIn(plain).map(x => x.t)).toEqual(['a', 'b', 'fix', 'c', '\u00e9', 'd'])
    expect(w(at('b'), at('b') + 1)).toBe(1)
    expect(w(at('\ufb01x'), at('\ufb01x') + 2)).toBe(2)
    expect(w(at('c'), at('c') + 1)).toBe(3)
    expect(w(at('e\u0301'), at('e\u0301') + 3)).toBe(4)
    expect(w(at('d'), at('d') + 1)).toBe(5)
  })

  it('is -1 for every range of a text it cannot map exactly: a sequence that composes across clusters', () => {
    // Hangul jamo compose into a syllable across code points that are no marks
    const plain = 'a \u1100\u1161 b'
    expect(plain.normalize('NFKC')).not.toBe(plain)
    const w = wordIndexer(plain)
    expect([w(0, 1), w(2, 4), w(5, 6)]).toEqual([-1, -1, -1])
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
    expect(copy.at).not.toBe(rec.at)
    expect([...rec.at]).toEqual([0, 4, 8])
    expect(empty).toEqual({ tokens: { n: 0, l: new Float32Array(0), r: new Float32Array(0), y: new Float32Array(0), h: new Float32Array(0), top: new Float32Array(0), bottom: new Float32Array(0) }, word: new Int32Array(0), at: new Int32Array(0), spans: [], original: [], rows: [] })
    // (the rows of each unit the layout lays on the page, by id, each a copy: where a copy of the left's tokens may stand)
    const withRows = freezeWords(W, [], [[9, [1, 2, 3, 4]], [3, [0, 0, 5, 5, 0, 6, 5, 11]]])
    expect(withRows.rows).toEqual([[3, [0, 0, 5, 5, 0, 6, 5, 11]], [9, [1, 2, 3, 4]]])
    expect(copyWords(withRows).rows).toEqual(withRows.rows)
    expect(copyWords(withRows).rows?.[0]?.[1]).not.toBe(withRows.rows?.[0]?.[1])
  })
})
